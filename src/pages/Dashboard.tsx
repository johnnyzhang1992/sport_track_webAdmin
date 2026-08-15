import { useEffect, useState } from 'react'
import { Card, Statistic, Row, Col } from 'tdesign-react'
import { adminApi } from '../api'

interface AdminOverview {
  userCount: number
  activityCount: number
  finishedCount: number
  totalDistanceKm: number
}

export default function Dashboard() {
  const [data, setData] = useState<AdminOverview | null>(null)

  useEffect(() => {
    adminApi.overview().then(setData).catch(() => setData(null))
  }, [])

  const items = [
    { title: '用户总数', value: data?.userCount ?? 0, icon: '👤', cls: 'stat-icon-blue' },
    { title: '轨迹总数', value: data?.activityCount ?? 0, icon: '🗺️', cls: 'stat-icon-green' },
    { title: '已完成轨迹', value: data?.finishedCount ?? 0, icon: '✅', cls: 'stat-icon-orange' },
    { title: '总距离 (km)', value: data?.totalDistanceKm ?? 0, icon: '📏', cls: 'stat-icon-purple' },
  ]
  return (
    <div>
      <Row gutter={16}>
        {items.map((it) => (
          <Col span={6} key={it.title}>
            <Card className="page-card stat-card">
              <div className={`stat-icon ${it.cls}`}>{it.icon}</div>
              <Statistic title={it.title} value={it.value} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
