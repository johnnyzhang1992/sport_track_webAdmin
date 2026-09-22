import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Input, Button, Select, DateRangePicker } from 'tdesign-react'
import * as echarts from 'echarts'
import {
  adminApi,
  type FootprintGeoStats,
  type FootprintRecordItem,
  type FootprintStatsCell,
  type FootprintStatsRange,
} from '../api'
import { fmtDateTime } from '../utils/format'
import { footprintCategoryLabel } from '../utils/footprintCategory'
import { chartColors, onThemeChange } from '../utils/theme'
import FootprintDetailDialog from '../components/FootprintDetailDialog'
import FootprintStatsPanel from '../components/FootprintStatsPanel'
import PhotoCell from '../components/PhotoCell'
import FootprintMap from '../components/FootprintMap'

const PHOTO_OPTIONS = [
  { label: '全部照片', value: '' },
  { label: '有照片', value: '1' },
  { label: '≥2 张', value: '2' },
  { label: '3 张', value: '3' },
]

export default function Footprints() {
  const navigate = useNavigate()
  const [data, setData] = useState<FootprintRecordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // 数据概况：五档一次取回，切档只换索引（不再请求，避免闪屏）
  const [stats, setStats] = useState<Record<FootprintStatsRange, FootprintStatsCell> | null>(null)
  const [range, setRange] = useState<FootprintStatsRange>('today')

  // 趋势（固定近 30 天，不随时间范围变）+ 省份分布（跟随时间范围，与轨迹管理页同一分法）
  const [trend, setTrend] = useState<{ date: string; count: number; photos: number }[]>([])
  const [geo, setGeo] = useState<FootprintGeoStats | null>(null)
  const trendRef = useRef<HTMLDivElement>(null)
  const trendChart = useRef<echarts.ECharts | null>(null)
  const [themeV, setThemeV] = useState(0)

  // 筛选：关键词（标题/描述/地点/同行/昵称）、省份、照片数下限、到访日期区间
  const [keyword, setKeyword] = useState('')
  const [province, setProvince] = useState('')
  const [minPhotos, setMinPhotos] = useState('')
  const [visitRange, setVisitRange] = useState<[string, string] | null>(null)

  const loadStats = () => adminApi.footprintStats().then(setStats).catch(() => {})
  const loadTrend = () => adminApi.footprintTrend(30).then((d) => setTrend(d.data)).catch(() => {})
  const loadGeo = (r: FootprintStatsRange) => adminApi.footprintGeoStats(r).then(setGeo).catch(() => setGeo(null))

  const load = (p: number, ps?: number) => {
    setLoading(true)
    const size = ps ?? pageSize
    const filters: Record<string, string> = {}
    if (keyword.trim()) filters.keyword = keyword.trim()
    if (province.trim()) filters.province = province.trim()
    if (minPhotos) filters.minPhotos = minPhotos
    if (visitRange) {
      filters.visitFrom = visitRange[0]
      filters.visitTo = visitRange[1]
    }
    adminApi
      .footprintRecords(p, size, filters)
      .then((d) => {
        setData(d.items)
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
    loadStats()
    loadTrend()
  }, [])

  // 省份分布跟随时间档（挂载即首取；概况五档已在本地，切档不再请求）
  useEffect(() => {
    loadGeo(range)
  }, [range])

  // 主题切换 → 图表重绘
  useEffect(() => onThemeChange(() => setThemeV((v) => v + 1)), [])

  // 趋势：柱=新增足迹条数，折线=新增照片数（同为计数，量级差 ≤3 倍，不开右轴）
  useEffect(() => {
    if (!trendRef.current || trend.length === 0) return
    if (!trendChart.current) trendChart.current = echarts.init(trendRef.current)
    const c = chartColors()
    trendChart.current.setOption(
      {
        textStyle: { color: c.text },
        tooltip: { trigger: 'axis' },
        legend: { data: ['新增足迹', '新增照片'], top: 0, textStyle: { color: c.text } },
        grid: { left: 44, right: 24, top: 32, bottom: 28 },
        xAxis: {
          type: 'category',
          data: trend.map((d) => d.date.slice(5)),
          axisLabel: { color: c.text },
          axisLine: { lineStyle: { color: c.axisLine } },
        },
        yAxis: {
          type: 'value',
          name: '条',
          minInterval: 1,
          axisLabel: { color: c.text },
          splitLine: { lineStyle: { color: c.splitLine } },
        },
        series: [
          {
            name: '新增足迹',
            type: 'bar',
            barMaxWidth: 14,
            data: trend.map((d) => d.count),
            itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
          },
          {
            name: '新增照片',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: trend.map((d) => d.photos),
            itemStyle: { color: '#00a870' },
          },
        ],
      },
      true,
    )
    const ro = new ResizeObserver(() => trendChart.current?.resize())
    ro.observe(trendRef.current)
    return () => ro.disconnect()
  }, [trend, themeV])

  const handleSearch = () => {
    setPage(1)
    load(1)
  }

  const handleReset = () => {
    setKeyword('')
    setProvince('')
    setMinPhotos('')
    setVisitRange(null)
    setPage(1)
    // 状态是异步的，用清空后的值直接查（同轨迹列表页口径）
    setLoading(true)
    adminApi
      .footprintRecords(1, pageSize)
      .then((d) => {
        setData(d.items)
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  // 省份分布 → FootprintMap 城市平铺数据（组件内按省聚合上色、点省份弹窗看城市）
  const geoCities = (geo?.provinces ?? []).flatMap((p) =>
    p.cities.map((c) => ({ name: c.city, province: p.province, count: c.count })),
  )

  return (
    <>
      {/* 时间范围驱动概况与省份分布（列表另有自己的筛选），与轨迹管理页同形态 */}
      <FootprintStatsPanel stats={stats} range={range} onRangeChange={setRange} />

      {/* 趋势 + 省份分布（左图右地图，与轨迹管理页同一排布） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, marginBottom: 16 }}>
        <Card className="page-card" title="足迹趋势（近 30 天）">
          <div ref={trendRef} style={{ width: '100%', height: 300 }} />
        </Card>
        <Card
          className="page-card"
          title={geo ? `足迹省份分布（${geo.provinces.length} 省 / ${geo.total} 条）` : '足迹省份分布'}
        >
          {geoCities.length > 0 ? (
            <FootprintMap cities={geoCities} valueLabel="足迹数" />
          ) : (
            <div
              style={{
                padding: '60px 0',
                textAlign: 'center',
                color: 'var(--td-text-color-placeholder, #8a93a6)',
                fontSize: 13,
              }}
            >
              该时间段暂无足迹分布数据
            </div>
          )}
        </Card>
      </div>

      <Card className="page-card" title={`足迹列表（${total}）`}>
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Input
            placeholder="搜索标题/描述/地点/同行/用户昵称"
            style={{ width: 240 }}
            value={keyword}
            onChange={(v) => setKeyword(v)}
            onEnter={handleSearch}
            clearable
          />
          <Input placeholder="省份（精确匹配）" style={{ width: 150 }} value={province} onChange={(v) => setProvince(v)} onEnter={handleSearch} clearable />
          <Select style={{ width: 120 }} value={minPhotos} options={PHOTO_OPTIONS} onChange={(v) => setMinPhotos(String(v))} />
          <DateRangePicker
            placeholder={['到访开始', '到访结束']}
            valueType="YYYY-MM-DD"
            value={visitRange ?? []}
            onChange={(v) => {
              if (!v || !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]) {
                setVisitRange(null)
                return
              }
              setVisitRange([String(v[0]), String(v[1])])
            }}
            clearable
          />
          <Button theme="primary" onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={handleReset}>重置</Button>
          <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
            到访日期含开始日、不含结束日；列表按记录创建时间倒序
          </span>
        </div>
        <Table
          data={data}
          rowKey="id"
          loading={loading}
          columns={[
            {
              colKey: 'userNickname',
              title: '用户',
              width: 140,
              cell: ({ row }) => (
                <Button theme="primary" variant="text" style={{ padding: 0 }} onClick={() => navigate(`/users/${row.userId}`)}>
                  {row.userNickname || '微信用户'}
                </Button>
              ),
            },
            { colKey: 'userUid', title: 'UID', width: 80, cell: ({ row }) => row.userUid || '—' },
            { colKey: 'visitDate', title: '到访日期', width: 120 },
            { colKey: 'title', title: '标题', ellipsis: true },
            {
              colKey: 'placeName',
              title: '地点',
              ellipsis: true,
              cell: ({ row }) => (
                <span title={row.address || row.placeName}>
                  {row.placeName || '—'}
                  {row.address && row.address !== row.placeName ? (
                    <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)', marginLeft: 6 }}>{row.address}</span>
                  ) : null}
                </span>
              ),
            },
            { colKey: 'province', title: '省市', width: 130, cell: ({ row }) => (row.province ? `${row.province} ${row.city}` : '—') },
            { colKey: 'category', title: '分类', width: 100, cell: ({ row }) => footprintCategoryLabel(row.category) || '未分类' },
            {
              colKey: 'peopleCount',
              title: '同行',
              width: 90,
              cell: ({ row }) => (row.peopleCount ? <span title={row.people.join('、')}>{row.peopleCount} 人</span> : '—'),
            },
            {
              colKey: 'photos',
              title: '图片',
              width: 170,
              cell: ({ row }) => <PhotoCell row={row} load={adminApi.footprintPhotos} />,
            },
            { colKey: 'createdAt', title: '记录时间', width: 170, cell: ({ row }) => fmtDateTime(row.createdAt) },
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

      <FootprintDetailDialog
        id={detailId}
        onClose={() => setDetailId(null)}
        onDeleted={() => {
          load(page)
          // 删一条，概况五档 / 趋势 / 省份分布都得跟着重算
          loadStats()
          loadTrend()
          loadGeo(range)
        }}
      />
    </>
  )
}
