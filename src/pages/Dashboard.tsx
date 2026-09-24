import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Card, Table } from 'tdesign-react'
import * as echarts from 'echarts'
import { Users as UsersIcon, MapTrifold, Ruler, UserPlus, Footprints, Camera } from '@phosphor-icons/react'
import { adminApi, type AdminStatsCell } from '../api'
import FootprintMap from '../components/FootprintMap'
import { chartColors, onThemeChange } from '../utils/theme'

interface Overview {
  userCount: number
  activityCount: number
  finishedCount: number
  totalDistanceKm: number
  footprintCount: number
  footprintUserCount: number
  footprintPhotoCount: number
}

const EMPTY_CELL: AdminStatsCell = {
  newUsers: 0,
  newActivities: 0,
  finishedActivities: 0,
  newFootprints: 0,
  uv: 0,
  pv: 0,
}

/** 一张指标卡：主值 + 标签 + 可选副行（副行装 PV·UV、完成率这类次要口径） */
function Metric(props: {
  value: ReactNode
  label: string
  sub?: string
  Icon: typeof UsersIcon
  tint: string
}) {
  const { value, label, sub, Icon, tint } = props
  return (
    <div className="metric-card">
      <div className="metric-icon" style={{ color: tint, background: `${tint}14` }}>
        <Icon size={16} weight="duotone" />
      </div>
      <div className="metric-body">
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
        {sub ? <div className="metric-sub">{sub}</div> : null}
      </div>
    </div>
  )
}

