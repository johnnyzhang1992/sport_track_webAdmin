import type { HourStatsPoint, HourStatsRange } from '../api'
import { chartColors } from './theme'

/**
 * 小时分布柱状图（用户活跃时段 / 轨迹频率共用一份）。
 *
 * 柱高用「当前时段的日均」而不是合计：合计口径下「最近30天」的柱子是「今天」的 30 倍，
 * 切档时只能看出量级差别，看不出哪个时段更常发生。合计值放进 tooltip。
 */
export const HOUR_RANGE_DAYS: Record<HourStatsRange, number> = { today: 1, week: 7, month: 30 }
export const HOUR_RANGE_LABEL: Record<HourStatsRange, string> = {
  today: '今天',
  week: '近7天',
  month: '近30天',
}

interface TipParam {
  dataIndex: number
}

export function hourChartOption(opts: {
  points: HourStatsPoint[]
  range: HourStatsRange
  /** 系列名（图例/悬浮标题里出现的业务名），如「登录次数」「轨迹数」 */
  name: string
  /** 计数单位，如「次」「条」 */
  unit: string
}) {
  const c = chartColors()
  const days = HOUR_RANGE_DAYS[opts.range]
  const rows = opts.points.map((p) => ({ ...p, avg: +(p.count / days).toFixed(1) }))
  return {
    textStyle: { color: c.text },
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: unknown) => {
        const first = (Array.isArray(params) ? params[0] : params) as TipParam
        const r = rows[first?.dataIndex ?? 0]
        if (!r) return ''
        return [
          `${r.hour}时`,
          `平均 ${r.avg} ${opts.unit}/天`,
          `${HOUR_RANGE_LABEL[opts.range]}合计 ${r.count} ${opts.unit}`,
        ].join('<br/>')
      },
    },
    grid: { left: 48, right: 20, top: 32, bottom: 28 },
    xAxis: {
      type: 'category' as const,
      data: rows.map((r) => `${r.hour}时`),
      axisLabel: { color: c.text, interval: 0 },
      axisLine: { lineStyle: { color: c.axisLine } },
    },
    yAxis: {
      type: 'value' as const,
      name: `日均 ${opts.unit}`,
      minInterval: 1,
      axisLabel: { color: c.text },
      splitLine: { lineStyle: { color: c.splitLine } },
    },
    series: [
      {
        name: `${opts.name}（日均）`,
        type: 'bar' as const,
        barMaxWidth: 22,
        itemStyle: { color: '#0052d9', borderRadius: [4, 4, 0, 0] },
        data: rows.map((r) => r.avg),
      },
    ],
  }
}
