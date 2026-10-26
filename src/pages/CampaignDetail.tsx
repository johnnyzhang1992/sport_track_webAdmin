import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Table, Tag, Loading, Button, type PrimaryTableCol } from 'tdesign-react'
import * as echarts from 'echarts'
import { ArrowLeft } from '@phosphor-icons/react'
import { adminApi, type CampaignDetail, type CampaignMemberRow } from '../api'
import CampaignMemberTracksDialog from '../components/CampaignMemberTracksDialog'
import { fmtDateTime, fmtDuration, fmtKm, typeLabel } from '../utils/format'
import { campaignStatusMeta } from '../utils/campaign-status'

/**
 * 活动详情（独立页面，替代旧弹窗）：汇总 / 趋势 / 榜单 / 成员（含异常数量）。
 * 参考小程序活动详情页的信息结构：顶部汇总 → 逐日趋势 → 排行榜 → 成员表。
 */

const VISIBILITY_LABELS: Record<string, string> = { public: '公开', private: '私密' }
const MEMBER_STATE_LABELS: Record<string, string> = {
  pending: '待审批',
  joined: '在队',
  rejected: '已拒绝',
  left: '已离开',
  removed: '已移出',
}
const MEMBER_STATE_THEMES: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
  joined: 'success',
  left: 'default',
  removed: 'danger',
}
const ROLE_LABELS: Record<string, string> = { creator: '发起人', member: '成员' }

type MemberRow = CampaignMemberRow & { rowId: string }
const toMemberRows = (members: CampaignMemberRow[]): MemberRow[] =>
  members.map((m) => ({ ...m, rowId: `${m.userId}-${m.joinedAt ?? 'x'}-${m.state}` }))

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: '#86909c' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#86909c', marginTop: 2 }}>{sub}</div> : null}
    </Card>
  )
}


type MemberCol = PrimaryTableCol<CampaignMemberRow>

const memberColumns = (openTracks: (userId: string, name: string) => void): MemberCol[] => [
  { colKey: 'name', title: '昵称', cell: ({ row }) => <span style={{ fontWeight: 500 }}>{row.name}</span> },
  { colKey: 'uid', title: 'UID', width: 90 },
  {
    colKey: 'role',
    title: '角色',
    width: 80,
    cell: ({ row }) => ROLE_LABELS[row.role] || row.role,
  },
  {
    colKey: 'state',
    title: '状态',
    width: 90,
    cell: ({ row }) => (
      <Tag theme={MEMBER_STATE_THEMES[row.state] || 'default'} variant="light">
        {MEMBER_STATE_LABELS[row.state] || row.state}
      </Tag>
    ),
  },
  {
    colKey: 'joinedAt',
    title: '加入时间',
    width: 150,
    cell: ({ row }) => <span style={{ fontSize: 12 }}>{fmtDateTime(row.joinedAt)}</span>,
  },
  {
    colKey: 'leftAt',
    title: '离开时间',
    width: 150,
    cell: ({ row }) => (row.leftAt ? <span style={{ fontSize: 12 }}>{fmtDateTime(row.leftAt)}</span> : '—'),
  },
  { colKey: 'count', title: '次数', width: 70, align: 'center' },
  { colKey: 'distance', title: '距离 (km)', width: 100, align: 'center', cell: ({ row }) => fmtKm(row.distance) },
  { colKey: 'duration', title: '时长', width: 90, align: 'center', cell: ({ row }) => fmtDuration(row.duration) },
  {
    colKey: 'excludedCount',
    title: '异常排除',
    width: 100,
    align: 'center',
    cell: ({ row }) => {
      const n = row.excludedCount ?? 0
      return n > 0 ? <Tag theme="warning" variant="light">{n} 条</Tag> : <span style={{ color: '#c2c7d0' }}>0</span>
    },
  },
  {
    colKey: 'op',
    title: '轨迹',
    width: 90,
    cell: ({ row }: { row: CampaignMemberRow }) => (
      <Button
        size="small"
        variant="text"
        theme="primary"
        onClick={() => openTracks(row.userId, row.name)}
      >
        查看轨迹
      </Button>
    ),
  },
]

