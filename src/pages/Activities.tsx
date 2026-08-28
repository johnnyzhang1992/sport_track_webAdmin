import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Input, Button, Select, InputNumber } from 'tdesign-react'
import { adminApi } from '../api'
import { typeLabel, STATUS_LABELS, fmtKm, fmtDuration, fmtDateTime } from '../utils/format'
import ActivityDetailDialog from '../components/ActivityDetailDialog'

interface Activity {
  id: string
  userId: string
  userNickname: string
  type: string
  status: string
  distance: number
  duration: number
  calories: number
  elevationGain: number
  startTime: number
}

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '散步', value: 'walking' },
  { label: '跑步', value: 'running' },
  { label: '徒步', value: 'hiking' },
  { label: '爬山', value: 'mountaineering' },
  { label: '骑行', value: 'cycling' },
  { label: '滑雪', value: 'skiing' },
  { label: '划船', value: 'rowing' },
  { label: '游泳', value: 'swimming' },
]

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '已完成', value: 'finished' },
  { label: '进行中', value: 'in_progress' },
  { label: '已作废', value: 'cancelled' },
]

export default function Activities() {
  const navigate = useNavigate()
  const [data, setData] = useState<Activity[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // 筛选
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [minDist, setMinDist] = useState<number | undefined>()
  const [maxDist, setMaxDist] = useState<number | undefined>()
  const [minDur, setMinDur] = useState<number | undefined>()
  const [maxDur, setMaxDur] = useState<number | undefined>()
  const [keyword, setKeyword] = useState('')

  const buildFilters = () => ({
    type,
    status,
    keyword,
    minDistance: minDist != null ? String(minDist) : '',
    maxDistance: maxDist != null ? String(maxDist) : '',
    minDuration: minDur != null ? String(minDur) : '',
    maxDuration: maxDur != null ? String(maxDur) : '',
  })

  const load = (p: number) => {
    setLoading(true)
    adminApi
      .activities(p, 20, buildFilters())
      .then((d) => {
        setData(d.items as Activity[])
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
    setType('')
    setStatus('')
    setMinDist(undefined)
    setMaxDist(undefined)
    setMinDur(undefined)
    setMaxDur(undefined)
    setKeyword('')
    setPage(1)
    setTimeout(() => load(1), 0)
  }

  return (
    <>
    <Card className="page-card" title={`轨迹列表（${total}）`}>
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Select style={{ width: 130 }} value={type} options={TYPE_OPTIONS} onChange={(v) => setType(String(v))} />
        <Select style={{ width: 130 }} value={status} options={STATUS_OPTIONS} onChange={(v) => setStatus(String(v))} />
        <Input
          placeholder="搜索用户昵称"
          style={{ width: 160 }}
          value={keyword}
          onChange={(v) => setKeyword(v)}
          onEnter={handleSearch}
        />
        <Button theme="primary" onClick={handleSearch}>查询</Button>
        <Button variant="outline" onClick={handleReset}>重置</Button>
      </div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#8a93a6' }}>距离(km)</span>
        <InputNumber
          placeholder="最小"
          style={{ width: 110 }}
          value={minDist}
          onChange={(v) => setMinDist(typeof v === 'number' ? v : v === undefined || v === null ? undefined : Number(v))}
        />
        <span style={{ color: '#c2c7d0' }}>~</span>
        <InputNumber
          placeholder="最大"
          style={{ width: 110 }}
          value={maxDist}
          onChange={(v) => setMaxDist(typeof v === 'number' ? v : v === undefined || v === null ? undefined : Number(v))}
        />
        <span style={{ fontSize: 13, color: '#8a93a6', marginLeft: 8 }}>时长(分)</span>
        <InputNumber
          placeholder="最小"
          style={{ width: 110 }}
          value={minDur}
          onChange={(v) => setMinDur(typeof v === 'number' ? v : v === undefined || v === null ? undefined : Number(v))}
        />
        <span style={{ color: '#c2c7d0' }}>~</span>
        <InputNumber
          placeholder="最大"
          style={{ width: 110 }}
          value={maxDur}
          onChange={(v) => setMaxDur(typeof v === 'number' ? v : v === undefined || v === null ? undefined : Number(v))}
        />
      </div>
      <Table
        data={data}
        rowKey="id"
        loading={loading}
        columns={[
          {
            colKey: 'userNickname',
            title: '用户',
            cell: ({ row }) => (
              <Button theme="primary" variant="text" style={{ padding: 0 }} onClick={() => navigate(`/users/${row.userId}`)}>
                {row.userNickname || '微信用户'}
              </Button>
            ),
          },
          { colKey: 'type', title: '类型', cell: ({ row }) => <Tag>{typeLabel(row.type)}</Tag> },
          {
            colKey: 'status',
            title: '状态',
            cell: ({ row }) => (
              <Tag theme={row.status === 'finished' ? 'success' : row.status === 'cancelled' ? 'danger' : 'warning'}>
                {STATUS_LABELS[row.status] || row.status}
              </Tag>
            ),
          },
          { colKey: 'distance', title: '距离 km', cell: ({ row }) => fmtKm(row.distance || 0) },
          { colKey: 'duration', title: '时长', cell: ({ row }) => fmtDuration(row.duration || 0) },
          { colKey: 'calories', title: '千卡' },
          { colKey: 'startTime', title: '开始时间', cell: ({ row }) => fmtDateTime(row.startTime) },
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
          pageSize: 20,
          showJumper: true,
          onChange: (info) => {
            setPage(info.current)
            load(info.current)
          },
        }}
      />
    </Card>

    <ActivityDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
