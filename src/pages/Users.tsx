import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Input, Button, Space } from 'tdesign-react'
import type { TableSort } from 'tdesign-react'
import * as echarts from 'echarts'
import { adminApi, type UserStats, type UserTrendPoint, type UserTrendRange, type UserGeoStats } from '../api'
import FootprintMap from '../components/FootprintMap'
import { chartColors, onThemeChange } from '../utils/theme'

interface User {
  id: string
  nickname: string
  gender: number
  uid: string
  weightKg: number
  heightCm: number
  createdAt: string
  lastLoginAt: string
  activityCount: number
  lastLoginIp: string
  lastLoginProvince: string
  lastLoginCity: string
}

/** 用户趋势时间范围（快捷选择） */
const RANGES: { key: UserTrendRange; label: string }[] = [
  { key: 'week', label: '最近一周' },
  { key: 'month', label: '最近一月' },
  { key: 'year', label: '最近一年' },
]

/** 用户分布地图配色：用户越多颜色越亮（低→高） */
const USER_MAP_RAMP = ['#1b3a6b', '#1e63b8', '#2196f3', '#63c7f5', '#b6e8ff']

/** 时间范围按钮组（与轨迹页 RangeButtons 同款） */
function RangeButtons({ value, onChange }: { value: UserTrendRange; onChange: (v: UserTrendRange) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {RANGES.map((r) => (
        <div
          key={r.key}
          onClick={() => onChange(r.key)}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            background: value === r.key ? '#0052d9' : 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
            color: value === r.key ? '#fff' : 'var(--td-text-color-secondary, #4e5969)',
          }}
        >
          {r.label}
        </div>
      ))}
    </div>
  )
}

