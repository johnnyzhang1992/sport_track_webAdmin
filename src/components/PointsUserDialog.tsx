import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialog, MessagePlugin, Select, Table, Tabs, Tag } from 'tdesign-react'
import {
  adminApi,
  type PointsUserCardRow,
  type PointsUserDetail,
  type PointsUserRecordList,
} from '../api'
import { fmtDateTime } from '../utils/format'

interface Props {
  visible: boolean
  userId: string
  nickname: string
  onClose: () => void
}

const PAGE_SIZE = 20

/** 未加载显示 '—'（0 是「真的是零」，两者不能混） */
const fmtNum = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString())

/** 到期时刻只到天：概况格是「标签左 · 数值右」一行，日期要能在 198px 格里和五个字并排放下 */
const fmtDay = (ts: number) => new Date(ts).toLocaleDateString('zh-CN')

/**
 * 流水类型筛选项：值必须与账本写入的 type 一字不差（api 原样透传给 listPointRecords 做精确匹配）。
 * 任务类型是 `task_<key>`（points-tasks.ts），这里列出 config/points.ts 里登记的全部任务。
 */
const RECORD_TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '签到', value: 'signin' },
  { label: '补签奖励', value: 'makeup_reward' },
  { label: '补签差额', value: 'makeup_topup' },
  { label: '补签奖励撤回', value: 'makeup_reward_rollback' },
  { label: '兑换', value: 'exchange' },
  { label: '过期回收', value: 'expire' },
  { label: '新手任务·完善资料', value: 'task_newbie_profile' },
  { label: '新手任务·首次完成运动', value: 'task_newbie_first_activity' },
  { label: '新手任务·首次导入轨迹', value: 'task_newbie_first_import' },
  { label: '每日任务·运动记录', value: 'task_daily_activity' },
  { label: '每日任务·观看广告视频', value: 'task_daily_video' },
]

const RECORD_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RECORD_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

/** 卡状态 Tag 主题：未使用突出、已使用中性、已过期警示 */
const CARD_STATUS_THEME: Record<string, 'primary' | 'default' | 'danger'> = {
  unused: 'primary',
  used: 'default',
  expired: 'danger',
}

/** 「使用或激活信息」：补签卡看补签日期，免广告卡看激活时刻与权益天数 */
function cardUsage(row: PointsUserCardRow): string {
  const parts: string[] = []
  if (row.usedForDate) parts.push(`补签 ${row.usedForDate}`)
  if (row.activatedAt) {
    parts.push(`${fmtDateTime(row.activatedAt)} 激活${row.benefitDays ? ` · ${row.benefitDays} 天` : ''}`)
  }
  return parts.length ? parts.join('；') : '—'
}

/**
 * 用户积分详情弹窗（Task 12）：
 * 顶部概况 8 格全部取 /admin/points/users/:id 的字段，前端不另算；
 * 弹窗整体不滚，只有表体滚 —— 表高由下面 tableMax 实测（见 measure）。
 */
