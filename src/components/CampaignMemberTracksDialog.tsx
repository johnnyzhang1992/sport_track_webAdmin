import { useEffect, useMemo, useState } from 'react'
import { Dialog, Table, Tag, Loading, Select } from 'tdesign-react'
import { adminApi } from '../api'
import { fmtDateTime, fmtDuration, fmtKm, typeLabel } from '../utils/format'

interface Props {
  visible: boolean
  memberName: string
  userId: string
  /** 活动起止：弹窗只拉活动时间窗内的轨迹，并给每行标「归属」 */
  startAt: number
  endAt: number
  /** 活动类型白名单：只展示白名单内类型；筛选下拉也只用这些类型 */
  allowedTypes: string[]
  onClose: () => void
}

interface Row {
  id: string
  type: string
  status: string
  startTime: number
  distance: number
  duration: number
  vehicleMs?: number
  driftScore?: number | null
}

/**
 * 活动成员在活动时间窗内的轨迹（弹窗）：管理端列表接口按 userId + 开始时间区间过滤，
 * 一次拉 100 条（时间窗内的轨迹很少超过），前端再按活动类型白名单与类型筛选收敛。
 * 每行标「归属」：
 * - 活动内 且 未被门禁排除（vehicleMs=0 且 driftScore≤门禁）→ 计入（绿）
 * - 活动内 但 vehicleMs>0 或 driftScore 超门禁 → 未计入（橙）
 */
export default function CampaignMemberTracksDialog({
  visible,
  memberName,
  userId,
  startAt,
  endAt,
  allowedTypes,
  onClose,
}: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    if (!visible || !userId) return
    setTypeFilter('')
    setLoading(true)
    adminApi
      .activities(1, 100, {
        userId,
        startTimeFrom: String(startAt),
        startTimeTo: String(endAt + 86_399_000), // 结束日到 23:59:59.999
      })
      .then((r) => {
        setRows((r.items ?? []) as Row[])
      })
      .finally(() => setLoading(false))
  }, [visible, userId, startAt, endAt])

  const isExcluded = (r: Row) => (r.vehicleMs ?? 0) > 0 || (r.driftScore ?? 0) > 30

  // 类型白名单 + 下拉筛选（客户端过滤：一次拉取量很小，不值得再发请求）
  const visibleRows = useMemo(
    () => rows.filter((r) => allowedTypes.includes(r.type) && (!typeFilter || r.type === typeFilter)),
    [rows, allowedTypes, typeFilter],
  )
  const counted = visibleRows.filter((r) => !isExcluded(r)).length
  const excludedCount = visibleRows.length - counted

  const columns = [
    {
      colKey: 'startTime',
      title: '开始时间',
      width: 140,
      cell: ({ row }: { row: Row }) => <span style={{ fontSize: 12 }}>{fmtDateTime(row.startTime)}</span>,
    },
    { colKey: 'type', title: '类型', width: 80, cell: ({ row }: { row: Row }) => typeLabel(row.type) },
    { colKey: 'distance', title: '距离 (km)', width: 90, align: 'center' as const, cell: ({ row }: { row: Row }) => fmtKm(row.distance) },
    { colKey: 'duration', title: '时长', width: 90, align: 'center' as const, cell: ({ row }: { row: Row }) => fmtDuration(row.duration) },
    {
      colKey: 'driftScore',
      title: '漂移分',
      width: 80,
      align: 'center' as const,
      cell: ({ row }: { row: Row }) => {
        const s = row.driftScore
        if (s == null) return <span style={{ color: '#c2c7d0' }}>—</span>
        return s >= 30 ? <Tag theme="danger" variant="light">{s}</Tag> : <span>{s}</span>
      },
    },
    {
      colKey: 'belong',
      title: '归属',
      cell: ({ row }: { row: Row }) => {
        if (row.status !== 'finished') return <Tag theme="default" variant="light">未完成</Tag>
        if (isExcluded(row)) return <Tag theme="warning" variant="light">未计入（定位异常）</Tag>
        return <Tag theme="success" variant="light">计入</Tag>
      },
    },
  ]

  return (
    <Dialog
      visible={visible}
      header={`${memberName} · 活动期内轨迹（${visibleRows.length} 条计入 / ${excludedCount} 条未计入）`}
      width={860}
      onClose={onClose}
      footer={false}
    >
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Loading text="加载中…" />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#86909c' }}>类型筛选</span>
            <Select
              size="small"
              style={{ width: 160 }}
              value={typeFilter}
              onChange={(v) => setTypeFilter(String(v))}
              clearable
              options={[
                { label: '全部类型', value: '' },
                ...allowedTypes.map((t) => ({ label: typeLabel(t), value: t })),
              ]}
            />
          </div>
          <Table rowKey="id" data={visibleRows} columns={columns} max-height={420} />
        </>
      )}
    </Dialog>
  )
}