export default function CampaignDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tracksTarget, setTracksTarget] = useState<{ userId: string; name: string } | null>(null)
  const [memberPage, setMemberPage] = useState(1)
  const pageSize = 20
  const chartRef = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  const load = async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const d = await adminApi.campaignDetail(id, page, pageSize)
      setDetail(d)
      setMemberPage(d.membersPage || page)
    } catch (e) {
      setError((e as Error).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 趋势图：detail.trend（逐日全队距离）
  useEffect(() => {
    if (!detail?.trend?.length || !chartRef.current) return
    if (!chart.current) chart.current = echarts.init(chartRef.current)
    const c = chart.current
    c.setOption({
      grid: { left: 48, right: 24, top: 30, bottom: 28 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: detail.trend.map((t) => t.date.slice(5)) },
      yAxis: { type: 'value', name: 'km' },
      series: [
        {
          name: '全队距离',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: detail.trend.map((t) => +(t.distance / 1000).toFixed(2)),
          lineStyle: { width: 2.5, color: '#2b6cf6' },
          itemStyle: { color: '#2b6cf6' },
          areaStyle: { color: 'rgba(43,108,246,0.08)' },
        },
      ],
    })
    const onResize = () => c.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      c.dispose()
      chart.current = null
    }
  }, [detail])

  const totals = detail?.totals
  const statusMeta = detail ? campaignStatusMeta(detail.status) : null
  const timeRange = detail ? `${fmtDateTime(detail.startAt)} ~ ${fmtDateTime(detail.endAt)}` : ''

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button shape="circle" variant="outline" onClick={() => navigate('/campaigns')}>
          <ArrowLeft size={16} />
        </Button>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{detail ? detail.title : '活动详情'}</span>
        {statusMeta ? (
          <Tag theme={statusMeta.theme as never} variant="light">
            {statusMeta.label}
          </Tag>
        ) : null}
      </div>

      {loading && !detail ? (
        <Card>
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loading text="加载中…" />
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center', color: '#d54941' }}>{error}</div>
          <div style={{ textAlign: 'center' }}>
            <Button onClick={() => load(memberPage)}>重试</Button>
          </div>
        </Card>
      ) : detail ? (
        <>
          {/* 基本信息 */}
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13 }}>
              <span>
                <span style={{ color: '#86909c' }}>时间：</span>
                {timeRange}
              </span>
              <span>
                <span style={{ color: '#86909c' }}>可见性：</span>
                {VISIBILITY_LABELS[detail.visibility] || detail.visibility}
              </span>
              <span>
                <span style={{ color: '#86909c' }}>类型白名单：</span>
                {detail.allowedTypes.length > 0
                  ? detail.allowedTypes.map((t) => typeLabel(t)).join('、')
                  : '不限'}
              </span>
              {detail.description ? (
                <span>
                  <span style={{ color: '#86909c' }}>描述：</span>
                  {detail.description}
                </span>
              ) : null}
            </div>
          </Card>

          {/* 汇总卡片 */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatCard label="成员数" value={String(detail.membersTotal)} />
            <StatCard label="总距离" value={fmtKm(totals?.distance ?? 0) + ' km'} />
            <StatCard label="总时长" value={fmtDuration(totals?.duration ?? 0)} />
            <StatCard label="总次数" value={String(totals?.count ?? 0)} />
            <StatCard
              label="异常排除轨迹"
              value={String(detail.excludedTotal ?? 0)}
              sub={detail.excludedTotal ? '定位异常，未计入统计' : undefined}
            />
          </div>

          {/* 逐日趋势 */}
          <Card title="逐日距离趋势">
            {detail.trend?.length ? (
              <div ref={chartRef} style={{ width: '100%', height: 280 }} />
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#86909c' }}>暂无趋势数据</div>
            )}
          </Card>

          {/* 排行榜 */}
          <Card
            title="距离排行榜 TOP10"
            header={
              detail.lastPlace ? (
                <Button
                  size="small"
                  variant="text"
                  theme="primary"
                  onClick={() => setTracksTarget({ userId: detail.lastPlace!.userId, name: detail.lastPlace!.name })}
                >
                  末位成员：{detail.lastPlace.name}（{fmtKm(detail.lastPlace.distance)} km）的轨迹
                </Button>
              ) : undefined
            }
          >
            <Table
              rowKey="userId"
              data={detail.leaderboard}
              columns={[
                { colKey: 'rank', title: '名次', width: 80, align: 'center' },
                { colKey: 'name', title: '昵称' },
                { colKey: 'distance', title: '距离 (km)', align: 'center', cell: ({ row }) => fmtKm(row.distance) },
                { colKey: 'count', title: '次数', align: 'center' },
                { colKey: 'duration', title: '时长', align: 'center', cell: ({ row }) => fmtDuration(row.duration) },
              ]}
            />
          </Card>

          {/* 成员表（分页，含历史段与异常数量） */}
          <Card title={`成员（${detail.membersTotal}）`}>
            <Table
              rowKey="rowId"
              data={toMemberRows(detail.members)}
              columns={memberColumns((uid, name) => setTracksTarget({ userId: uid, name }))}
              pagination={{
                total: detail.membersTotal,
                current: detail.membersPage,
                pageSize: detail.membersPageSize,
                showJumper: true,
                onChange: (info) => {
                  setMemberPage(info.current)
                  load(info.current)
                },
              }}
            />
          </Card>
        </>
      ) : null}

      {tracksTarget && detail ? (
        <CampaignMemberTracksDialog
          visible={!!tracksTarget}
          campaignId={id}
          memberName={tracksTarget.name}
          userId={tracksTarget.userId}
          allowedTypes={detail.allowedTypes}
          onClose={() => setTracksTarget(null)}
        />
      ) : null}
    </div>
  )
}
