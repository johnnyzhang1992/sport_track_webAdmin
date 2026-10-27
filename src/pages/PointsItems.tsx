import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
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
} from '../api'
import PointsItemFormDialog from '../components/PointsItemFormDialog'
import PointsGrantDialog from '../components/PointsGrantDialog'
import { fmtDateTime } from '../utils/format'

const PAGE_SIZE = 20

/** 未加载显示 '—'（0 是「真的是零」，两者不能混） */
const fmtNum = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString())

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

/** 效果列：makeup 是补签卡；ad_free 必须把天数写出来（天数来自目录快照） */
const effectText = (row: PointItemRow) =>
  row.effect.kind === 'makeup' ? '补签' : `免广告 ${row.effect.days} 天`

/** 库存状态文案：不限量时数字只是展示位，别让人以为库存是真的 */
const stockText = (s: PointItemStockState) => `${s.stock.toLocaleString()}${s.unlimited ? '（不限量）' : ''}`

/** 导出文件名用本地日期：人群包按天替换，日期就是这次导出的批次 */
function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 积分道具页（Task 13）：概况 + 道具目录 + 发放记录 + 免广告名单导出。
 * 概况六格全部取 /admin/points/items/overview，前端不另算任何指标。
 */
export default function PointsItems() {
  const [overview, setOverview] = useState<PointItemsOverview | null>(null)
  const [items, setItems] = useState<PointItemRow[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [tab, setTab] = useState('items')

  // 弹窗：新建/编辑（row=null 新建）、改库存、发放
  const [formState, setFormState] = useState<{ row: PointItemRow | null } | null>(null)
  const [stockEdit, setStockEdit] = useState<{ row: PointItemRow; stock: number; unlimited: boolean } | null>(null)
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
      .then(setItems)
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
      MessagePlugin.warning('库存必须是非负整数')
      return
    }
    setStockSaving(true)
    try {
      const res = await adminApi.setPointItemStock(stockEdit.row.id, {
        stock: stockEdit.stock,
        unlimited: stockEdit.unlimited,
      })
      MessagePlugin.success(`库存 ${stockText(res.before)} → ${stockText(res.after)}`)
      setStockEdit(null)
      refresh()
    } catch (e) {
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
      const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
      const lines = [
        ['openid', 'uid', 'nickname', 'adFreeUntilDate'].map(cell).join(','),
        ...rows.map((r) => [r.openid, r.uid, r.nickname, r.adFreeUntilDate].map(cell).join(',')),
      ]
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ad-free-roster-${todayStr()}.csv`
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
          <Tabs.TabPanel value="items" label={`道具列表（${items.length}）`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '4px 0 12px' }}>
              <Button theme="primary" onClick={() => setFormState({ row: null })}>
                新建道具
              </Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#8a93a6' }}>
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
                          color: '#8a93a6',
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
                        <div style={{ fontSize: 12, color: '#8a93a6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  colKey: 'price',
                  title: '价格',
                  width: 76,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => row.price.toLocaleString(),
                },
                {
                  colKey: 'validDays',
                  title: '卡有效期',
                  width: 88,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => `${row.validDays} 天`,
                },
                { colKey: 'effect', title: '效果', width: 100, cell: ({ row }: { row: PointItemRow }) => effectText(row) },
                {
                  colKey: 'stock',
                  title: '库存',
                  width: 90,
                  align: 'right',
                  cell: ({ row }: { row: PointItemRow }) => (row.unlimited ? '不限量' : row.stock.toLocaleString()),
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
                        onClick={() => setStockEdit({ row, stock: row.stock, unlimited: row.unlimited })}
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
              <span style={{ fontSize: 13, color: '#8a93a6' }}>来源</span>
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
              <span style={{ fontSize: 13, color: '#8a93a6' }}>道具</span>
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
                      <div style={{ fontSize: 12, color: '#8a93a6' }}>UID {row.uid || '—'}</div>
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

      {/* 改库存：stock 与 unlimited 同属 PATCH /items/:id/stock，改的是目标值不是增量 */}
      <Dialog
        header={stockEdit ? `改库存 · ${stockEdit.row.name}` : '改库存'}
        visible={stockEdit != null}
        width={460}
        confirmBtn={{ content: '保存', theme: 'primary', loading: stockSaving }}
        onCancel={() => setStockEdit(null)}
        onClose={() => setStockEdit(null)}
        onConfirm={saveStock}
      >
        {stockEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969' }}>库存</span>
              <InputNumber
                value={stockEdit.stock}
                min={0}
                step={1}
                style={{ width: 160 }}
                onChange={(v) =>
                  setStockEdit({
                    ...stockEdit,
                    stock:
                      typeof v === 'number' && Number.isFinite(v)
                        ? v
                        : v === undefined || v === null || v === ''
                          ? stockEdit.stock
                          : Number(v),
                  })
                }
              />
              <span style={{ fontSize: 12, color: '#8a93a6' }}>目标值（不是增量）</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969' }}>不限量</span>
              <Switch
                value={stockEdit.unlimited}
                onChange={(v) => setStockEdit({ ...stockEdit, unlimited: Boolean(v) })}
              />
              <span style={{ fontSize: 12, color: '#8a93a6' }}>开启后兑换/发放不扣库存</span>
            </div>
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
