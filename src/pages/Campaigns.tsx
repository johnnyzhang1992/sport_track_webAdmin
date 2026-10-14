import { useEffect, useState } from 'react'
import { Card, Table, Button, Select, Tag } from 'tdesign-react'
import { adminApi, type CampaignItem } from '../api'
import { fmtDateTime } from '../utils/format'
import CampaignDetailDialog from '../components/CampaignDetailDialog'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '进行中', value: 'active' },
  { label: '已结束', value: 'ended' },
  { label: '已解散', value: 'dissolved' },
]

const VISIBILITY_OPTIONS = [
  { label: '全部可见性', value: '' },
  { label: '公开', value: 'public' },
  { label: '私密', value: 'private' },
]

/** 活动状态是服务端派生值（已到期但库内仍为 active 的，服务端按 ended 下发），前端不按 endAt 重算 */
const STATUS_LABELS: Record<string, string> = { active: '进行中', ended: '已结束', dissolved: '已解散' }
const STATUS_THEMES: Record<string, 'success' | 'default' | 'warning'> = {
  active: 'success',
  ended: 'default',
  dissolved: 'warning',
}

const VISIBILITY_LABELS: Record<string, string> = { public: '公开', private: '私密' }
const VISIBILITY_THEMES: Record<string, 'primary' | 'default'> = { public: 'primary', private: 'default' }

/** 一起运动活动（只读列表：状态 / 可见性筛选 + 详情弹窗，无任何写操作） */
export default function Campaigns() {
  const [data, setData] = useState<CampaignItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // 筛选：状态、可见性（均为服务端枚举，非法值服务端回 400，这里只发合法枚举或省略）
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState('')

  const load = (p: number, ps?: number) => {
    setLoading(true)
    const size = ps ?? pageSize
    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (visibility) filters.visibility = visibility
    adminApi
      .campaigns(p, size, filters)
      .then((d) => {
        setData(d.items)
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
  }, [])

  const handleSearch = () => {
    setPage(1)
    load(1)
  }

  const handleReset = () => {
    setStatus('')
    setVisibility('')
    setPage(1)
    // 状态是异步的，用清空后的值直接查（同足迹列表页口径）
    setLoading(true)
    adminApi
      .campaigns(1, pageSize)
      .then((d) => {
        setData(d.items)
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Card className="page-card" title={`活动列表（${total}）`}>
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Select style={{ width: 140 }} value={status} options={STATUS_OPTIONS} onChange={(v) => setStatus(String(v))} />
          <Select
            style={{ width: 150 }}
            value={visibility}
            options={VISIBILITY_OPTIONS}
            onChange={(v) => setVisibility(String(v))}
          />
          <Button theme="primary" onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={handleReset}>重置</Button>
          <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
            状态由服务端派生（已结束含已到期但库内仍为 active 的活动）；列表按创建时间倒序
          </span>
        </div>
        <Table
          data={data}
          rowKey="id"
          loading={loading}
          columns={[
            { colKey: 'title', title: '标题', ellipsis: true },
            {
              colKey: 'visibility',
              title: '可见性',
              width: 90,
              cell: ({ row }) => (
                <Tag theme={VISIBILITY_THEMES[row.visibility] || 'default'} variant="light">
                  {VISIBILITY_LABELS[row.visibility] || row.visibility}
                </Tag>
              ),
            },
            {
              colKey: 'status',
              title: '状态',
              width: 90,
              cell: ({ row }) => (
                <Tag theme={STATUS_THEMES[row.status] || 'default'} variant="light">
                  {STATUS_LABELS[row.status] || row.status}
                </Tag>
              ),
            },
            {
              colKey: 'members',
              title: '人数',
              width: 150,
              cell: ({ row }) => (
                <span title={row.memberLimit == null ? '不限' : `上限 ${row.memberLimit} 人`}>
                  {row.joinedCount} 人
                  {row.pendingCount > 0 ? (
                    <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)', marginLeft: 6 }}>
                      （待审 {row.pendingCount}）
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              colKey: 'creator',
              title: '创建者',
              width: 170,
              cell: ({ row }) => (
                <>
                  {row.creatorNickname || '微信用户'}
                  <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)', marginLeft: 6 }}>
                    UID {row.creatorUid ?? '—'}
                  </span>
                </>
              ),
            },
            {
              colKey: 'time',
              title: '起止时间',
              width: 340,
              cell: ({ row }) => (
                <span style={{ fontSize: 12 }}>
                  {fmtDateTime(row.startAt)} ~ {fmtDateTime(row.endAt)}
                </span>
              ),
            },
            {
              colKey: 'op',
              title: '操作',
              width: 80,
              cell: ({ row }) => (
                <Button size="small" theme="primary" variant="text" onClick={() => setDetailId(row.id)}>
                  详情
                </Button>
              ),
            },
          ]}
          pagination={{
            total,
            current: page,
            pageSize,
            showJumper: true,
            onChange: (info) => {
              setPage(info.current)
              load(info.current)
            },
            onPageSizeChange: (size) => {
              setPageSize(size)
              setPage(1)
              load(1, size)
            },
          }}
        />
      </Card>

      <CampaignDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