/** 比值型主值：分母弱化，免得和「两个独立指标」混看 */
const Ratio = ({ a, b }: { a: number; b: number }) => (
  <>
    {a.toLocaleString()}
    <span className="metric-value-dim"> / {b.toLocaleString()}</span>
  </>
)

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [stats, setStats] = useState<{ [k: string]: AdminStatsCell } | null>(null)
  const [trendType, setTrendType] = useState('day')
  const [themeV, setThemeV] = useState(0) // 主题切换计数（触发图表重绘）
  const [region, setRegion] = useState<{ provinces: { name: string; count: number }[]; cities: { name: string; province: string; count: number }[] } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    adminApi.overview().then(setOverview).catch(() => setOverview(null))
    adminApi.adminStats().then(setStats).catch(() => setStats(null))
    adminApi.regionStats().then(setRegion).catch(() => setRegion(null))
  }, [])

  // 主题切换 → 图表重绘
  useEffect(() => onThemeChange(() => setThemeV((v) => v + 1)), [])

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
        const c = chartColors()
        chart.current.setOption({
          textStyle: { color: c.text },
          tooltip: { trigger: 'axis' },
          legend: { data: ['新增用户', '新增轨迹', '新增足迹'], top: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: c.text } },
          grid: { left: 40, right: 16, top: 52, bottom: 28 }, // top 让出 legend 空间避免重叠
          xAxis: {
            type: 'category',
            data: d.data.map((x) => trendLabel(x.date)),
            axisLabel: { interval: 'auto', color: c.text },
            axisLine: { lineStyle: { color: c.axisLine } },
          },
          yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.splitLine } } },
          series: [
            { name: '新增用户', type: 'bar', data: d.data.map((x) => x.newUsers), itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
            { name: '新增轨迹', type: 'bar', data: d.data.map((x) => x.newActivities), itemStyle: { color: '#00a870', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
            { name: '新增足迹', type: 'bar', data: d.data.map((x) => x.newFootprints), itemStyle: { color: '#ed7b2f', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18 },
          ],
        })
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [trendType, themeV])

  const RANGES = [
    { key: 'today', label: '今日', tint: '#0052d9' },
    { key: 'week', label: '本周', tint: '#00a870' },
    { key: 'month', label: '本月', tint: '#e37318' },
  ]
  const cell = (k: string) => stats?.[k] ?? EMPTY_CELL
  const n = (v?: number) => (v ?? 0).toLocaleString()

  const regionCols = (col: 'provinces' | 'cities') => [
    { colKey: 'name', title: col === 'provinces' ? '省份' : '城市' },
    { colKey: 'count', title: '轨迹数', cell: ({ row }: { row: { count: number } }) => `${row.count} 条` },
  ]

  return (
    <div>
      {/* 一、总数：四张卡，比值直接做主值，不再为「已完成」单开一张 */}
      <div className="dash-section-title">总数</div>
      <div className="metric-grid">
        <Metric value={n(overview?.userCount)} label="用户总数" Icon={UsersIcon} tint="#0052d9" />
        <Metric
          value={<Ratio a={overview?.finishedCount ?? 0} b={overview?.activityCount ?? 0} />}
          label="轨迹总数（已完成 / 总）"
          Icon={MapTrifold}
          tint="#00a870"
        />
        <Metric value={n(overview?.totalDistanceKm)} label="轨迹总距离 (km)" Icon={Ruler} tint="#834ec2" />
        <Metric value={n(overview?.footprintCount)} label="足迹总数" Icon={Footprints} tint="#0594fa" />
      </div>

      {/* 二、用户：PV 与 UV 合成一行，不再各占一张卡 */}
      <div className="dash-section-title">用户</div>
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {RANGES.map((r) => {
          const s = cell(r.key)
          return (
            <Metric
              key={r.key}
              value={n(s.newUsers)}
              label={`${r.label}新增用户`}
              sub={`登录 PV ${n(s.pv)} · UV ${n(s.uv)}`}
              Icon={UserPlus}
              tint={r.tint}
            />
          )
        })}
      </div>

      {/* 三、轨迹：主值就是 已完成 / 总，完成率放副行 */}
      <div className="dash-section-title">轨迹</div>
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {RANGES.map((r) => {
          const s = cell(r.key)
          return (
            <Metric
              key={r.key}
              value={<Ratio a={s.finishedActivities} b={s.newActivities} />}
              label={`${r.label}新增轨迹（已完成 / 总）`}
              sub={
                s.newActivities
                  ? `完成率 ${((s.finishedActivities / s.newActivities) * 100).toFixed(1)}%`
                  : '该周期还没有新增轨迹'
              }
              Icon={MapTrifold}
              tint={r.tint}
            />
          )
        })}
      </div>

      {/* 四、足迹：三档新增 + 一张累计卡（原来「记录足迹用户」「足迹照片」两张卡挪到这里） */}
      <div className="dash-section-title">足迹</div>
      <div className="metric-grid">
        {RANGES.map((r) => (
          <Metric key={r.key} value={n(cell(r.key).newFootprints)} label={`${r.label}新增足迹`} Icon={Footprints} tint={r.tint} />
        ))}
        <Metric
          value={<Ratio a={overview?.footprintUserCount ?? 0} b={overview?.footprintPhotoCount ?? 0} />}
          label="累计记录用户 / 照片"
          Icon={Camera}
          tint="#d4a107"
        />
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
                  background: trendType === t.key ? '#0052d9' : 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
                  color: trendType === t.key ? '#fff' : 'var(--td-text-color-secondary, #4e5969)',
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

      {/* 轨迹点亮地图（左） + 省份/城市分布列表（右） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start', marginTop: 24 }}>
        <Card className="page-card" title={`轨迹点亮地图${region ? `（${region.provinces.length} 省）` : ''}`}>
          <FootprintMap cities={region?.cities ?? []} height={480} />
        </Card>
        <div>
          <Card className="page-card" title="轨迹省份分布" style={{ marginBottom: 16 }}>
            <Table
              data={region?.provinces ?? []}
              rowKey="name"
              columns={regionCols('provinces')}
              maxHeight={280}
            />
          </Card>
          <Card className="page-card" title="轨迹城市分布">
            <Table
              data={region?.cities ?? []}
              rowKey="name"
              columns={regionCols('cities')}
              maxHeight={200}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
