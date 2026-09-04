import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Table, Loading, MessagePlugin, Tabs, Space, DateRangePicker, Select } from 'tdesign-react'
import type { TableSort } from 'tdesign-react'
import { ArrowLeft, MapPin, Trophy } from '@phosphor-icons/react'
import * as echarts from 'echarts'
import { adminApi, type UserDetail as UserDetailData, type BestRow, type LoginLogItem } from '../api'
import { typeLabel, STATUS_LABELS, fmtKm, fmtDuration, fmtPace, fmtDateTime } from '../utils/format'
import ActivityDetailDialog from '../components/ActivityDetailDialog'
import FootprintMap from '../components/FootprintMap'

const RANGES = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '今年' },
  { key: 'total', label: '累计' },
] as const

const GENDER_LABELS: Record<number, string> = { 0: '未知', 1: '男', 2: '女' }

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '已完成', value: 'finished' },
  { label: '进行中', value: 'in_progress' },
  { label: '已作废', value: 'cancelled' },
]

interface ActivityRow {
  id: string
  type: string
  status: string
  distance: number
  duration: number
  calories: number
  elevationGain: number
  startTime: number
}

export default function UserDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<UserDetailData | null>(null)
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('today')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('activities') // 'activities' | 'login'
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null) // 地图下钻选中的省份

  // 用户轨迹列表（复用轨迹列表接口，按 userId 过滤）
  const [acts, setActs] = useState<ActivityRow[]>([])
  const [actTotal, setActTotal] = useState(0)
  const [actPage, setActPage] = useState(1)
  const [actLoading, setActLoading] = useState(false)
  const [actTypeFilter] = useState<string>('')
  const [actStatusFilter, setActStatusFilter] = useState<string>('finished')
  const [actSort, setActSort] = useState<TableSort>()
  const [actPageSize, setActPageSize] = useState(10)

  // 登录历史
  const [logs, setLogs] = useState<LoginLogItem[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logLoading, setLogLoading] = useState(false)
  const [logPageSize, setLogPageSize] = useState(20)
  const [logDateRange, setLogDateRange] = useState<[string, string] | null>(null)
  const [logQuickRange, setLogQuickRange] = useState<'7d' | '30d' | '180d' | null>(null)

  // 登录统计
  const [loginStats, setLoginStats] = useState<{ last7Days: number; last30Days: number; last180Days: number; total: number } | null>(null)

  useEffect(() => {
    adminApi
      .userDetail(id)
      .then(setDetail)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载用户详情失败'))
  }, [id])

  const loadActs = (p: number, typeFilter?: string, statusFilter?: string, sortVal?: TableSort, pageSize?: number) => {
    setActLoading(true)
    const filters: Record<string, string> = { userId: id }
    if (typeFilter ?? actTypeFilter) filters.type = typeFilter ?? actTypeFilter
    const sf = statusFilter ?? actStatusFilter
    if (sf) filters.status = sf
    const s = sortVal ?? actSort
    const sortBy = (s as { sortBy?: string })?.sortBy || ''
    const order = (s as { descending?: boolean })?.descending ? 'desc' : sortBy ? 'asc' : ''
    if (sortBy) filters.sortBy = sortBy
    if (order) filters.order = order
    const ps = pageSize ?? actPageSize
    adminApi
      .activities(p, ps, filters)
      .then((d) => {
        setActs(d.items as ActivityRow[])
        setActTotal(d.total)
      })
      .catch(() => setActs([]))
      .finally(() => setActLoading(false))
  }

  useEffect(() => {
    loadActs(1)
  }, [id])

  const loadLogs = (p: number, pageSize?: number, startDate?: string, endDate?: string) => {
    setLogLoading(true)
    const ps = pageSize ?? logPageSize
    adminApi
      .userLoginLogs(id, p, ps, startDate, endDate)
      .then((d) => {
        setLogs(d.items)
        setLogTotal(d.total)
      })
      .catch(() => setLogs([]))
      .finally(() => setLogLoading(false))
  }

  useEffect(() => {
    loadLogs(1)
  }, [id])

  // 加载登录统计
  useEffect(() => {
    if (activeTab === 'login') {
      adminApi.userLoginStats(id).then(setLoginStats).catch(() => {})
    }
  }, [id, activeTab])

  // 类型占比饼图（跟随概况 range；hooks 必须在 early return 之前，依赖用顶部 detail 避免 TDZ）
  const typePieRef = useRef<HTMLDivElement>(null)
  const typePieChart = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    const list = detail?.overview?.[range]?.byType ?? []
    if (!typePieRef.current || list.length === 0) return
    if (!typePieChart.current) typePieChart.current = echarts.init(typePieRef.current)
    typePieChart.current.setOption(
      {
        tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
        legend: { orient: 'vertical', right: 4, top: 'middle', itemHeight: 10, itemWidth: 10, textStyle: { fontSize: 12 } },
        series: [
          {
            name: '运动类型',
            type: 'pie',
            radius: ['42%', '68%'],
            center: ['34%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: { borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            data: list.map((t) => ({ name: typeLabel(t.type), value: t.count })),
          },
        ],
      },
      true,
    )
    const ro = new ResizeObserver(() => typePieChart.current?.resize())
    ro.observe(typePieRef.current)
    return () => ro.disconnect()
  }, [detail, range])

  const bestRows = (() => {
    if (!detail) return []
    const { maxDistanceByType, minPaceByType, maxDurationByType, maxElevationByType } = detail.best
    const types = new Set<string>()
    for (const arr of [maxDistanceByType, minPaceByType, maxDurationByType, maxElevationByType]) {
      arr.forEach((r) => types.add(r.type))
    }
    const find = (arr: BestRow[], t: string) => arr.find((r) => r.type === t)
    return [...types].map((t) => ({
      type: t,
      distance: find(maxDistanceByType, t)?.distance ?? 0,
      fastestKm: find(minPaceByType, t)?.fastestKm ?? null,
      duration: find(maxDurationByType, t)?.duration ?? 0,
      elevationGain: find(maxElevationByType, t)?.elevationGain ?? 0,
    }))
  })()

  if (!detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <Loading />
      </div>
    )
  }

  const { user, overview, footprint } = detail
  const sec = overview[range]
  const byStatus = sec?.byStatus ?? []
  const statusMap: Record<string, number> = { finished: 0, in_progress: 0, cancelled: 0 }
  byStatus.forEach((b) => {
    statusMap[b.status] = b.count
  })
  const totalCount = byStatus.reduce((sum, b) => sum + b.count, 0)
  const finishRate = sec?.finishRate ?? 0


  return (
    <div>
      <Button
        variant="text"
        icon={<ArrowLeft />}
        onClick={() => navigate('/users')}
        style={{ marginBottom: 12, marginLeft: -8 }}
      >
        返回用户列表
      </Button>

      {/* 个人资料卡 */}
      <Card className="page-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="头像" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#0052d9,#2b6cf6)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {(user.nickname || 'U')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              {user.nickname || '微信用户'}
              <Tag size="small">{GENDER_LABELS[user.gender] ?? '未知'}</Tag>
              <Tag size="small" theme="primary" variant="light">
                轨迹 {detail.activityCount}
              </Tag>
            </div>
            <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 4 }}>
              openid：{user.openid} · 身高 {user.heightCm ?? '—'}cm / 体重 {user.weightKg ?? '—'}kg
            </div>
            <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>
              注册 {fmtDateTime(user.createdAt)} · 最后登录 {fmtDateTime(user.lastLoginAt)}
            </div>
          </div>
        </div>
      </Card>

      {/* Tab 切换：轨迹详情 / 登录记录 */}
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string)} style={{ marginTop: 16 }}>
        <Tabs.TabPanel value="activities" label={`轨迹记录（${actTotal}）`}>
          {/* 数据概况（今日/周/月/年/累计切换） */}
          <Card
            className="page-card"
            title="数据概况"
            style={{ marginBottom: 16 }}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                {RANGES.map((r) => (
                  <div
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      background: range === r.key ? '#0052d9' : '#f2f3f5',
                      color: range === r.key ? '#fff' : '#4e5969',
                    }}
                  >
                    {r.label}
                  </div>
                ))}
              </div>
            }
          >
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { label: '轨迹数', value: String(totalCount) },
                { label: '距离 (km)', value: fmtKm(sec.distance) },
                { label: '时长', value: fmtDuration(sec.duration) },
                { label: '卡路里 (千卡)', value: String(sec.calories ?? 0) },
              ].map((it) => (
                <div key={it.label} style={{ background: '#f8f9fb', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
                  <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>{it.label}</div>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 24,
                fontSize: 13,
                color: '#4e5969',
                background: '#f8f9fb',
                borderRadius: 8,
                padding: '10px 16px',
              }}
            >
              <span style={{ color: '#8a93a6' }}>状态分布</span>
              <span>
                已完成 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{statusMap.finished}</b>
              </span>
              <span>
                进行中 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{statusMap.in_progress}</b>
              </span>
              <span>
                已作废 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{statusMap.cancelled}</b>
              </span>
              <span style={{ color: '#00a870' }}>
                完成率 <b>{finishRate}%</b>
              </span>
            </div>
          </Card>

          {/* 运动类型统计（跟随概况 range）：左饼图 + 右明细列表 */}
          <Card
            className="page-card"
            title="运动类型统计"
            style={{ marginBottom: 16 }}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                {RANGES.map((r) => (
                  <div
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    style={{
                      padding: '4px 14px',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      background: range === r.key ? '#0052d9' : '#f2f3f5',
                      color: range === r.key ? '#fff' : '#4e5969',
                    }}
                  >
                    {r.label}
                  </div>
                ))}
              </div>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'center' }}>
              <div ref={typePieRef} style={{ width: '100%', height: 260 }} />
              <Table
                rowKey="type"
                data={sec.byType ?? []}
                columns={[
                  { colKey: 'type', title: '类型', cell: ({ row }) => <Tag>{typeLabel(row.type)}</Tag> },
                  { colKey: 'count', title: '轨迹数', align: 'center' },
                  { colKey: 'distance', title: '距离 (km)', align: 'center', cell: ({ row }) => fmtKm(row.distance) },
                  { colKey: 'duration', title: '时长', align: 'center', cell: ({ row }) => fmtDuration(row.duration) },
                ]}
              />
            </div>
          </Card>

          {/* 个人最佳 + 点亮城市 */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
            <Card className="page-card" title={<span><Trophy size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: '#e37318' }} />个人最佳（按运动类型）</span>}>
              <Table
                data={bestRows}
                rowKey="type"
                columns={[
                  { colKey: 'type', title: '类型', cell: ({ row }) => <Tag>{typeLabel(row.type)}</Tag> },
                  { colKey: 'distance', title: '最远距离', cell: ({ row }) => `${fmtKm(row.distance)} km` },
                  { colKey: 'fastestKm', title: '最快配速 (1km)', cell: ({ row }) => fmtPace(row.fastestKm) },
                  { colKey: 'duration', title: '最长时长', cell: ({ row }) => fmtDuration(row.duration) },
                  { colKey: 'elevationGain', title: '最大爬升', cell: ({ row }) => `${row.elevationGain} m` },
                ]}
              />
            </Card>

            <Card
              className="page-card"
              title={<span><MapPin size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: '#00a870' }} />点亮城市{selectedProvince ? ` - ${selectedProvince}` : ''}</span>}
              actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {!selectedProvince && (
                    <span style={{ fontSize: 13, color: '#8a93a6' }}>
                      已点亮 <strong style={{ color: '#0052d9' }}>{footprint.provinceCount}</strong> 省 · <strong style={{ color: '#0052d9' }}>{footprint.cityCount}</strong> 城
                    </span>
                  )}
                  {selectedProvince ? (
                    <Button size="small" variant="text" onClick={() => setSelectedProvince(null)}>
                      返回全国
                    </Button>
                  ) : null}
                </div>
              }
            >
              {footprint.cities.length > 0 ? (
                <>
                  <FootprintMap
                    cities={footprint.cities}
                    onProvinceClick={(prov) => setSelectedProvince(prov)}
                  />
                  {selectedProvince && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, color: '#8a93a6', marginBottom: 8 }}>{selectedProvince} 已点亮城市：</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {footprint.cities
                          .filter((c) => c.province === selectedProvince)
                          .map((c) => (
                            <Tag key={`${c.province}-${c.name}`} theme="primary" variant="light">
                              {c.name} · {c.count}
                            </Tag>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, color: '#8a93a6' }}>暂无足迹数据</div>
              )}
            </Card>
          </div>

          {/* 轨迹列表 */}
          <Card className="page-card">
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Select
                style={{ width: 140 }}
                value={actStatusFilter}
                options={STATUS_OPTIONS}
                onChange={(v) => {
                  setActStatusFilter(String(v))
                  setActPage(1)
                  loadActs(1, undefined, String(v))
                }}
              />
            </div>
            <Table
              data={acts}
              rowKey="id"
              loading={actLoading}
              sort={actSort}
              onSortChange={(s) => {
                setActSort(s)
                setActPage(1)
                loadActs(1, undefined, undefined, s)
              }}
              columns={[
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
                total: actTotal,
                current: actPage,
                pageSize: actPageSize,
                showJumper: true,
                onChange: (info) => {
                  setActPage(info.current)
                  loadActs(info.current)
                },
                onPageSizeChange: (size) => {
                  setActPageSize(size)
                  setActPage(1)
                  loadActs(1, undefined, undefined, undefined, size)
                },
              }}
            />
          </Card>
        </Tabs.TabPanel>

        <Tabs.TabPanel value="login" label="登录记录">
          {/* 数据概况 */}
          {loginStats && (
            <Card className="page-card" title="数据概况" style={{ marginBottom: 16 }}>
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {[
                  { label: '最近7天', value: String(loginStats.last7Days) },
                  { label: '最近30天', value: String(loginStats.last30Days) },
                  { label: '最近半年', value: String(loginStats.last180Days) },
                  { label: '累计', value: String(loginStats.total) },
                ].map((it) => (
                  <div key={it.label} style={{ background: '#f8f9fb', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
                    <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>{it.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 登录记录表格 */}
          <Card className="page-card">
            <Space style={{ marginBottom: 12 }}>
              <DateRangePicker
                placeholder={['开始日期', '结束日期']}
                value={logDateRange ? [new Date(logDateRange[0]), new Date(logDateRange[1])] : undefined}
                onChange={(v) => {
                  if (!v || !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]) {
                    setLogDateRange(null)
                    setLogQuickRange(null)
                    setLogPage(1)
                    loadLogs(1)
                    return
                  }
                  const toDateStr = (d: unknown) => {
                    if (d instanceof Date) return d.toISOString().split('T')[0]
                    if (typeof d === 'string') return d
                    return ''
                  }
                  const start = toDateStr(v[0])
                  const end = toDateStr(v[1])
                  if (!start || !end) return
                  setLogDateRange([start, end])
                  setLogQuickRange(null)
                  setLogPage(1)
                  loadLogs(1, undefined, start, end)
                }}
                clearable
              />
              <Button
                size="small"
                variant={logQuickRange === '7d' ? 'base' : 'text'}
                onClick={() => {
                  const end = new Date()
                  const start = new Date()
                  start.setDate(start.getDate() - 7)
                  const s = start.toISOString().split('T')[0]
                  const e = end.toISOString().split('T')[0]
                  setLogQuickRange('7d')
                  setLogDateRange([s, e])
                  setLogPage(1)
                  loadLogs(1, undefined, s, e)
                }}
              >
                最近7天
              </Button>
              <Button
                size="small"
                variant={logQuickRange === '30d' ? 'base' : 'text'}
                onClick={() => {
                  const end = new Date()
                  const start = new Date()
                  start.setDate(start.getDate() - 30)
                  const s = start.toISOString().split('T')[0]
                  const e = end.toISOString().split('T')[0]
                  setLogQuickRange('30d')
                  setLogDateRange([s, e])
                  setLogPage(1)
                  loadLogs(1, undefined, s, e)
                }}
              >
                最近30天
              </Button>
              <Button
                size="small"
                variant={logQuickRange === '180d' ? 'base' : 'text'}
                onClick={() => {
                  const end = new Date()
                  const start = new Date()
                  start.setDate(start.getDate() - 180)
                  const s = start.toISOString().split('T')[0]
                  const e = end.toISOString().split('T')[0]
                  setLogQuickRange('180d')
                  setLogDateRange([s, e])
                  setLogPage(1)
                  loadLogs(1, undefined, s, e)
                }}
              >
                最近半年
              </Button>
              {(logDateRange || logQuickRange) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setLogDateRange(null)
                    setLogQuickRange(null)
                    setLogPage(1)
                    loadLogs(1)
                  }}
                >
                  清除筛选
                </Button>
              )}
            </Space>

            <Table
              data={logs}
              rowKey="id"
              loading={logLoading}
              columns={[
                { colKey: 'ip', title: 'IP', width: 140 },
                { colKey: 'province', title: '省', width: 80, cell: ({ row }) => row.province || '—' },
                { colKey: 'city', title: '市', width: 80, cell: ({ row }) => row.city || '—' },
                { colKey: 'platform', title: '平台', width: 90, cell: ({ row }) => row.platform || '—' },
                { colKey: 'system', title: '系统', ellipsis: true, cell: ({ row }) => row.system || '—' },
                { colKey: 'brand', title: '品牌', width: 80, cell: ({ row }) => row.brand || '—' },
                { colKey: 'model', title: '机型', ellipsis: true, cell: ({ row }) => row.model || '—' },
                { colKey: 'sdkVersion', title: 'SDK', width: 90, cell: ({ row }) => row.sdkVersion || '—' },
                { colKey: 'appVersion', title: '版本', width: 80, cell: ({ row }) => row.appVersion || '—' },
                { colKey: 'createdAt', title: '登录时间', width: 170, cell: ({ row }) => fmtDateTime(new Date(row.createdAt).getTime()) },
              ]}
              pagination={{
                total: logTotal,
                current: logPage,
                pageSize: logPageSize,
                showJumper: true,
                onChange: (info) => {
                  setLogPage(info.current)
                  loadLogs(info.current, undefined, logDateRange?.[0], logDateRange?.[1])
                },
                onPageSizeChange: (size) => {
                  setLogPageSize(size)
                  setLogPage(1)
                  loadLogs(1, size, logDateRange?.[0], logDateRange?.[1])
                },
              }}
            />
          </Card>
        </Tabs.TabPanel>
      </Tabs>

      <ActivityDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
