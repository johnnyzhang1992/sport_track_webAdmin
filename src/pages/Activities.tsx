import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Input, Button, Select, InputNumber } from 'tdesign-react'
import * as echarts from 'echarts'
import type { TableSort } from 'tdesign-react'
import { adminApi, type ActivityStatsRange, type ActivityStatsSection, type ActivityGeoStats } from '../api'
import { typeLabel, STATUS_LABELS, fmtKm, fmtDuration, fmtDateTime } from '../utils/format'
import ActivityDetailDialog from '../components/ActivityDetailDialog'
import FootprintMap from '../components/FootprintMap'

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
  startProvince: string
  startCity: string
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

const STAT_RANGES: { key: ActivityStatsRange; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '近7天' },
  { key: 'month', label: '近30天' },
  { key: 'year', label: '近一年' },
  { key: 'all', label: '累计' },
]

const kmNum = (m: number) => (m / 1000).toFixed(2).replace(/\.?0+$/, '')

/** range 切换按钮组（概况/地图共用样式，对齐用户详情页） */
function RangeButtons({ value, onChange }: { value: ActivityStatsRange; onChange: (v: ActivityStatsRange) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {STAT_RANGES.map((r) => (
        <div
          key={r.key}
          onClick={() => onChange(r.key)}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            background: value === r.key ? '#0052d9' : '#f2f3f5',
            color: value === r.key ? '#fff' : '#4e5969',
          }}
        >
          {r.label}
        </div>
      ))}
    </div>
  )
}

export default function Activities() {
  const navigate = useNavigate()
  const [data, setData] = useState<Activity[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // 筛选（状态默认已完成）
  const [type, setType] = useState('')
  const [status, setStatus] = useState('finished')
  const [minDist, setMinDist] = useState<number | undefined>()
  const [maxDist, setMaxDist] = useState<number | undefined>()
  const [minDur, setMinDur] = useState<number | undefined>()
  const [maxDur, setMaxDur] = useState<number | undefined>()
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TableSort>()
  const [pageSize, setPageSize] = useState(20)

  // 数据概况 + 趋势 + 省份分布
  const [stats, setStats] = useState<Record<ActivityStatsRange, ActivityStatsSection> | null>(null)
  const [statsRange, setStatsRange] = useState<ActivityStatsRange>('all')
  const [geo, setGeo] = useState<ActivityGeoStats | null>(null)
  const [geoRange, setGeoRange] = useState<ActivityStatsRange>('all')
  const [trend, setTrend] = useState<{ date: string; count: number; distanceKm: number }[]>([])
  const trendRef = useRef<HTMLDivElement>(null)
  const trendChart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    load(1)
    adminApi.activityStats().then(setStats).catch(() => {})
    adminApi.activityTrend(30).then((d) => setTrend(d.data)).catch(() => {})
  }, [])

  useEffect(() => {
    adminApi.activityGeoStats(geoRange).then(setGeo).catch(() => setGeo(null))
  }, [geoRange])

  // 趋势折线：轨迹数（左轴）+ 距离 km（右轴）
  useEffect(() => {
    if (!trendRef.current || trend.length === 0) return
    if (!trendChart.current) trendChart.current = echarts.init(trendRef.current)
    trendChart.current.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { data: ['轨迹数', '距离 (km)'], top: 0 },
        grid: { left: 44, right: 48, top: 32, bottom: 28 },
        xAxis: { type: 'category', data: trend.map((d) => d.date.slice(5)) },
        yAxis: [
          { type: 'value', name: '条' },
          { type: 'value', name: 'km' },
        ],
        series: [
          {
            name: '轨迹数',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: trend.map((d) => d.count),
            itemStyle: { color: '#0052d9' },
          },
          {
            name: '距离 (km)',
            type: 'bar',
            yAxisIndex: 1,
            barMaxWidth: 14,
            itemStyle: { color: 'rgba(0,168,112,0.55)' },
            data: trend.map((d) => d.distanceKm),
          },
        ],
      },
      true,
    )
    const ro = new ResizeObserver(() => trendChart.current?.resize())
    ro.observe(trendRef.current)
    return () => ro.disconnect()
  }, [trend])

  const buildFilters = () => ({
    type,
    status,
    keyword,
    minDistance: minDist != null ? String(minDist) : '',
    maxDistance: maxDist != null ? String(maxDist) : '',
    minDuration: minDur != null ? String(minDur) : '',
    maxDuration: maxDur != null ? String(maxDur) : '',
    sortBy: (sort as { sortBy?: string })?.sortBy || '',
    order: (sort as { descending?: boolean })?.descending ? 'desc' : (sort as { sortBy?: string })?.sortBy ? 'asc' : '',
  })

  const load = (p: number, ps?: number) => {
    setLoading(true)
    const size = ps ?? pageSize
    adminApi
      .activities(p, size, buildFilters())
      .then((d) => {
        setData(d.items as Activity[])
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  const handleSearch = () => {
    setPage(1)
    load(1)
  }

  const handleReset = () => {
    setType('')
    setStatus('finished')
    setMinDist(undefined)
    setMaxDist(undefined)
    setMinDur(undefined)
    setMaxDur(undefined)
    setKeyword('')
    setSort(undefined)
    setPage(1)
    setTimeout(() => load(1), 0)
  }

  const sec: ActivityStatsSection | undefined = stats?.[statsRange]
  // 省份分布 → FootprintMap 城市平铺数据（组件内按省聚合上色、点击省份弹窗展示城市）
  const geoCities = (geo?.provinces ?? []).flatMap((p) =>
    p.cities.map((c) => ({ name: c.city, province: p.province, count: c.count })),
  )

  return (
    <>
      {/* 轨迹数据概况（range 切换） */}
      <Card
        className="page-card"
        title="轨迹数据概况"
        style={{ marginBottom: 16 }}
        actions={<RangeButtons value={statsRange} onChange={setStatsRange} />}
      >
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { label: '轨迹数', value: String(sec?.count ?? 0) },
            { label: '距离 (km)', value: kmNum(sec?.distance ?? 0) },
            { label: '时长', value: fmtDuration(sec?.duration ?? 0) },
            { label: '卡路里 (千卡)', value: String(sec?.calories ?? 0) },
            { label: '累计爬升 (m)', value: String(sec?.elevationGain ?? 0) },
          ].map((it) => (
            <div key={it.label} style={{ background: '#f8f9fb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
              <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 趋势 + 省份分布 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <Card className="page-card" title="轨迹趋势（近 30 天）">
          <div ref={trendRef} style={{ width: '100%', height: 300 }} />
        </Card>
        <Card
          className="page-card"
          title={`轨迹省份分布${geo ? `（${geo.total}）` : ''}`}
          actions={<RangeButtons value={geoRange} onChange={setGeoRange} />}
        >
          {geoCities.length > 0 ? (
            <FootprintMap cities={geoCities} />
          ) : (
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#8a93a6', fontSize: 13 }}>
              该时间段暂无轨迹分布数据
            </div>
          )}
        </Card>
      </div>

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
          sort={sort}
          onSortChange={(s) => {
            setSort(s)
            setPage(1)
            load(1)
          }}
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
            { colKey: 'startProvince', title: '省份', cell: ({ row }) => row.startProvince || '—' },
            { colKey: 'startCity', title: '城市', cell: ({ row }) => row.startCity || '—' },
            { colKey: 'distance', title: '距离 km', sorter: true, cell: ({ row }) => fmtKm(row.distance || 0) },
            { colKey: 'duration', title: '时长', sorter: true, cell: ({ row }) => fmtDuration(row.duration || 0) },
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

      <ActivityDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
