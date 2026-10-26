import { useEffect, useState } from 'react'
import { Dialog, Table, Tag, Loading, Select, MessagePlugin } from 'tdesign-react'
import {
  adminApi,
  type CampaignMemberActivities,
  type CampaignMemberActivityReason,
  type CampaignMemberActivityRow,
} from '../api'
import { TYPE_LABELS, fmtDateTime, fmtDuration, fmtKm, typeLabel } from '../utils/format'

interface Props {
  visible: boolean
  campaignId: string
  memberName: string
  userId: string
  /** 活动类型白名单：为空＝不限（下拉里给全类型） */
  allowedTypes: string[]
  onClose: () => void
}

const PAGE_SIZE = 20

const REASON_META: Record<
  CampaignMemberActivityReason,
  { label: string; theme: 'success' | 'warning' | 'default' }
> = {
  counted: { label: '计入', theme: 'success' },
  vehicle: { label: '未计入（疑似搭车）', theme: 'warning' },
  drift: { label: '未计入（定位漂移）', theme: 'warning' },
  unfinished: { label: '未完成', theme: 'default' },
  outside: { label: '活动外', theme: 'default' },
}

/**
 * 活动成员在活动窗口内的轨迹（弹窗）。
 *
 * 归属由服务端判（`/admin/campaigns/:id/member-activities`）：一个人可能离开再复归，
 * 只拿成员表当前一行的 joinedAt/leftAt 判不出「入队前/离队后」属于活动外；
 * 前端不再自己按 vehicleMs/driftScore 猜，避免与活动汇总、排行榜数字对不上。
 */
export default function CampaignMemberTracksDialog({
  visible,
  campaignId,
  memberName,
  userId,
  allowedTypes,
  onClose,
}: Props) {
  const [data, setData] = useState<CampaignMemberActivities | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')

  // 换成员/重新打开时回到第一页、清掉类型筛选，别带着上一位的筛选
  useEffect(() => {
    if (!visible) return
    setPage(1)
    setTypeFilter('')
    setData(null)
  }, [visible, userId])

  useEffect(() => {
    if (!visible || !userId) return
    let alive = true
    setLoading(true)
    adminApi
      .campaignMemberActivities(campaignId, userId, {
        page,
        pageSize: PAGE_SIZE,
        type: typeFilter || undefined,
      })
      .then((d) => {
        if (alive) setData(d)
      })
      .catch((e) => MessagePlugin.error((e as Error).message || '加载成员轨迹失败'))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [visible, campaignId, userId, page, typeFilter])

  const summary = data?.summary
  const excluded = summary ? summary.vehicle + summary.drift + summary.unfinished : 0
  const typeOptions = allowedTypes.length > 0 ? allowedTypes : Object.keys(TYPE_LABELS)

  const columns = [
    {
      colKey: 'startTime',
      title: '开始时间',
      width: 150,
      cell: ({ row }: { row: CampaignMemberActivityRow }) => (
        <span style={{ fontSize: 12 }}>{fmtDateTime(row.startTime)}</span>
      ),
    },
    {
      colKey: 'type',
      title: '类型',
      width: 80,
      cell: ({ row }: { row: CampaignMemberActivityRow }) => typeLabel(row.type),
    },
    {
      colKey: 'distance',
      title: '距离 (km)',
      width: 100,
      align: 'center' as const,
      cell: ({ row }: { row: CampaignMemberActivityRow }) => fmtKm(row.distance),
    },
    {
      colKey: 'duration',
      title: '时长',
      width: 100,
      align: 'center' as const,
      cell: ({ row }: { row: CampaignMemberActivityRow }) => fmtDuration(row.duration),
    },
    {
      colKey: 'driftScore',
      title: '漂移分',
      width: 80,
      align: 'center' as const,
      cell: ({ row }: { row: CampaignMemberActivityRow }) => {
        if (row.driftScore == null) return <span style={{ color: '#c2c7d0' }}>—</span>
        return row.reason === 'drift' ? (
          <Tag theme="danger" variant="light">{row.driftScore}</Tag>
        ) : (
          <span>{row.driftScore}</span>
        )
      },
    },
    {
      colKey: 'reason',
      title: '归属',
      cell: ({ row }: { row: CampaignMemberActivityRow }) => {
        const meta = REASON_META[row.reason]
        return (
          <Tag theme={meta.theme} variant="light">
            {meta.label}
          </Tag>
        )
      },
    },
  ]

  return (
    <Dialog
      visible={visible}
      header={`${memberName} · 活动期内轨迹`}
      width={880}
      style={{ maxHeight: '85vh' }}
      onClose={onClose}
      footer={false}
    >
      {loading && !data ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Loading text="加载中…" />
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 13, color: '#86909c' }}>
              共 {data?.total ?? 0} 条 · 计入 {summary?.counted ?? 0} 条 · 未计入 {excluded} 条
              （疑似搭车 {summary?.vehicle ?? 0} · 定位漂移 {summary?.drift ?? 0} · 未完成{' '}
              {summary?.unfinished ?? 0}） · 活动外 {summary?.outside ?? 0} 条
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: '#86909c' }}>类型筛选</span>
            <Select
              size="small"
              style={{ width: 160 }}
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(String(v ?? ''))
                setPage(1)
              }}
              clearable
              options={[
                { label: '全部类型', value: '' },
                ...typeOptions.map((t) => ({ label: typeLabel(t), value: t })),
              ]}
            />
          </div>
          {/* 行数封顶在弹窗内部滚：整页跟着滚会把表头和分页顶出视口（弹窗 maxHeight 85vh，
              250px ≈ 标题 + 摘要行 + 表头 + 分页 + 上下内边距） */}
          <Table
            rowKey="id"
            data={data?.items ?? []}
            columns={columns}
            empty="活动期内没有轨迹"
            loading={loading}
            maxHeight="calc(85vh - 250px)"
            pagination={{
              total: data?.total ?? 0,
              current: page,
              pageSize: PAGE_SIZE,
              showJumper: true,
              onChange: (info) => setPage(info.current),
            }}
          />
        </>
      )}
    </Dialog>
  )
}
