import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Table, Loading, MessagePlugin, Select } from 'tdesign-react'
import type { TableSort } from 'tdesign-react'
import { ArrowLeft, MapPin, Trophy } from '@phosphor-icons/react'
import { adminApi, type UserDetail as UserDetailData, type BestRow, type LoginLogItem } from '../api'
import { typeLabel, TYPE_LABELS, STATUS_LABELS, fmtKm, fmtDuration, fmtPace, fmtDateTime } from '../utils/format'
import ActivityDetailDialog from '../components/ActivityDetailDialog'

const RANGES = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '今年' },
  { key: 'total', label: '累计' },
] as const

const GENDER_LABELS: Record<number, string> = { 0: '未知', 1: '男', 2: '女' }

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
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('total')
  const [detailId, setDetailId] = useState<string | null>(null)

  // 用户轨迹列表（复用轨迹列表接口，按 userId 过滤）
  const [acts, setActs] = useState<ActivityRow[]>([])
  const [actTotal, setActTotal] = useState(0)
  const [actPage, setActPage] = useState(1)
  const [actLoading, setActLoading] = useState(false)
  const [actTypeFilter, setActTypeFilter] = useState<string>('')
  const [actStatusFilter, setActStatusFilter] = useState<string>('finished')
  const [actSort, setActSort] = useState<TableSort>()

  // 登录历史
  const [logs, setLogs] = useState<LoginLogItem[]>([])
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logLoading, setLogLoading] = useState(false)

  useEffect(() => {
    adminApi
      .userDetail(id)
      .then(setDetail)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载用户详情失败'))
  }, [id])

  const loadActs = (p: number, typeFilter?: string, statusFilter?: string, sortVal?: TableSort) => {
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
    adminApi
      .activities(p, 10, filters)
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

  const loadLogs = (p: number) => {
    setLogLoading(true)
    adminApi
      .userLoginLogs(id, p, 20)
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

      {/* 数据概况（今日/周/月/年/累计切换） */}
      <Card
        className="page-card"
        title="数据概况"
        style={{ marginTop: 16 }}
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
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {[
            { label: '轨迹数', value: String(sec.count) },
            { label: '距离 (km)', value: fmtKm(sec.distance) },
            { label: '时长', value: fmtDuration(sec.duration) },
            { label: '累计爬升 (m)', value: String(sec.elevationGain ?? 0) },
            { label: '卡路里 (千卡)', value: String(sec.calories ?? 0) },
          ].map((it) => (
            <div key={it.label} style={{ background: '#f8f9fb', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
              <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 个人最佳 + 点亮城市 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginTop: 16 }}>
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
          title={<span><MapPin size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: '#00a870' }} />点亮城市</span>}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, background: '#f8f9fb', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{footprint.provinceCount}</div>
              <div style={{ fontSize: 13, color: '#8a93a6' }}>点亮省份</div>
            </div>
            <div style={{ flex: 1, background: '#f8f9fb', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{footprint.cityCount}</div>
              <div style={{ fontSize: 13, color: '#8a93a6' }}>点亮城市</div>
            </div>
          </div>
          {footprint.cities.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {footprint.cities.map((c) => (
                <Tag key={`${c.province}-${c.name}`} theme="primary" variant="light">
                  {c.name} · {c.count}
                </Tag>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#8a93a6' }}>暂无足迹数据</div>
          )}
        </Card>
      </div>

      {/* 该用户轨迹列表 */}
      <Card
        className="page-card"
        title={<span>轨迹记录（{actTotal}）</span>}
        style={{ marginTop: 16 }}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              size="small"
              placeholder="全部类型"
              clearable
              value={actTypeFilter}
              onChange={(v) => {
                const val = Array.isArray(v) ? v[0] : v
                setActTypeFilter(val as string)
                setActPage(1)
                loadActs(1, val as string, undefined)
              }}
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ label, value }))}
              style={{ width: 120 }}
            />
            <Select
              size="small"
              placeholder="全部状态"
              clearable
              value={actStatusFilter}
              onChange={(v) => {
                const val = Array.isArray(v) ? v[0] : v
                setActStatusFilter(val as string)
                setActPage(1)
                loadActs(1, undefined, val as string)
              }}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }))}
              style={{ width: 120 }}
            />
          </div>
        }
      >
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
            pageSize: 10,
            showJumper: true,
            onChange: (info) => {
              setActPage(info.current)
              loadActs(info.current)
            },
          }}
        />
      </Card>

      {/* 登录历史 */}
      <Card className="page-card" title={`登录记录（${logTotal}）`} style={{ marginTop: 16 }}>
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
            pageSize: 20,
            showJumper: true,
            onChange: (info) => {
              setLogPage(info.current)
              loadLogs(info.current)
            },
          }}
        />
      </Card>

      <ActivityDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
