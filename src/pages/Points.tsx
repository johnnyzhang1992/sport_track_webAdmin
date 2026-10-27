import { useEffect, useRef, useState } from 'react'
import { Card, Table, Input, Button, Space } from 'tdesign-react'
import type { TableSort } from 'tdesign-react'
import * as echarts from 'echarts'
import {
  adminApi,
  type PointsOverview,
  type PointsTrendBucket,
  type PointsTrendDays,
  type PointsUserRow,
} from '../api'
import RangeButtons from '../components/RangeButtons'
import UserAvatar from '../components/UserAvatar'
import PointsUserDialog from '../components/PointsUserDialog'
import { chartColors, onThemeChange } from '../utils/theme'
import { fmtDateTime } from '../utils/format'

/** 趋势档位（与 /admin/points/trend 的白名单同名；RangeButtons 的 key 只能是字符串） */
type TrendRangeKey = '7' | '30' | '90'

const RANGES: { key: TrendRangeKey; label: string }[] = [
  { key: '7', label: '近7天' },
  { key: '30', label: '近30天' },
  { key: '90', label: '近90天' },
]

/** 未加载完成显示 '—'，不显示 0（0 是「真的是零」，两者不能混） */
const fmtNum = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString())

export default function Points() {
  // 概况 + 双趋势
  const [overview, setOverview] = useState<PointsOverview | null>(null)
  const [range, setRange] = useState<TrendRangeKey>('30')
  const [trend, setTrend] = useState<PointsTrendBucket[]>([])
  const [themeV, setThemeV] = useState(0)
  const signinRef = useRef<HTMLDivElement>(null)
  const earnedRef = useRef<HTMLDivElement>(null)
  const signinChart = useRef<echarts.ECharts | null>(null)
  const earnedChart = useRef<echarts.ECharts | null>(null)

  // 用户积分列表
  const [data, setData] = useState<PointsUserRow[]>([])
  // null = 还没拿到过数据：标题与分页不能声称「0 条」（0 是「真的是零」）
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TableSort>({ sortBy: 'balance', descending: true })
  // 请求序号：快速翻页/排序时只应用最后一次请求的结果，迟到的响应不能覆盖新页
  const reqSeq = useRef(0)

  // 行点击的详情弹窗（PointsUserDialog）：记录点击行，关闭时清空即卸载
  const [detail, setDetail] = useState<{ id: string; nickname: string } | null>(null)

  useEffect(() => onThemeChange(() => setThemeV((v) => v + 1)), [])

  const load = (p: number, kw = keyword, s = sort, ps?: number) => {
    const seq = ++reqSeq.current
    setLoading(true)
    const size = ps ?? pageSize
    const sortBy = (s as { sortBy?: string })?.sortBy || ''
    const order = (s as { descending?: boolean })?.descending ? 'desc' : 'asc'
    adminApi
      .pointsUsers(p, size, kw, sortBy, order)
      .then((d) => {
        if (seq !== reqSeq.current) return
        setData(d.items)
        setTotal(d.total)
      })
      .catch(() => {
        if (seq !== reqSeq.current) return
        setData([])
        setTotal(null)
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false)
      })
  }

  useEffect(() => {
    load(1, '')
    adminApi.pointsOverview().then(setOverview).catch(() => setOverview(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 两个趋势图共用一个档位：切一次档只发一次请求
  useEffect(() => {
    adminApi
      .pointsTrend(Number(range) as PointsTrendDays)
      .then((d) => setTrend(d.data))
      .catch(() => setTrend([]))
  }, [range])

  // 左：签到人数趋势（签到 / 补签）；右：积分发放趋势（发放 / 兑换）
  useEffect(() => {
    if (trend.length === 0) return
    const c = chartColors()
    const labels = trend.map((b) => b.date.slice(5))
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

    if (signinRef.current) {
      if (!signinChart.current) signinChart.current = echarts.init(signinRef.current)
      signinChart.current.setOption(
        {
          ...baseOption,
          legend: { data: ['签到', '补签'], top: 0, textStyle: { color: c.text } },
          series: [
            {
              name: '签到',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
              data: trend.map((b) => b.signinUsers),
            },
            {
              name: '补签',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#ed7b2f', borderRadius: [4, 4, 0, 0] },
              data: trend.map((b) => b.makeupUsers),
            },
          ],
        },
        true,
      )
    }
    if (earnedRef.current) {
      if (!earnedChart.current) earnedChart.current = echarts.init(earnedRef.current)
      earnedChart.current.setOption(
        {
          ...baseOption,
          legend: { data: ['发放', '兑换'], top: 0, textStyle: { color: c.text } },
          series: [
            {
              name: '发放',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
              data: trend.map((b) => b.earned),
            },
            {
              name: '兑换',
              type: 'bar',
              barMaxWidth: 14,
              itemStyle: { color: '#00a870', borderRadius: [4, 4, 0, 0] },
              data: trend.map((b) => b.exchanged),
            },
          ],
        },
        true,
      )
    }
  }, [trend, themeV])

  useEffect(() => {
    if (!signinRef.current && !earnedRef.current) return
    const ro = new ResizeObserver(() => {
      signinChart.current?.resize()
      earnedChart.current?.resize()
    })
    if (signinRef.current) ro.observe(signinRef.current)
    if (earnedRef.current) ro.observe(earnedRef.current)
    return () => ro.disconnect()
  }, [])

  const handleSearch = () => {
    setPage(1)
    load(1, keyword)
  }

  // 六格全部取 /points/overview 的字段，前端不另算
  const overviewItems = [
    { label: '累计发放（净）', value: fmtNum(overview?.earnedNet) },
    { label: '当前流通', value: fmtNum(overview?.balance) },
    { label: '发放人数', value: fmtNum(overview?.earnedUsers) },
    { label: '今日签到', value: fmtNum(overview?.todaySigninUsers) },
    { label: '近7天签到', value: fmtNum(overview?.weekSigninUsers) },
    { label: '累计签到', value: fmtNum(overview?.totalSigninUsers) },
  ]

  return (
    <>
      {/* 积分概况：净发放 / 流通 / 发放人数 + 今日 / 近 7 天 / 累计签到 */}
      <Card className="page-card" title="积分概况" style={{ marginBottom: 16 }}>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {overviewItems.map((it) => (
            <div
              key={it.label}
              style={{ background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)', borderRadius: 8, padding: '14px 16px' }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
              <div style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 趋势筛选（两张图联动） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 12, paddingRight: 24 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--td-text-color-primary, #1f2329)' }}>时间范围</span>
        <RangeButtons options={RANGES} value={range} onChange={setRange} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        <Card className="page-card" title="签到人数趋势">
          <div ref={signinRef} style={{ width: '100%', height: 300 }} />
        </Card>
        <Card className="page-card" title="积分发放趋势">
          <div ref={earnedRef} style={{ width: '100%', height: 300 }} />
        </Card>
      </div>

      <Card className="page-card" title={`用户积分列表（${total === null ? '—' : total}）`}>
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索昵称 / UID"
            value={keyword}
            onChange={(v) => setKeyword(v)}
            onEnter={handleSearch}
            style={{ width: 240 }}
          />
          <Button theme="primary" onClick={handleSearch}>搜索</Button>
        </Space>
        <Table
          className="clickable-rows"
          data={data}
          rowKey="id"
          loading={loading}
          sort={sort}
          onSortChange={(s) => {
            setSort(s)
            setPage(1)
            load(1, keyword, s)
          }}
          onRowClick={({ row }) => setDetail({ id: row.id, nickname: row.nickname })}
          columns={[
            { colKey: 'uid', title: 'UID', width: 100, ellipsis: true, cell: ({ row }) => row.uid || '—' },
            {
              colKey: 'nickname',
              title: '昵称',
              width: 200,
              ellipsis: true,
              cell: ({ row }) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <UserAvatar name={row.nickname} size={28} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.nickname || '微信用户'}
                  </span>
                </span>
              ),
            },
            {
              colKey: 'balance',
              title: '积分余额',
              width: 120,
              align: 'right',
              sorter: true,
              cell: ({ row }) => <b style={{ fontVariantNumeric: 'tabular-nums' }}>{row.balance.toLocaleString()}</b>,
            },
            {
              colKey: 'totalEarned',
              title: '累计获得',
              width: 120,
              align: 'right',
              sorter: true,
              cell: ({ row }) => row.totalEarned.toLocaleString(),
            },
            {
              colKey: 'exchanges',
              title: '兑换数量',
              width: 110,
              align: 'right',
              sorter: true,
              cell: ({ row }) => row.exchanges.toLocaleString(),
            },
            {
              colKey: 'cardsUnused',
              title: '持卡',
              width: 90,
              align: 'right',
              cell: ({ row }) => row.cardsUnused.toLocaleString(),
            },
            {
              colKey: 'lastEarnedAt',
              title: '最后发放时间',
              width: 180,
              sorter: true,
              cell: ({ row }) => fmtDateTime(row.lastEarnedAt),
            },
          ]}
          empty="暂无积分数据"
          pagination={{
            total: total ?? 0,
            totalContent: total === null ? '—' : `共 ${total} 条数据`,
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

      {/* 行点击详情弹窗：组件随 detail 卸载，重开即回到第一页 / 默认 Tab */}
      {detail && (
        <PointsUserDialog
          visible
          userId={detail.id}
          nickname={detail.nickname}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}