export default function Users() {
  const navigate = useNavigate()
  const [data, setData] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TableSort>({ sortBy: 'lastLoginAt', descending: true })
  const [pageSize, setPageSize] = useState(20)

  // 用户概况 + 趋势 + 分布
  const [stats, setStats] = useState<UserStats | null>(null)
  const [range, setRange] = useState<UserTrendRange>('week')
  const [trend, setTrend] = useState<UserTrendPoint[]>([])
  const [geo, setGeo] = useState<UserGeoStats | null>(null)
  const [themeV, setThemeV] = useState(0)
  const regRef = useRef<HTMLDivElement>(null)
  const loginRef = useRef<HTMLDivElement>(null)
  const regChart = useRef<echarts.ECharts | null>(null)
  const loginChart = useRef<echarts.ECharts | null>(null)

  useEffect(() => onThemeChange(() => setThemeV((v) => v + 1)), [])

  const load = (p: number, kw = keyword, s = sort, ps?: number) => {
    setLoading(true)
    const size = ps ?? pageSize
    const sortBy = (s as { sortBy?: string })?.sortBy || ''
    const order = (s as { descending?: boolean })?.descending ? 'desc' : 'asc'
    adminApi
      .users(p, size, kw, sortBy, order)
      .then((d) => {
        setData(d.items as User[])
        setTotal(d.total)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1, '')
    adminApi.userStats().then(setStats).catch(() => setStats(null))
    adminApi.userGeoStats().then(setGeo).catch(() => setGeo(null))
  }, [])

  useEffect(() => {
    adminApi
      .userTrend(range)
      .then((d) => setTrend(d.data))
      .catch(() => setTrend([]))
  }, [range])

  // 两个柱状图：注册用户量 / 登录数量（UV + PV）
  useEffect(() => {
    if (trend.length === 0) return
    const c = chartColors()
    const labels = trend.map((p) => (range === 'year' ? p.date.replace('-', '/') : p.date.slice(5)))
    const baseOption = {
      textStyle: { color: c.text },
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 20, top: 40, bottom: 28 },
      xAxis: {
        type: 'category' as const,
        data: labels,
        axisLabel: { color: c.text },
        axisLine: { lineStyle: { color: c.axisLine } },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: c.text },
        splitLine: { lineStyle: { color: c.splitLine } },
      },
    }

    if (regRef.current) {
      if (!regChart.current) regChart.current = echarts.init(regRef.current)
      regChart.current.setOption(
        {
          ...baseOption,
          series: [
            {
              name: '注册用户',
              type: 'bar',
              barMaxWidth: 22,
              itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
              data: trend.map((p) => p.newUsers),
            },
          ],
        },
        true,
      )
    }
    if (loginRef.current) {
      if (!loginChart.current) loginChart.current = echarts.init(loginRef.current)
      loginChart.current.setOption(
        {
          ...baseOption,
          legend: { data: ['UV', 'PV'], top: 0, textStyle: { color: c.text } },
          series: [
            {
              name: 'UV',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
              data: trend.map((p) => p.uv),
            },
            {
              name: 'PV',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#00a870', borderRadius: [4, 4, 0, 0] },
              data: trend.map((p) => p.pv),
            },
          ],
        },
        true,
      )
    }
  }, [trend, range, themeV])

  useEffect(() => {
    if (!regRef.current && !loginRef.current) return
    const ro = new ResizeObserver(() => {
      regChart.current?.resize()
      loginChart.current?.resize()
    })
    if (regRef.current) ro.observe(regRef.current)
    if (loginRef.current) ro.observe(loginRef.current)
    return () => ro.disconnect()
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

  // 分布数据 → FootprintMap 口径（count）：省维度用于着色，城市用于下钻
  // 「未知」不是真实省份，不上地图（避免拉高色阶导致其他省份偏暗），仅保留在右侧列表
  const geoCities = useMemo(
    () => (geo?.cities ?? []).filter((c) => c.province !== '未知').map((c) => ({ name: c.name, province: c.province, count: c.users })),
    [geo],
  )
  const geoProvinces = useMemo(
    () => (geo?.provinces ?? []).filter((p) => p.name !== '未知').map((p) => ({ name: p.name, count: p.users })),
    [geo],
  )
  const provinceTotalUsers = useMemo(
    () => (geo?.provinces ?? []).reduce((s, p) => s + p.users, 0),
    [geo],
  )

  const overviewItems = [
    { label: '用户总量', value: stats?.totalUsers ?? 0 },
    { label: '今日注册', value: stats?.today.newUsers ?? 0 },
    { label: '近7日注册', value: stats?.week.newUsers ?? 0 },
    { label: '近30日注册', value: stats?.month.newUsers ?? 0 },
    { label: '今日登录 UV', value: stats?.today.uv ?? 0 },
    { label: '今日登录 PV', value: stats?.today.pv ?? 0 },
    { label: '近7天 UV', value: stats?.week.uv ?? 0 },
    { label: '近7天 PV', value: stats?.week.pv ?? 0 },
  ]

  return (
    <>
      {/* 用户概况：总量 + 今日/近 7 日/近 30 日注册 + 今日/近 7 天 登录 UV、PV */}
      <Card className="page-card" title="用户概况" style={{ marginBottom: 16 }}>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {overviewItems.map((it) => (
            <div
              key={it.label}
              style={{ background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)', borderRadius: 8, padding: '14px 16px' }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {it.value.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 趋势筛选（两个柱状图联动） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 12, paddingRight: 24 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--td-text-color-primary, #1f2329)' }}>时间范围</span>
        <RangeButtons value={range} onChange={setRange} />
      </div>

      {/* 两个柱状图：注册用户量 / 登录数量（UV、PV） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card className="page-card" title="注册用户量">
          <div ref={regRef} style={{ width: '100%', height: 300 }} />
        </Card>
        <Card className="page-card" title="登录数量（UV / PV）">
          <div ref={loginRef} style={{ width: '100%', height: 300 }} />
        </Card>
      </div>

      {/* 用户分布：左地图（省维度点亮，用户越多越亮） + 右省份分布列表 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, marginBottom: 16 }}>
        <Card className="page-card" title={`用户分布地图${geo ? `（${geoProvinces.length} 省点亮）` : ''}`}>
          {geoCities.length > 0 ? (
            <FootprintMap
              cities={geoCities}
              provinces={geoProvinces}
              valueLabel="用户数"
              colorRamp={USER_MAP_RAMP}
              height={420}
            />
          ) : (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--td-text-color-placeholder, #8a93a6)', fontSize: 13 }}>
              暂无用户分布数据
            </div>
          )}
        </Card>
        <Card className="page-card" title={`用户省份分布（${geo?.provinces.length ?? 0}）`}>
          <Table
            rowKey="name"
            data={geoProvinces}
            maxHeight={420}
            columns={[
              {
                colKey: 'rank',
                title: '#',
                width: 50,
                align: 'center',
                cell: ({ rowIndex }) => <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)' }}>{rowIndex + 1}</span>,
              },
              { colKey: 'name', title: '省份' },
              {
                colKey: 'count',
                title: '用户数',
                align: 'right',
                width: 90,
                cell: ({ row }) => (
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{(row as { count: number }).count.toLocaleString()}</b>
                ),
              },
              {
                colKey: 'ratio',
                title: '占比',
                align: 'right',
                width: 80,
                cell: ({ row }) => {
                  const v = (row as { count: number }).count
                  return provinceTotalUsers > 0 ? `${((v / provinceTotalUsers) * 100).toFixed(1)}%` : '—'
                },
              },
            ]}
            empty="暂无用户分布数据"
          />
        </Card>
      </div>

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
          sort={sort}
          onSortChange={(s) => {
            setSort(s)
            setPage(1)
            load(1, keyword, s)
          }}
          columns={[
            {
              colKey: 'nickname',
              title: '昵称',
              width: 150,
              ellipsis: true,
              cell: ({ row }) => (
                <Button theme="primary" variant="text" style={{ padding: 0 }} onClick={() => navigate(`/users/${row.id}`)}>
                  {row.nickname || '微信用户'}
                </Button>
              ),
            },
            { colKey: 'gender', title: '性别', width: 70, cell: ({ row }) => row.gender === 1 ? <Tag theme="primary">男</Tag> : row.gender === 2 ? <Tag theme="danger">女</Tag> : <span style={{ color: 'var(--td-text-color-placeholder, #bbb)' }}>未知</span> },
            { colKey: 'uid', title: 'UID', width: 90, ellipsis: true, cell: ({ row }) => row.uid || '—' },
            { colKey: 'weightKg', title: '体重 kg' },
            { colKey: 'heightCm', title: '身高 cm' },
            { colKey: 'activityCount', title: '轨迹数', cell: ({ row }) => <Tag>{row.activityCount ?? 0}</Tag> },
            { colKey: 'lastLoginIp', title: '最后登录IP', width: 140, ellipsis: true, cell: ({ row }) => row.lastLoginIp || '—' },
            { colKey: 'lastLoginProvince', title: '省', width: 60, cell: ({ row }) => row.lastLoginProvince || '—' },
            { colKey: 'lastLoginCity', title: '市', width: 80, cell: ({ row }) => row.lastLoginCity || '—' },
            { colKey: 'createdAt', title: '创建时间', sorter: true, cell: ({ row }) => fmtTime(row.createdAt) },
            { colKey: 'lastLoginAt', title: '最后登录', sorter: true, cell: ({ row }) => fmtTime(row.lastLoginAt) },
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
            pageSize,
            showJumper: true,
            onChange: (info) => {
              setPage(info.current)
              load(info.current)
            },
            onPageSizeChange: (size) => {
              setPageSize(size)
              setPage(1)
              load(1, keyword, sort, size)
            },
          }}
        />
      </Card>
    </>
  )
}
