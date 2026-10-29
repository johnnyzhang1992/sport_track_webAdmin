import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  DialogPlugin,
  Input,
  InputNumber,
  MessagePlugin,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'tdesign-react'
import {
  adminApi,
  type PointGrantResult,
  type PointIssuanceRow,
  type PointIssuanceSource,
  type PointItemRow,
  type PointItemStockState,
  type PointItemsOverview,
  type PointOrderRow,
  type PointOrderStatus,
} from '../api'
import PointsItemFormDialog from '../components/PointsItemFormDialog'
import PointsGrantDialog from '../components/PointsGrantDialog'
import { fmtDateTime } from '../utils/format'

const PAGE_SIZE = 20

/** 未加载显示 '—'（0 是「真的是零」，两者不能混） */
const fmtNum = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString())

/** InputNumber 清空时给 undefined/''：保留原值，别把 NaN 一路写进请求体 */
const numOr = (v: number | string | undefined, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const SOURCE_OPTIONS = [
  { label: '全部来源', value: '' },
  { label: '兑换', value: 'exchange' },
  { label: '后台手动', value: 'admin' },
  { label: '系统赠送', value: 'system' },
]

const CARD_STATUS_THEME: Record<string, 'primary' | 'default' | 'danger'> = {
  unused: 'primary',
  used: 'default',
  expired: 'danger',
}

/** 订单状态 Tag 配色：待发货要显眼（那是欠着用户的货），已发货中性，已完成弱化 */
const ORDER_STATUS_THEME: Record<PointOrderStatus, 'warning' | 'primary' | 'default'> = {
  pending_ship: 'warning',
  shipped: 'primary',
  completed: 'default',
}

const ORDER_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待发货', value: 'pending_ship' },
  { label: '已发货', value: 'shipped' },
  { label: '已完成', value: 'completed' },
]

/** 快递公司常用几家给下拉；不在表里的填「其他」并在单号前带上公司名（单号本身不解析） */
const TRACKING_COMPANIES = ['顺丰', '京东物流', '中通', '圆通', '申通', '韵达', '邮政EMS', '其他']

/** 效果列：makeup 是补签卡；ad_free 必须把天数写出来（天数来自目录快照） */
const effectText = (row: PointItemRow) =>
  row.effect.kind === 'makeup' ? '补签' : `免广告 ${row.effect.days} 天`

/** 库存状态文案：不限量时数字只是展示位，别让人以为库存是真的 */
const stockText = (s: PointItemStockState) => `${s.stock.toLocaleString()}${s.unlimited ? '（不限量）' : ''}`

