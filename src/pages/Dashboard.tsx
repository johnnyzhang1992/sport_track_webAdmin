import { useEffect, useRef, useState } from 'react'
import { Card, Row, Col, Table } from 'tdesign-react'
import * as echarts from 'echarts'
import { Users as UsersIcon, MapTrifold, CheckCircle, Ruler, UserPlus, Eye } from '@phosphor-icons/react'
import { adminApi } from '../api'

interface Overview {
  userCount: number
  activityCount: number
  finishedCount: number
  totalDistanceKm: number
}

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [stats, setStats] = useState<{ [k: string]: { newUsers: number; newActivities: number; uv: number; pv: number } } | null>(null)
  const [trendType, setTrendType] = useState('day')
  const [region, setRegion] = useState<{ provinces: { name: string; count: number }[]; cities: { name: string; count: number }[] } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    adminApi.overview().then(setOverview).catch(() => setOverview(null))
    adminApi.adminStats().then(setStats).catch(() => setStats(null))
    adminApi.regionStats().then(setRegion).catch(() => setRegion(null))
  }, [])

  // 趋势图（按维度切换：天/周/月/年）
  const trendLabel = (date: string) => {
    if (trendType === 'year') {
      const [y, h] = date.split('-')
      return `${y.slice(2)}${h === 'H1' ? '上' : '下'}`
    }
    if (trendType === 'week') return date.replace(/^\d{4}-W/, 'W') // 2026-W09 → W09
    if (trendType === 'month') return date.replace('-', '/') // 2025-09 → 2025/09
    return date.slice(5) // MM-DD
  }
  useEffect(() => {
    let disposed = false
    adminApi
      .adminTrend(trendType)
      .then((d) => {
        if (disposed || !chartRef.current) return
        if (!chart.current) chart.current = echarts.init(chartRef.current)
        chart.current.setOption({
          tooltip: { trigger: 'axis' },
          legend: { data: ['新增用户', '新增轨迹'], top: 0, itemWidth: 14, itemHeight: 10 },
          grid: { left: 40, right: 16, top: 52, bottom: 28 }, // top 让出 legend 空间避免重叠
          xAxis: { type: 'category', data: d.data.map((x) => trendLabel(x.date)), axisLabel: { interval: 'auto' } },
          yAxis: { type: 'value', minInterval: 1 },
          series: [
            { name: '新增用户', type: 'bar', data: d.data.map((x) => x.newUsers), itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
            { name: '新增轨迹', type: 'bar', data: d.data.map((x) => x.newActivities), itemStyle: { color: '#00a870', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
          ],
        })
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [trendType])

  const overviewItems = [
    { title: '用户总数', value: overview?.userCount ?? 0, Icon: UsersIcon, tint: '#0052d9' },
    { title: '轨迹总数', value: overview?.activityCount ?? 0, Icon: MapTrifold, tint: '#00a870' },
    { title: '已完成轨迹', value: overview?.finishedCount ?? 0, Icon: CheckCircle, tint: '#e37318' },
    { title: '总距离 (km)', value: overview?.totalDistanceKm ?? 0, Icon: Ruler, tint: '#834ec2' },
  ]

  const RANGES = [
    { key: 'today', label: '今日', tint: '#0052d9' },
    { key: 'week', label: '本周', tint: '#00a870' },
    { key: 'month', label: '本月', tint: '#e37318' },
  ]

  const regionCols = (col: 'provinces' | 'cities') => [
    { colKey: 'name', title: col === 'provinces' ? '省份' : '城市' },
    { colKey: 'count', title: '轨迹数', cell: ({ row }: { row: { count: number } }) => `${row.count} 条` },
  ]

  return (
    <div>
      <div className="metric-grid">
        {overviewItems.map((it) => (
          <div className="metric-card" key={it.title}>
            <div className="metric-icon" style={{ color: it.tint, background: `${it.tint}14` }}>
              <it.Icon size={20} weight="duotone" />
            </div>
            <div className="metric-body">
              <div className="metric-value">{it.value.toLocaleString()}</div>
              <div className="metric-label">{it.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 时间维度：今日/本周/本月 指标（metric-card 风格，按周期着色） */}
      <div className="metric-grid" style={{ marginTop: 16 }}>
        {RANGES.flatMap((r) => {
          const s = stats?.[r.key] ?? { newUsers: 0, newActivities: 0, uv: 0, pv: 0 }
          const cells = [
            { key: `${r.key}-nu`, label: `${r.label}新增用户`, value: s.newUsers, Icon: UserPlus },
            { key: `${r.key}-na`, label: `${r.label}新增轨迹`, value: s.newActivities, Icon: MapTrifold },
            { key: `${r.key}-uv`, label: `${r.label}登录UV`, value: s.uv, Icon: UsersIcon },
            { key: `${r.key}-pv`, label: `${r.label}登录PV`, value: s.pv, Icon: Eye },
          ]
          return cells.map((it) => (
            <div className="metric-card" key={it.key}>
              <div className="metric-icon" style={{ color: r.tint, background: `${r.tint}14` }}>
                <it.Icon size={20} weight="duotone" />
              </div>
              <div className="metric-body">
                <div className="metric-value">{it.value.toLocaleString()}</div>
                <div className="metric-label">{it.label}</div>
              </div>
            </div>
          ))
        })}
      </div>

      {/* 数据趋势（维度切换：天/周/月/年） */}
      <Card
        className="page-card"
        title="数据趋势"
        style={{ marginTop: 16 }}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'day', label: '天' },
              { key: 'week', label: '周' },
              { key: 'month', label: '月' },
              { key: 'year', label: '年' },
            ].map((t) => (
              <div
                key={t.key}
                onClick={() => setTrendType(t.key)}
                style={{
                  padding: '4px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: trendType === t.key ? '#0052d9' : '#f2f3f5',
                  color: trendType === t.key ? '#fff' : '#4e5969',
                }}
              >
                {t.label}
              </div>
            ))}
          </div>
        }
      >
        <div ref={chartRef} style={{ height: 300 }} />
      </Card>

      {/* 省份/城市分布 */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card className="page-card" title="轨迹省份分布">
            <Table
              data={region?.provinces ?? []}
              rowKey="name"
              columns={regionCols('provinces')}
              maxHeight={320}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card className="page-card" title="轨迹城市分布">
            <Table
              data={region?.cities ?? []}
              rowKey="name"
              columns={regionCols('cities')}
              maxHeight={320}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
