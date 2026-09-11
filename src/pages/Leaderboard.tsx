import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Select, Loading, MessagePlugin } from 'tdesign-react'
import { adminApi, type LeaderboardData, type LeaderboardRegions, type LeaderboardRankRow } from '../api'
import { TYPE_LABELS } from '../utils/format'

/**
 * 运动榜（管理端）：与小程序运动榜同口径
 * - 类型 / 周期 / 省份筛选 + 本榜最佳 + TOP 20
 * - 点击用户行跳转用户详情页（行数据带 userId）
 */

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))

const PERIOD_OPTIONS = [
  { value: 'week', label: '周榜' },
  { value: 'month', label: '月榜' },
  { value: 'year', label: '年榜' },
  { value: 'all', label: '总榜' },
]

const GENDER_LABELS: Record<number, string> = { 0: '未知', 1: '男', 2: '女' }

/** 本榜最佳指标文案与格式化（与小程序口径一致；后端回原始值：米 / 秒） */
const BEST_LABELS: Record<string, string> = {
  farthest: '最长距离',
  longest: '最长时间',
  fastestKm: '最快配速',
  fastestAvg: '最快均速',
  maxClimb: '最大爬升',
}

function fmtBestValue(key: string, v: number): string {
  if (key === 'farthest') return `${(v / 1000).toFixed(2)} km`
  if (key === 'longest') {
    const s = Math.max(0, Math.round(v))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const p = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`
  }
  if (key === 'fastestKm') {
    const m = Math.floor(v / 60)
    const s = Math.round(v - m * 60)
    return `${m}'${String(s).padStart(2, '0')}"`
  }
  if (key === 'fastestAvg') return `${v.toFixed(1)} km/h` // 后端直接回均速 km/h
  if (key === 'maxClimb') return `${Math.round(v)} m`
  return String(v)
}

const RANK_COLORS: Record<number, string> = { 1: '#e6a23c', 2: '#8a93a6', 3: '#c0764a' }

/** 按钮组（与概览/用户详情页 RangeButtons 同款样式） */
function SegmentButtons({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <div
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            background: value === o.value ? '#0052d9' : 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
            color: value === o.value ? '#fff' : 'var(--td-text-color-secondary, #4e5969)',
          }}
        >
          {o.label}
        </div>
      ))}
    </div>
  )
}

const FILTER_LABEL_STYLE: React.CSSProperties = { fontSize: 13, color: 'var(--td-text-color-secondary, #4e5969)', flexShrink: 0 }

export default function Leaderboard() {
  const navigate = useNavigate()
  const [type, setType] = useState('walking')
  const [period, setPeriod] = useState('week')
  const [province, setProvince] = useState('全国')
  const [regions, setRegions] = useState<LeaderboardRegions | null>(null)
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    adminApi.leaderboardRegions().then(setRegions).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    adminApi
      .leaderboard(type, period, province)
      .then(setData)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载运动榜失败'))
      .finally(() => setLoading(false))
  }, [type, period, province])

  const onRowClick = (row: LeaderboardRankRow) => {
    if (row.userId) navigate(`/users/${row.userId}`)
  }

  return (
    <div>
      <Card className="page-card" title="运动榜" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={FILTER_LABEL_STYLE}>运动类型</span>
            <SegmentButtons value={type} options={TYPE_OPTIONS} onChange={setType} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={FILTER_LABEL_STYLE}>榜单周期</span>
            <SegmentButtons value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
            <span style={{ ...FILTER_LABEL_STYLE, marginLeft: 12 }}>省份</span>
            <Select
              value={province}
              onChange={(v) => setProvince(v as string)}
              options={[
                { value: '全国', label: '全国' },
                ...(regions?.provinces ?? []).map((p) => ({ value: p.name, label: `${p.name}（${p.count}）` })),
              ]}
              style={{ width: 180 }}
            />
            {data && (
              <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary)' }}>
                {data.players} 人参与 · 已有 {regions?.totalUsers ?? '—'} 位注册用户
              </span>
            )}
          </div>
        </div>

        {/* 本榜最佳：当前筛选下的单项纪录 */}
        {data && data.best.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0' }}>
            {data.best.map((b) => (
              <div
                key={b.key}
                style={{ background: 'var(--td-bg-color-secondarycontainer, #f2f3f5)', borderRadius: 8, padding: '10px 14px' }}
              >
                <div style={{ fontSize: 12, color: 'var(--td-text-color-secondary)' }}>{BEST_LABELS[b.key] || b.key}</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#0052d9', margin: '2px 0' }}>
                  {fmtBestValue(b.key, b.value)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--td-text-color-secondary)' }}>
                  🏆 {b.name}（{GENDER_LABELS[b.gender] ?? '未知'}）
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Loading />
          </div>
        ) : (
          <Table
            rowKey="rank"
            data={data?.top ?? []}
            onRowClick={({ row }) => onRowClick(row as LeaderboardRankRow)}
            columns={[
              {
                colKey: 'rank',
                title: '排名',
                width: 90,
                align: 'center',
                cell: ({ row }) => {
                  const r = row as LeaderboardRankRow
                  return (
                    <span style={{ fontWeight: 600, color: RANK_COLORS[r.rank] || 'inherit' }}>
                      {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                    </span>
                  )
                },
              },
              {
                colKey: 'name',
                title: '用户',
                cell: ({ row }) => {
                  const r = row as LeaderboardRankRow
                  return (
                    <span>
                      {r.name}
                      <Tag size="small" style={{ marginLeft: 8 }} theme="default">
                        {GENDER_LABELS[r.gender] ?? '未知'}
                      </Tag>
                    </span>
                  )
                },
              },
              { colKey: 'distanceKm', title: '总距离 (km)', align: 'center' },
              { colKey: 'count', title: '轨迹数', align: 'center' },
              { colKey: 'op', title: '操作', width: 110, align: 'center', cell: () => <span style={{ color: '#0052d9' }}>查看详情 ›</span> },
            ]}
            empty="该筛选下暂无上榜数据"
          />
        )}
      </Card>
    </div>
  )
}
