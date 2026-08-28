import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Input, Button, Space } from 'tdesign-react'
import { adminApi } from '../api'

interface User {
  id: string
  nickname: string
  openid: string
  weightKg: number
  heightCm: number
  createdAt: string
  lastLoginAt: string
  activityCount: number
}

export default function Users() {
  const navigate = useNavigate()
  const [data, setData] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const load = (p: number, kw = keyword) => {
    setLoading(true)
    adminApi
      .users(p, 20, kw)
      .then((d) => {
        setData(d.items as User[])
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1, '')
  }, [])

  const handleSearch = () => {
    setPage(1)
    load(1, keyword)
  }

  const fmtTime = (t: string) => {
    if (!t) return '—'
    const d = new Date(t)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <Card className="page-card" title={`用户列表（${total}）`}>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索昵称"
          value={keyword}
          onChange={(v) => setKeyword(v)}
          onEnter={handleSearch}
          style={{ width: 240 }}
        />
        <Button theme="primary" onClick={handleSearch}>搜索</Button>
      </Space>
      <Table
        data={data}
        rowKey="id"
        loading={loading}
        columns={[
          {
            colKey: 'nickname',
            title: '昵称',
            ellipsis: true,
            cell: ({ row }) => (
              <Button theme="primary" variant="text" style={{ padding: 0 }} onClick={() => navigate(`/users/${row.id}`)}>
                {row.nickname || '微信用户'}
              </Button>
            ),
          },
          { colKey: 'openid', title: 'openid', ellipsis: true },
          { colKey: 'weightKg', title: '体重 kg' },
          { colKey: 'heightCm', title: '身高 cm' },
          { colKey: 'activityCount', title: '轨迹数', cell: ({ row }) => <Tag>{row.activityCount ?? 0}</Tag> },
          { colKey: 'createdAt', title: '创建时间', cell: ({ row }) => fmtTime(row.createdAt) },
          { colKey: 'lastLoginAt', title: '最后登录', cell: ({ row }) => fmtTime(row.lastLoginAt) },
          {
            colKey: 'op',
            title: '操作',
            width: 90,
            cell: ({ row }) => (
              <Button size="small" theme="primary" variant="text" onClick={() => navigate(`/users/${row.id}`)}>
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
  )
}