export default function PointsUserDialog({ visible, userId, nickname, onClose }: Props) {
  const [detail, setDetail] = useState<PointsUserDetail | null>(null)
  const [tab, setTab] = useState('records')
  // 重开复位：ready 由「打开」那一次 effect 置位，避免用旧页码/旧筛选对新用户先发一次请求
  const [ready, setReady] = useState(false)

  // 积分明细（服务端分页 + type 筛选）
  const [records, setRecords] = useState<PointsUserRecordList | null>(null)
  const [recPage, setRecPage] = useState(1)
  const [recType, setRecType] = useState('')
  const [recLoading, setRecLoading] = useState(false)

  // 道具记录（接口一次给全量，翻页在前端切片）
  const [cards, setCards] = useState<PointsUserCardRow[] | null>(null)
  const [cardPage, setCardPage] = useState(1)
  const [cardLoading, setCardLoading] = useState(false)

  useEffect(() => {
    if (!visible) {
      setReady(false)
      return
    }
    setTab('records')
    setRecPage(1)
    setRecType('')
    setCardPage(1)
    setDetail(null)
    setRecords(null)
    setCards(null)
    setReady(true)
    adminApi.pointsUser(userId).then(setDetail).catch((e) => MessagePlugin.error((e as Error).message))
  }, [visible, userId])

  useEffect(() => {
    if (!visible || !ready || tab !== 'records') return
    let alive = true
    setRecLoading(true)
    adminApi
      .pointsUserRecords(userId, recPage, PAGE_SIZE, recType)
      .then((d) => {
        if (alive) setRecords(d)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => {
        if (alive) setRecLoading(false)
      })
    return () => {
      alive = false
    }
  }, [visible, ready, tab, userId, recPage, recType])

  // 道具记录：只有切到该 Tab 才取数（重开时会被 reset 回 records，不会白拉）
  useEffect(() => {
    if (!visible || !ready || tab !== 'cards') return
    let alive = true
    setCardLoading(true)
    adminApi
      .pointsUserCards(userId)
      .then((d) => {
        if (alive) setCards(d)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => {
        if (alive) setCardLoading(false)
      })
    return () => {
      alive = false
    }
  }, [visible, ready, tab, userId])

  const cells = [
    { label: '余额', value: fmtNum(detail?.balance) },
    { label: '累计获得', value: fmtNum(detail?.totalEarned) },
    { label: '累计消耗', value: fmtNum(detail?.totalSpent) },
    { label: '累计签到天数', value: fmtNum(detail?.signinDays) },
    { label: '当前连续', value: fmtNum(detail?.streakDay) },
    { label: '兑换次数', value: fmtNum(detail?.exchanges) },
    { label: '持卡未使用', value: fmtNum(detail?.cardsUnused) },
    { label: '免广告到期', value: !detail || !detail.adFreeUntil ? '—' : fmtDay(detail.adFreeUntil) },
  ]

  const cardRows = (cards ?? []).slice((cardPage - 1) * PAGE_SIZE, cardPage * PAGE_SIZE)

  // 表体可用高度实测：TDesign 把 maxHeight 只加在 `.t-table__content` 上，表头在内、分页条在外，
  // 所以「弹窗内边距底 − 表格框顶 − 分页条高」才是表体能占的空间。
  // 写死 calc(85vh - 320px) 会算少上方占位，表格就顶出弹窗、整个弹窗自己滚起来了。
  //
  // 弹窗内容是 TDesign 在自己的 effect 里挂进 body 的，visible 翻 true 那次提交里表格框还不存在，
  // 所以观察器不能放 useEffect，得由回调 ref 在节点真正出现时建立。
  // 切 Tab 时上方多了/少了筛选行、弹窗尺寸却不一定会变（观察器可能不触发），所以给容器挂 key={tab} 强制重挂重算。
  const [tableMax, setTableMax] = useState(0)
  const boxObserver = useRef<ResizeObserver | null>(null)
  useEffect(() => () => boxObserver.current?.disconnect(), [])
  const attachTableBox = useCallback(
    (box: HTMLDivElement | null) => {
      boxObserver.current?.disconnect()
      boxObserver.current = null
      const dialog = box?.closest('.t-dialog')
      const body = box?.closest('.t-dialog__body')
      if (!box || !dialog || !body) return
      const measure = () => {
        const dcs = getComputedStyle(dialog)
        // 只用 offset* + computed maxHeight：弹窗入场动画会给自己加 scale transform，
        // 用 getBoundingClientRect 量到的是缩放中的尺寸；用 dialog.clientHeight 则会被上一次裁出来的
        // 矮表格带偏（表格只有拿到上限才会长满，于是越量越矮）。computed maxHeight 是纯几何，不受内容影响。
        const innerBottom =
          parseFloat(dcs.maxHeight) -
          parseFloat(dcs.borderTopWidth) -
          parseFloat(dcs.borderBottomWidth) -
          parseFloat(dcs.paddingBottom) -
          parseFloat(getComputedStyle(body).paddingBottom)
        const pag = box.querySelector<HTMLElement>('.t-table__pagination')
        const pagH = pag ? pag.offsetHeight : 0
        // .t-dialog 是 position:relative，静态定位的表格框的 offsetTop 就是它到弹窗内边距顶的距离
        setTableMax(Math.max(120, Math.floor(innerBottom - box.offsetTop - pagH)))
      }
      measure()
      // 视口尺寸、数据行数都会改变弹窗的盒，观察弹窗就都能跟着重算
      const ro = new ResizeObserver(measure)
      ro.observe(dialog)
      boxObserver.current = ro
    },
    [],
  )

  return (
    <Dialog
      visible={visible}
      header={`${nickname || '微信用户'} · 积分详情`}
      width={880}
      footer={false}
      destroyOnClose
      // 挂在 .t-dialog__ctx 上：index.css 里据此把这一个弹窗的上下留白压到 24px，配合下面的高度用满视口
      className="points-user-dialog-ctx"
      // 视口高 − 上下各 24px 留白（见 index.css 的 .points-user-dialog-ctx）；再高就会撑出遮罩层的滚动
      style={{ maxHeight: 'calc(100vh - 48px)' }}
      onClose={onClose}
    >
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        {cells.map((it) => (
          <div
            key={it.label}
            style={{
              background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
              borderRadius: 6,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', whiteSpace: 'nowrap' }}>
              {it.label}
            </span>
            <b style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{it.value}</b>
          </div>
        ))}
      </div>

      {/* Tabs 只当导航：面板留空，表格放到下面自己算高度的容器里，免得套一层要跟着算的 flex */}
      <Tabs value={tab} onChange={(v) => setTab(v as string)}>
        <Tabs.TabPanel value="records" label="积分明细" />
        <Tabs.TabPanel value="cards" label="道具记录" />
      </Tabs>

      {tab === 'records' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>类型</span>
          <Select
            size="small"
            style={{ width: 180 }}
            value={recType}
            options={RECORD_TYPE_OPTIONS}
            onChange={(v) => {
              setRecType(String(v ?? ''))
              setRecPage(1)
            }}
          />
        </div>
      )}

      <div key={tab} ref={attachTableBox}>
        {tab === 'records' ? (
          <Table
            rowKey="id"
            size="small"
            data={records?.items ?? []}
            loading={recLoading}
            empty="暂无积分明细"
            maxHeight={tableMax || undefined}
            columns={[
              { colKey: 'createdAt', title: '时间', width: 150, cell: ({ row }) => fmtDateTime(row.createdAt) },
              {
                colKey: 'type',
                title: '类型',
                width: 130,
                cell: ({ row }) => RECORD_TYPE_LABELS[row.type] ?? row.type,
              },
              { colKey: 'title', title: '说明', ellipsis: true },
              {
                colKey: 'delta',
                title: '变动',
                width: 90,
                align: 'right',
                cell: ({ row }) => (
                  <b style={{ color: row.delta > 0 ? '#00a870' : '#e34d59', fontVariantNumeric: 'tabular-nums' }}>
                    {row.delta > 0 ? '+' : ''}
                    {row.delta.toLocaleString()}
                  </b>
                ),
              },
              {
                colKey: 'balanceAfter',
                title: '变动后余额',
                width: 110,
                align: 'right',
                cell: ({ row }) => row.balanceAfter.toLocaleString(),
              },
              { colKey: 'bizDate', title: '业务日期', width: 110 },
            ]}
            pagination={{
              // 首屏未回来前不声称「0 条」：totalContent 用 '—' 顶掉默认的总条数
              total: records?.total ?? 0,
              totalContent: records ? `共 ${records.total} 条数据` : '—',
              current: recPage,
              pageSize: PAGE_SIZE,
              showJumper: true,
              onChange: (info) => setRecPage(info.current),
            }}
          />
        ) : (
          <Table
            rowKey="id"
            size="small"
            data={cardRows}
            loading={cardLoading}
            empty="暂无道具记录"
            maxHeight={tableMax || undefined}
            columns={[
              { colKey: 'itemName', title: '道具', width: 100, ellipsis: true, cell: ({ row }) => row.itemName || row.itemKey || '—' },
              { colKey: 'sourceText', title: '来源', width: 72 },
              { colKey: 'createdAt', title: '获得时间', width: 128, cell: ({ row }) => fmtDateTime(row.createdAt) },
              { colKey: 'expiresAt', title: '有效期', width: 128, cell: ({ row }) => fmtDateTime(row.expiresAt) },
              {
                colKey: 'status',
                title: '状态',
                width: 72,
                cell: ({ row }) => (
                  <Tag theme={CARD_STATUS_THEME[row.status] ?? 'default'} variant="light">
                    {row.statusText}
                  </Tag>
                ),
              },
              { colKey: 'usage', title: '使用或激活信息', width: 140, ellipsis: true, cell: ({ row }) => cardUsage(row) },
              {
                colKey: 'grantedBy',
                title: '操作人',
                width: 90,
                ellipsis: true,
                cell: ({ row }) => (row.grantedBy ? row.grantedBy : '—'),
              },
              { colKey: 'note', title: '备注', ellipsis: true, cell: ({ row }) => row.note || '—' },
            ]}
            pagination={{
              total: cards?.length ?? 0,
              totalContent: cards ? `共 ${cards.length} 条数据` : '—',
              current: cardPage,
              pageSize: PAGE_SIZE,
              showJumper: true,
              onChange: (info) => setCardPage(info.current),
            }}
          />
        )}
      </div>
    </Dialog>
  )
}