/** 导出文件名用北京时间的「当天」：名单按东八区日期分桶，文件名必须与数据同一天（设备时区在近午夜会差一天） */
function beijingTodayStr(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/**
 * 积分道具页（Task 13）：概况 + 道具目录 + 发放记录 + 免广告名单导出。
 * 概况六格全部取 /admin/points/items/overview，前端不另算任何指标。
 */
export default function PointsItems() {
  const [overview, setOverview] = useState<PointItemsOverview | null>(null)
  const [items, setItems] = useState<PointItemRow[]>([])
  // 首次取数成功前不显示「0」：0 是「真的是零」，未加载不等于零
  const [itemsLoaded, setItemsLoaded] = useState(false)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [tab, setTab] = useState('items')

  // 弹窗：新建/编辑（row=null 新建）、改库存/每日投放、发放
  const [formState, setFormState] = useState<{ row: PointItemRow | null } | null>(null)
  const [stockEdit, setStockEdit] = useState<{
    row: PointItemRow
    stock: number
    unlimited: boolean
    /** 每日投放总量：0 = 不限 */
    dailyQuota: number
    /** 每人每日上限：0 = 不限 */
    perUserDaily: number
  } | null>(null)
  const [stockSaving, setStockSaving] = useState(false)
  const [grantItem, setGrantItem] = useState<PointItemRow | null>(null)

  // 发放记录（服务端分页；来源/道具筛选）
  const [issuances, setIssuances] = useState<PointIssuanceRow[]>([])
  const [issTotal, setIssTotal] = useState(0)
  const [issPage, setIssPage] = useState(1)
  const [issLoading, setIssLoading] = useState(false)
  const [issSource, setIssSource] = useState('')
  const [issItemKey, setIssItemKey] = useState('')
  const [issReload, setIssReload] = useState(0)

  const [exporting, setExporting] = useState(false)

  const loadItems = () => {
    setItemsLoading(true)
    adminApi
      .pointsItems()
      .then((rows) => {
        setItems(rows)
        setItemsLoaded(true)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => setItemsLoading(false))
  }

  const loadOverview = () => {
    adminApi
      .pointItemsOverview()
      .then(setOverview)
      .catch((e) => MessagePlugin.error((e as Error).message))
  }

  useEffect(() => {
    loadItems()
    loadOverview()
  }, [])

  useEffect(() => {
    if (tab !== 'issuances') return
    let alive = true
    setIssLoading(true)
    adminApi
      .pointIssuances({
        page: issPage,
        pageSize: PAGE_SIZE,
        source: issSource || undefined,
        itemKey: issItemKey || undefined,
      })
      .then((d) => {
        if (!alive) return
        setIssuances(d.items)
        setIssTotal(d.total)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => {
        if (alive) setIssLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tab, issPage, issSource, issItemKey, issReload])

  // 实物订单（服务端分页；状态 + 昵称/UID 关键词筛选）
  const [orders, setOrders] = useState<PointOrderRow[]>([])
  const [ordTotal, setOrdTotal] = useState(0)
  const [ordPage, setOrdPage] = useState(1)
  const [ordLoading, setOrdLoading] = useState(false)
  const [ordStatus, setOrdStatus] = useState('')
  /** 输入框里的值：按回车或点「搜索」才提交，否则每敲一个字就打一次接口 */
  const [ordKeyword, setOrdKeyword] = useState('')
  const [ordQuery, setOrdQuery] = useState('')
  const [ordReload, setOrdReload] = useState(0)
  // 发货弹窗（快递公司 + 单号）与订单详情（收货地址全字段）
  const [ship, setShip] = useState<{ row: PointOrderRow; company: string; no: string } | null>(null)
  const [shipSaving, setShipSaving] = useState(false)
  const [orderDetail, setOrderDetail] = useState<PointOrderRow | null>(null)

  useEffect(() => {
    if (tab !== 'orders') return
    let alive = true
    setOrdLoading(true)
    adminApi
      .pointOrders({
        page: ordPage,
        pageSize: PAGE_SIZE,
        status: ordStatus || undefined,
        keyword: ordQuery || undefined,
      })
      .then((d) => {
        if (!alive) return
        setOrders(d.items)
        setOrdTotal(d.total)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => {
        if (alive) setOrdLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tab, ordPage, ordStatus, ordQuery, ordReload])

  const loadOrders = () => setOrdReload((n) => n + 1)

  const doShip = async () => {
    if (!ship) return
    const no = ship.no.trim()
    if (!ship.company) {
      MessagePlugin.warning('请选择快递公司')
      return
    }
    if (!no) {
      MessagePlugin.warning('请填写快递单号（用户在小程序订单里就看这一串）')
      return
    }
    setShipSaving(true)
    try {
      const row = await adminApi.shipPointOrder(ship.row.id, { trackingNo: no, trackingCompany: ship.company })
      MessagePlugin.success(`已发货 · ${row.trackingCompany} ${row.trackingNo}`)
      setShip(null)
      loadOrders()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setShipSaving(false)
    }
  }

  /** 代确认收货：货已签收但用户没点确认时由客服代收，状态不可逆，所以走确认弹窗 */
  const doComplete = (row: PointOrderRow) => {
    const dialog = DialogPlugin.confirm({
      header: '代确认收货',
      body: `确定代「${row.nickname || `UID ${row.uid}` }」确认收货吗？确认后订单变成已完成，不可撤销`,
      confirmBtn: { content: '代确认', theme: 'danger' },
      // 命令式弹窗不会自己关：取消和右上角 X 必须显式 destroy
      onCancel: () => dialog.destroy(),
      onClose: () => dialog.destroy(),
      onConfirm: async () => {
        try {
          await adminApi.completePointOrder(row.id)
          MessagePlugin.success('已代确认收货')
          dialog.destroy()
          loadOrders()
        } catch (e) {
          MessagePlugin.error((e as Error).message)
        }
      },
    })
  }

  /** 道具/库存/发放变动后：目录与概况一起刷新（概况数字由 api 聚合，不能前端自增） */
  const refresh = () => {
    loadItems()
    loadOverview()
    setIssReload((n) => n + 1)
  }

  const onIssued = (_result: PointGrantResult) => refresh()

  const saveStock = async () => {
    if (!stockEdit) return
    if (!Number.isInteger(stockEdit.stock) || stockEdit.stock < 0) {
      MessagePlugin.warning(`库存必须是非负整数（当前 ${stockEdit.stock}）`)
      return
    }
    if (!Number.isInteger(stockEdit.dailyQuota) || stockEdit.dailyQuota < 0) {
      MessagePlugin.warning(`每日投放必须是非负整数（当前 ${stockEdit.dailyQuota}）`)
      return
    }
    if (!Number.isInteger(stockEdit.perUserDaily) || stockEdit.perUserDaily < 0) {
      MessagePlugin.warning(`每人每日上限必须是非负整数（当前 ${stockEdit.perUserDaily}）`)
      return
    }
    setStockSaving(true)
    try {
      const res = await adminApi.setPointItemStock(stockEdit.row.id, {
        stock: stockEdit.stock,
        unlimited: stockEdit.unlimited,
        dailyQuota: stockEdit.dailyQuota,
        perUserDaily: stockEdit.perUserDaily,
      })
      MessagePlugin.success(`库存 ${stockText(res.before)} → ${stockText(res.after)}`)
      setStockEdit(null)
      refresh()
    } catch (e) {
      // 服务端 400 的整句中文原样展示（如「dailyQuota 必须是非负整数（收到 …）」），页面不另写一套判定
      MessagePlugin.error((e as Error).message)
    } finally {
      setStockSaving(false)
    }
  }

  const copyKey = (key: string) => {
    if (!navigator.clipboard) {
      MessagePlugin.warning('当前环境不支持剪贴板')
      return
    }
    navigator.clipboard
      .writeText(key)
      .then(() => MessagePlugin.success(`已复制 ${key}`))
      .catch((e) => MessagePlugin.error((e as Error).message))
  }

  /** 免广告名单导出：前端拼 CSV（UTF-8 BOM 打头，微信后台上传认这个） */
  const exportRoster = async () => {
    setExporting(true)
    try {
      const rows = await adminApi.adFreeRoster()
      // Excel 会把 = + - @ 开头的单元格当公式执行（昵称可被用户控制）：先加单引号强制按文本，再照旧双引号转义
      const cell = (v: string | number) => {
        const s = String(v)
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
        return `"${safe.replace(/"/g, '""')}"`
      }
      const lines = [
        ['openid', 'uid', 'nickname', 'adFreeUntilDate'].map(cell).join(','),
        ...rows.map((r) => [r.openid, r.uid, r.nickname, r.adFreeUntilDate].map(cell).join(',')),
      ]
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ad-free-roster-${beijingTodayStr()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      MessagePlugin.success(`已导出 ${rows.length} 人名单`)
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const bySource = (source: PointIssuanceSource) =>
    overview?.bySource.find((r) => r.source === source)?.count

  const overviewItems = [
    { label: '发放总数', value: fmtNum(overview?.totalIssued) },
    { label: '兑换', value: fmtNum(bySource('exchange')) },
    { label: '手动', value: fmtNum(bySource('admin')) },
    { label: '系统赠送', value: fmtNum(bySource('system')) },
    { label: '累计消耗积分', value: fmtNum(overview?.totalSpentPoints) },
    { label: '生效中免广告人数', value: fmtNum(overview?.adFreeUsers) },
  ]

  const itemOptions = [
    { label: '全部道具', value: '' },
    ...items.map((it) => ({ label: it.name || it.key, value: it.key })),
  ]

  return (
    <>
      {/* 概况：发放总数 / 三来源 / 累计消耗 / 生效中免广告人数 */}
      <Card className="page-card" title="道具概况" style={{ marginBottom: 16 }}>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {overviewItems.map((it) => (
            <div
              key={it.label}
              style={{ background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)', borderRadius: 8, padding: '14px 16px' }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
              <div style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="page-card">
        <Tabs value={tab} onChange={(v) => setTab(v as string)}>
          <Tabs.TabPanel value="items" label={`道具列表（${itemsLoaded ? items.length : '—'}）`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '4px 0 12px' }}>
              <Button theme="primary" onClick={() => setFormState({ row: null })}>
                新建道具
              </Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                  导出为 We分析「屏蔽人群包」整包替换文件，次日生效
                </span>
                <Button variant="outline" loading={exporting} onClick={exportRoster}>
                  导出免广告名单
                </Button>
              </div>
            </div>
            <Table
              rowKey="id"
              data={items}
              loading={itemsLoading}
              empty="暂无道具"
              columns={[
                {
                  colKey: 'image',
                  title: '图',
                  width: 64,
                  cell: ({ row }: { row: PointItemRow }) =>
                    row.previewUrl ? (
                      <img
                        src={row.previewUrl}
                        alt={row.name}
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          background: 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--td-text-color-placeholder, #8a93a6)',
                          fontWeight: 600,
                        }}
                      >
                        {(row.name || '?').slice(0, 1)}
                      </div>
                    ),
                },
                {
                  colKey: 'name',
                  title: '名称',
                  width: 160,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      {row.subtitle && (
                        <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.subtitle}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  colKey: 'key',
                  title: 'key',
                  width: 140,
                  ellipsis: true,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <span
                      title="点击复制"
                      onClick={() => copyKey(row.key)}
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursor: 'pointer' }}
                    >
                      {row.key}
                    </span>
                  ),
                },
                {
                  // 实物/虚拟一眼分层：实物走订单发货，虚拟发卡到账户，运营在列表上就要看错行
                  colKey: 'kind',
                  title: '类型',
                  width: 96,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <Tag theme={row.kind === 'physical' ? 'warning' : 'default'} variant="light">
                        {row.kind === 'physical' ? '实物' : '虚拟'}
                      </Tag>
                      {row.kind === 'physical' && (
                        <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>
                          {row.perUserLimit > 0 ? `限购 ${row.perUserLimit} 件` : '限购 不限'}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  colKey: 'price',
                  title: '价格',
                  width: 96,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <div>{row.price.toLocaleString()}</div>
                      {/* 实物按元录入（1 元 = 100 分），列表把元带上，运营不用自己心算 28,900 是多少钱 */}
                      {row.kind === 'physical' && (
                        <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                          {(row.price / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 元
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  // 实物不发卡，validDays 与效果都用不上（表单里也是隐藏的）：列表出 '—' 而不是「30 天 / 补签」
                  colKey: 'validDays',
                  title: '卡有效期',
                  width: 88,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => (row.kind === 'physical' ? '—' : `${row.validDays} 天`),
                },
                {
                  colKey: 'effect',
                  title: '效果',
                  width: 100,
                  cell: ({ row }: { row: PointItemRow }) => (row.kind === 'physical' ? '—' : effectText(row)),
                },
                {
                  colKey: 'stock',
                  title: '库存',
                  width: 90,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => (row.unlimited ? '不限量' : row.stock.toLocaleString()),
                },
                {
                  // 每日投放（0 = 不限）：与库存同属 PATCH /stock 侧，内容编辑不改这两个数
                  colKey: 'daily',
                  title: '每日投放',
                  width: 150,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <div style={{ fontSize: 12, lineHeight: '18px' }}>
                      <div>总量 {row.dailyQuota > 0 ? `${row.dailyQuota.toLocaleString()} 张` : '不限'}</div>
                      <div style={{ color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                        每人 {row.perUserDaily > 0 ? `${row.perUserDaily.toLocaleString()} 张` : '不限'}
                      </div>
                    </div>
                  ),
                },
                {
                  colKey: 'active',
                  title: '状态',
                  width: 80,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <Tag theme={row.active ? 'success' : 'default'} variant="light">
                      {row.active ? '在架' : '已下架'}
                    </Tag>
                  ),
                },
                {
                  colKey: 'exchangeCount',
                  title: '兑换数',
                  width: 78,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => row.exchangeCount.toLocaleString(),
                },
                {
                  colKey: 'grantCount',
                  title: '发放数',
                  width: 78,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => row.grantCount.toLocaleString(),
                },
                {
                  colKey: 'op',
                  title: '操作',
                  width: 170,
                  cell: ({ row }: { row: PointItemRow }) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="text" theme="primary" size="small" onClick={() => setFormState({ row })}>
                        编辑
                      </Button>
                      <Button
                        variant="text"
                        theme="primary"
                        size="small"
                        onClick={() =>
                          setStockEdit({
                            row,
                            stock: row.stock,
                            unlimited: row.unlimited,
                            dailyQuota: row.dailyQuota,
                            perUserDaily: row.perUserDaily,
                          })
                        }
                      >
                        改库存
                      </Button>
                      <Button variant="text" theme="primary" size="small" onClick={() => setGrantItem(row)}>
                        发放
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </Tabs.TabPanel>

          <Tabs.TabPanel value="issuances" label="发放记录">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
              <span style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>来源</span>
              <Select
                size="small"
                style={{ width: 150 }}
                value={issSource}
                options={SOURCE_OPTIONS}
                onChange={(v) => {
                  setIssSource(String(v ?? ''))
                  setIssPage(1)
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>道具</span>
              <Select
                size="small"
                style={{ width: 220 }}
                value={issItemKey}
                options={itemOptions}
                onChange={(v) => {
                  setIssItemKey(String(v ?? ''))
                  setIssPage(1)
                }}
              />
            </div>
            <Table
              rowKey="id"
              data={issuances}
              loading={issLoading}
              empty="暂无发放记录"
              columns={[
                {
                  colKey: 'user',
                  title: '用户',
                  width: 180,
                  ellipsis: true,
                  cell: ({ row }: { row: PointIssuanceRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.nickname || '微信用户'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>UID {row.uid || '—'}</div>
                    </div>
                  ),
                },
                {
                  colKey: 'itemName',
                  title: '道具',
                  width: 140,
                  ellipsis: true,
                  cell: ({ row }: { row: PointIssuanceRow }) => row.itemName || row.itemKey || '—',
                },
                { colKey: 'sourceText', title: '来源', width: 100 },
                { colKey: 'createdAt', title: '获得时间', width: 160, cell: ({ row }: { row: PointIssuanceRow }) => fmtDateTime(row.createdAt) },
                {
                  colKey: 'expiresAt',
                  title: '卡有效期',
                  width: 160,
                  cell: ({ row }: { row: PointIssuanceRow }) => fmtDateTime(row.expiresAt),
                },
                {
                  colKey: 'status',
                  title: '状态',
                  width: 84,
                  cell: ({ row }: { row: PointIssuanceRow }) => (
                    <Tag theme={CARD_STATUS_THEME[row.status] ?? 'default'} variant="light">
                      {row.statusText}
                    </Tag>
                  ),
                },
                {
                  colKey: 'grantedBy',
                  title: '操作人',
                  width: 140,
                  ellipsis: true,
                  cell: ({ row }: { row: PointIssuanceRow }) => (row.grantedBy ? row.grantedBy : '—'),
                },
                { colKey: 'note', title: '备注', ellipsis: true, cell: ({ row }: { row: PointIssuanceRow }) => row.note || '—' },
              ]}
              pagination={{
                total: issTotal,
                current: issPage,
                pageSize: PAGE_SIZE,
                showJumper: true,
                onChange: (info) => setIssPage(info.current),
              }}
            />
          </Tabs.TabPanel>

          <Tabs.TabPanel value="orders" label="实物订单">
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
              <Input
                value={ordKeyword}
                placeholder="搜索昵称 / UID"
                style={{ width: 200 }}
                onChange={(v) => setOrdKeyword(String(v))}
                onEnter={() => {
                  setOrdPage(1)
                  setOrdQuery(ordKeyword.trim())
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  setOrdPage(1)
                  setOrdQuery(ordKeyword.trim())
                }}
              >
                搜索
              </Button>
              <Select
                value={ordStatus}
                style={{ width: 140 }}
                options={ORDER_STATUS_OPTIONS}
                onChange={(v) => {
                  setOrdStatus(String(v ?? ''))
                  setOrdPage(1)
                }}
              />
            </div>
            <Table
              rowKey="id"
              data={orders}
              loading={ordLoading}
              empty="暂无实物订单"
              columns={[
                { colKey: 'createdAt', title: '下单时间', width: 160, cell: ({ row }: { row: PointOrderRow }) => fmtDateTime(row.createdAt) },
                {
                  colKey: 'user',
                  title: '用户',
                  width: 140,
                  ellipsis: true,
                  cell: ({ row }: { row: PointOrderRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.nickname || '微信用户'}</div>
                      <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>UID {row.uid || '—'}</div>
                    </div>
                  ),
                },
                {
                  colKey: 'itemName',
                  title: '商品',
                  width: 150,
                  ellipsis: true,
                  cell: ({ row }: { row: PointOrderRow }) => row.itemName || row.itemKey || '—',
                },
                {
                  colKey: 'cost',
                  title: '实付',
                  width: 84,
                  align: 'right',
                  cell: ({ row }: { row: PointOrderRow }) => row.cost.toLocaleString(),
                },
                {
                  colKey: 'receiver',
                  title: '收货人',
                  width: 130,
                  cell: ({ row }: { row: PointOrderRow }) => (
                    <div style={{ minWidth: 0 }}>
                      <div>{row.receiver || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>{row.phoneMasked || '—'}</div>
                    </div>
                  ),
                },
                {
                  colKey: 'detail',
                  title: '详细地址',
                  ellipsis: true,
                  // 列表只给一行 + 省略号，完整地址在「详情」里看（手机号接口侧已打码）
                  cell: ({ row }: { row: PointOrderRow }) => (
                    <span title={row.detail}>{row.detail || '—'}</span>
                  ),
                },
                {
                  colKey: 'status',
                  title: '状态',
                  width: 84,
                  cell: ({ row }: { row: PointOrderRow }) => (
                    <Tag theme={ORDER_STATUS_THEME[row.status] ?? 'default'} variant="light">
                      {row.statusText}
                    </Tag>
                  ),
                },
                {
                  colKey: 'tracking',
                  title: '物流',
                  width: 170,
                  ellipsis: true,
                  cell: ({ row }: { row: PointOrderRow }) =>
                    row.trackingNo ? `${row.trackingCompany ? `${row.trackingCompany} · ` : ''}${row.trackingNo}` : '—',
                },
                {
                  colKey: 'op',
                  title: '操作',
                  width: 160,
                  cell: ({ row }: { row: PointOrderRow }) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="text" theme="primary" size="small" onClick={() => setOrderDetail(row)}>
                        详情
                      </Button>
                      {row.status === 'pending_ship' && (
                        <Button
                          variant="text"
                          theme="primary"
                          size="small"
                          onClick={() => setShip({ row, company: row.trackingCompany || '顺丰', no: '' })}
                        >
                          发货
                        </Button>
                      )}
                      {row.status === 'shipped' && (
                        <Button variant="text" theme="primary" size="small" onClick={() => doComplete(row)}>
                          代确认
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              pagination={{
                total: ordTotal,
                current: ordPage,
                pageSize: PAGE_SIZE,
                showJumper: true,
                onChange: (info) => setOrdPage(info.current),
              }}
            />
          </Tabs.TabPanel>
        </Tabs>
      </Card>

      {/* 新建 / 编辑：编辑态整行提交十个内容字段，key 只读 */}
      <PointsItemFormDialog
        visible={formState != null}
        row={formState?.row ?? null}
        onClose={() => setFormState(null)}
        onSaved={() => {
          setFormState(null)
          refresh()
        }}
      />

      {/* 改库存 / 每日投放：这四个字段同属 PATCH /items/:id/stock，改的是目标值不是增量；
          内容编辑（PUT）不碰它们，所以改完内容不会把投放配置打回默认 */}
      <Dialog
        header={stockEdit ? `改库存与投放 · ${stockEdit.row.name}` : '改库存与投放'}
        visible={stockEdit != null}
        width={520}
        confirmBtn={{ content: '保存', theme: 'primary', loading: stockSaving }}
        onCancel={() => setStockEdit(null)}
        onClose={() => setStockEdit(null)}
        onConfirm={saveStock}
      >
        {stockEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>库存</span>
              <InputNumber
                value={stockEdit.stock}
                min={0}
                step={1}
                style={{ width: 160 }}
                onChange={(v) => setStockEdit({ ...stockEdit, stock: numOr(v as number | string | undefined, stockEdit.stock) })}
              />
              <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>目标值（不是增量）</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>不限量</span>
              <Switch
                value={stockEdit.unlimited}
                onChange={(v) => setStockEdit({ ...stockEdit, unlimited: Boolean(v) })}
              />
              <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>开启后兑换/发放不扣库存</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>每日投放</span>
              <InputNumber
                value={stockEdit.dailyQuota}
                min={0}
                step={1}
                style={{ width: 160 }}
                onChange={(v) => setStockEdit({ ...stockEdit, dailyQuota: numOr(v as number | string | undefined, stockEdit.dailyQuota) })}
              />
              <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>张／天，0 = 不限</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>每人每日</span>
              <InputNumber
                value={stockEdit.perUserDaily}
                min={0}
                step={1}
                style={{ width: 160 }}
                onChange={(v) => setStockEdit({ ...stockEdit, perUserDaily: numOr(v as number | string | undefined, stockEdit.perUserDaily) })}
              />
              <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>张／人／天，0 = 不限</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', paddingLeft: 106 }}>
              明日 00:00 重置；兑换撞上限时小程序按服务端文案提示
            </div>
          </div>
        )}
      </Dialog>

      {/* 发货：只允许 待发货 → 已发货；重复点第二次 api 回 400 点名当前状态 */}
      <Dialog
        header={ship ? `发货 · ${ship.row.itemName || ship.row.itemKey}` : '发货'}
        visible={ship != null}
        width={460}
        confirmBtn={{ content: '确认发货', theme: 'primary', loading: shipSaving }}
        onCancel={() => setShip(null)}
        onClose={() => setShip(null)}
        onConfirm={doShip}
      >
        {ship && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 84, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>快递公司</span>
              <Select
                value={ship.company}
                style={{ flex: 1 }}
                options={TRACKING_COMPANIES.map((c) => ({ label: c, value: c }))}
                onChange={(v) => setShip({ ...ship, company: String(v) })}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 84, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)' }}>快递单号</span>
              <Input
                value={ship.no}
                placeholder="如 SF1234567890"
                style={{ flex: 1 }}
                onChange={(v) => setShip({ ...ship, no: String(v) })}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', paddingLeft: 94 }}>
              收货人 {ship.row.receiver} {ship.row.phoneMasked} · {ship.row.detail}
            </div>
          </div>
        )}
      </Dialog>

      {/* 订单详情：地址与物流全字段（列表是省略号，这里看完整） */}
      <Dialog
        header={orderDetail ? `订单详情 · ${orderDetail.itemName || orderDetail.itemKey}` : '订单详情'}
        visible={orderDetail != null}
        width={560}
        footer={false}
        onClose={() => setOrderDetail(null)}
      >
        {orderDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag theme={ORDER_STATUS_THEME[orderDetail.status] ?? 'default'} variant="light">
                {orderDetail.statusText}
              </Tag>
              <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                {orderDetail.id}
              </span>
            </div>
            {[
              { label: '用户', value: `${orderDetail.nickname || '微信用户'}（UID ${orderDetail.uid || '—'}）` },
              { label: '商品', value: orderDetail.itemName || orderDetail.itemKey || '—' },
              { label: '实付积分', value: orderDetail.cost.toLocaleString() },
              { label: '收货人', value: `${orderDetail.receiver || '—'} ${orderDetail.phoneMasked || '—'}` },
              { label: '收货地址', value: orderDetail.detail || '—' },
              { label: '下单时间', value: fmtDateTime(orderDetail.createdAt) },
              { label: '发货时间', value: orderDetail.shippedAt ? fmtDateTime(orderDetail.shippedAt) : '—' },
              { label: '完成时间', value: orderDetail.completedAt ? fmtDateTime(orderDetail.completedAt) : '—' },
              {
                label: '物流',
                value: orderDetail.trackingNo
                  ? `${orderDetail.trackingCompany || '—'} ${orderDetail.trackingNo}`
                  : '未发货',
              },
            ].map((it) => (
              <div key={it.label} style={{ display: 'flex', gap: 10 }}>
                <span style={{ width: 72, flexShrink: 0, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>{it.label}</span>
                <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{it.value}</span>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <PointsGrantDialog
        visible={grantItem != null}
        item={grantItem}
        onClose={() => setGrantItem(null)}
        onIssued={onIssued}
      />
    </>
  )
}
