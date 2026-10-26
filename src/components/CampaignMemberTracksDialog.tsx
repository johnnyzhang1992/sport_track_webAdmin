import { useEffect, useState } from 'react'
import { Dialog, Table, Tag, Loading } from 'tdesign-react'
import { adminApi } from '../api'
import { fmtDateTime, fmtDuration, fmtKm, typeLabel } from '../utils/format'

interface Props {
  visible: boolean
  memberName: string
  userId: string
  /** 活动起止：用于给每条轨迹标「活动内 / 活动外」 */
  startAt: number
  endAt: number
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
 * 活动成员的全部轨迹（弹窗）：管理端列表接口按 userId 过滤，一次拉 100 条。
 * 每行标「归属」：
 * - 活动内 且 未被门禁排除 → 计入（绿）
 * - 活动内 但 vehicleMs>0 或 driftScore 超门禁 → 未计入（橙）
 * - 活动外 → 灰
 */
export default function CampaignMemberTracksDialog({ visible, memberName, userId, startAt, endAt, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible || !userId) return
    setLoading(true)
    adminApi
      .activities(1, 100, { userId })
      .then((r) => {
        setRows((r.items ?? []) as Row[])
        setTotal(r.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [visible, userId])

  const inWindow = (t: number) => t >= startAt && t <= endAt
  const isExcluded = (r: Row) => (r.vehicleMs ?? 0) > 0 || (r.driftScore ?? 0) > 30
  const counted = rows.filter((r) => inWindow(r.startTime) && !isExcluded(r)).length

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
        if (!inWindow(row.startTime)) return <Tag theme="default" variant="light">活动外</Tag>
        if (isExcluded(row)) return <Tag theme="warning" variant="light">未计入（定位异常）</Tag>
        return <Tag theme="success" variant="light">计入</Tag>
      },
    },
  ]

  return (
    <Dialog
      visible={visible}
      header={`${memberName} 的全部轨迹（${total} 条）`}
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
          <div style={{ marginBottom: 8, fontSize: 12, color: '#86909c' }}>
            活动内计入 {counted} 条 · 未计入 {rows.filter((r) => inWindow(r.startTime) && isExcluded(r)).length} 条 ·
            活动外 {rows.filter((r) => !inWindow(r.startTime)).length} 条
          </div>
          <Table rowKey="id" data={rows} columns={columns} max-height={420} />
        </>
      )}
    </Dialog>
  )
}
