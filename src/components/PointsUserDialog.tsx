import { useEffect, useState } from 'react'
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

/** 到期时刻只到天：弹窗里这一格要放得下四个字「免广告到期」的值 */
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
 * 「积分明细」与「道具记录」各自分页，表体在弹窗内部滚（maxHeight），页面本身不滚。
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

  return (
    <Dialog
      visible={visible}
      header={`${nickname || '微信用户'} · 积分详情`}
      width={880}
      footer={false}
      destroyOnClose
      style={{ maxHeight: '85vh' }}
      onClose={onClose}
    >
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 12 }}>
        {cells.map((it) => (
          <div
            key={it.label}
            style={{ background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)', borderRadius: 8, padding: '10px 12px' }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>{it.label}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onChange={(v) => setTab(v as string)}>
        <Tabs.TabPanel value="records" label="积分明细">
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#8a93a6' }}>类型</span>
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
          <Table
            rowKey="id"
            size="small"
            data={records?.items ?? []}
            loading={recLoading}
            empty="暂无积分明细"
            maxHeight="calc(85vh - 320px)"
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
        </Tabs.TabPanel>

        <Tabs.TabPanel value="cards" label="道具记录">
          <Table
            rowKey="id"
            size="small"
            data={cardRows}
            loading={cardLoading}
            empty="暂无道具记录"
            maxHeight="calc(85vh - 320px)"
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
        </Tabs.TabPanel>
      </Tabs>
    </Dialog>
  )
}
