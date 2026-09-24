/**
 * 轨迹线着色口径 —— 与小程序同表同算法，改一处要改两处：
 * - 配速档位色带与映射：miniprogram/components/track-map/track-map.js（PACE_COLORS + colorOf）
 * - 配速绝对刻度：miniprogram/utils/pace-scale.js
 * - 平滑配速与断段：miniprogram/utils/track-pace.js（computeSegPaces / splitByPauseGaps）
 * - 海拔色带与分档：miniprogram/components/track-map/track-map.js（ALTITUDE_COLORS + buildAltitudePolyline）
 * - 海拔着色类型白名单与「几个点才够分档」：miniprogram/utils/track-altitude.js（ALTITUDE_TYPES / usesAltitudeColor）
 * - 非运动段（疑似乘车）灰显：miniprogram/components/track-map/track-map.js（VEHICLE_COLOR，两种着色模式都盖档位色）
 */

/** 着色需要的点字段（ActivityTrackPoint 的结构子集） */
export interface PacePoint {
  lat: number
  lng: number
  timestamp?: number
  pauseGap?: boolean
}

/** 慢→快 4 档平色（绿→黄→橙→红），与小程序 PACE_COLORS 同序同值 */
export const PACE_COLORS = ['#22c55e', '#facc15', '#f97316', '#ef4444']

/** 按运动类型固定的配速刻度（秒/公里）：fast 最快档（红）、slow 最慢档（绿） */
const PACE_SCALE: Record<string, { fast: number; slow: number }> = {
  running: { fast: 180, slow: 600 }, // 跑步 3'00" ~ 10'00"
  walking: { fast: 180, slow: 600 }, // 散步：与跑步同刻度（用户指定）
  hiking: { fast: 420, slow: 1800 }, // 徒步 7'00" ~ 30'00"
  mountaineering: { fast: 480, slow: 2400 }, // 爬山 8'00" ~ 40'00"
  cycling: { fast: 90, slow: 480 }, // 骑行 40km/h ~ 7.5km/h
  swimming: { fast: 1200, slow: 3600 }, // 游泳 20'00" ~ 60'00"
  skiing: { fast: 60, slow: 600 }, // 滑雪 60km/h ~ 6km/h
  rowing: { fast: 300, slow: 1200 }, // 划船 12km/h ~ 3km/h
}

/** 未识别类型的兜底刻度 3'00" ~ 30'00" */
const DEFAULT_SCALE = { fast: 180, slow: 1800 }

export const getPaceScale = (type?: string) => PACE_SCALE[type ?? ''] ?? DEFAULT_SCALE

const WINDOW_SEC = 45 // 平滑窗口时长
const MIN_WINDOW_M = 5 // 窗口累计位移下限（米）：低于视为原地，无有效配速
const MAX_BACK_GAP_SEC = 60 // 回溯断档阈值：相邻点间隔超过则不跨档回溯

function haversineKm(a: PacePoint, b: PacePoint): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** 按 pauseGap 标记切段（暂停间隙断开）：前一段不含 pauseGap 点，后一段从该点开始 */
export function splitByPauseGaps<T extends PacePoint>(segs: T[][]): T[][] {
  const result: T[][] = []
  for (const seg of segs) {
    let start = 0
    for (let i = 0; i < seg.length; i++) {
      if (seg[i].pauseGap && i > start) {
        result.push(seg.slice(start, i))
        start = i
      }
    }
    if (start < seg.length) result.push(seg.slice(start))
  }
  return result.filter((s) => s.length >= 2)
}

/**
 * 逐点平滑配速（秒/公里）：与段内点等长，段首与异常点为 null
 * 以每个点为终点回溯累计近 windowSec 秒的位移/用时 —— 逐步配速受 GPS 抖动噪声极大
 * 原地（窗口位移 < MIN_WINDOW_M）或时间戳缺失 → null
 */
export function computeSegPaces<T extends PacePoint>(
  segs: T[][],
  windowSec: number = WINDOW_SEC,
): (number | null)[][] {
  return segs.map((seg) => {
    const paces: (number | null)[] = new Array(seg.length).fill(null)
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1]
      const b = seg[i]
      if (!a.timestamp || !b.timestamp) continue
      let dt = (b.timestamp - a.timestamp) / 1000
      if (!Number.isFinite(dt) || dt <= 0) continue
      let d = haversineKm(a, b) * 1000
      let j = i - 1
      while (j > 0 && dt < windowSec) {
        const sdt = (seg[j].timestamp! - seg[j - 1].timestamp!) / 1000
        if (!Number.isFinite(sdt) || sdt < 0 || sdt > MAX_BACK_GAP_SEC) break // 不跨断档回溯
        dt += sdt
        d += haversineKm(seg[j - 1], seg[j]) * 1000
        j--
      }
      paces[i] = d >= MIN_WINDOW_M ? dt / (d / 1000) : null
    }
    return paces
  })
}

/**
 * 配速 → 档位色：绝对刻度等分 N 档平色（不做渐变），超出刻度截断
 * pace 为 null（原地/无时间戳）按最慢档，与小程序一致
 */
export function paceColor(pace: number | null | undefined, type?: string): string {
  const { fast, slow } = getPaceScale(type)
  const span = slow - fast || 1
  const k = Math.min(1, Math.max(0, (slow - (pace ?? slow)) / span))
  return PACE_COLORS[Math.min(PACE_COLORS.length - 1, Math.floor(k * PACE_COLORS.length))]
}

/** 图例色带：与 PACE_COLORS 同序的硬分档渐变（慢 → 快） */
export const PACE_LEGEND_GRADIENT = `linear-gradient(90deg, ${PACE_COLORS.map(
  (c, i) => `${c} ${i * (100 / PACE_COLORS.length)}% ${(i + 1) * (100 / PACE_COLORS.length)}%`,
).join(', ')})`

/* ------------------------------------------------------------------ 海拔着色 */

/** 带海拔的点 */
export type AltitudePoint = PacePoint & { altitude?: number | null }

/**
 * 海拔着色的类型白名单 —— GPS 逐点海拔在贴地运动里基本是噪声，只有徒步/爬山值得按海拔上色
 * （与小程序 utils/track-altitude.js 的 ALTITUDE_TYPES 同一份，别在两处各写一份）
 */
export const ALTITUDE_TYPES = ['hiking', 'mountaineering']

/** 海拔色带：蓝（低）→ 绿 → 黄 → 红（高），12 档线性插值，与小程序 ALTITUDE_COLORS 同表同序 */
export const ALTITUDE_COLORS: string[] = (() => {
  const stops: [number, number[]][] = [
    [0, [41, 121, 255]], // 蓝（低海拔）
    [0.35, [0, 199, 83]], // 绿
    [0.7, [255, 213, 0]], // 黄
    [1, [244, 67, 54]], // 红（高海拔）
  ]
  const N = 12
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  const colors: string[] = []
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    let lo = stops[0]
    let hi = stops[stops.length - 1]
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        lo = stops[s]
        hi = stops[s + 1]
        break
      }
    }
    const span = hi[0] - lo[0] || 1
    const k = (t - lo[0]) / span
    const rgb = lo[1].map((c, idx) => Math.round(c + (hi[1][idx] - c) * k))
    colors.push(`#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`)
  }
  return colors
})()

/** 图例色带：与小程序 .legend-bar-altitude 同一条渐变（低 → 高） */
export const ALTITUDE_LEGEND_GRADIENT = 'linear-gradient(90deg, #2979ff, #00c753, #ffd500, #f44336)'

/** 非运动段（服务端 vehicle 标记）的线色：与小程序 track-map.js#VEHICLE_COLOR 同值，盖过档位色 */
export const VEHICLE_COLOR = '#c9cdd4'

/**
 * 把车速步改画灰色。标记看**终点**：与小程序 `b.vehicle ? VEHICLE_COLOR : …` 同一条规则
 * （每一步的颜色本来就归属于「进入该点的那一步」），按起点判会让每段灰线多出一格。
 * 本来就不画的步（null：段首点 / 该步两端无海拔）保持不画，别凭空补一段灰线。
 */
export function applyVehicleColor<P extends { vehicle?: boolean }>(
  seg: P[],
  colors: (string | null)[],
): (string | null)[] {
  return seg.map((p, i) => (p.vehicle && colors[i] ? VEHICLE_COLOR : colors[i]))
}

/**
 * 「约 X 公里疑似搭车，未计入」整句说明的文字色（文案由接口下发 vehicleNotice，端上只渲染）。
 * 与小程序 pages/track-detail/track-detail.wxss 的 .legend-note 同值：这句在讲「数字为什么比轨迹少」，
 * 得比周围图例灰字跳出来（试过淡黄底色块，观感怪，回到改文字色）。
 */
export const VEHICLE_NOTICE_COLOR = '#f97316'

const ALTITUDE_BUCKETS = 12

/** 逐步平均海拔（进入该点的那一步）：两端都没海拔 → null */
function stepAltitudes<T extends AltitudePoint>(seg: T[]): (number | null)[] {
  const out: (number | null)[] = [null]
  for (let i = 1; i < seg.length; i++) {
    const a = seg[i - 1].altitude
    const b = seg[i].altitude
    out.push(a == null && b == null ? null : ((a ?? b) as number) + (((b ?? a) as number) - ((a ?? b) as number)) / 2)
  }
  return out
}

/**
 * 段内逐步海拔档色：按**本段**有效海拔的 min/max 等分 12 档（与小程序 buildAltitudePolyline 同口径）
 * 返回与段内点等长的数组，下标 i = 进入第 i 点那一步的颜色；null = 该步不画
 */
export function altitudeSegColors<T extends AltitudePoint>(seg: T[]): (string | null)[] {
  const steps = stepAltitudes(seg)
  const alts = seg.map((p) => p.altitude).filter((a): a is number => a != null)
  // 少于 2 个有效海拔点分不出高低，整段不上色（小程序同样跳过该段）
  if (alts.length < 2) return steps.map(() => null)
  const min = Math.min(...alts)
  const max = Math.max(...alts)
  const span = max - min || 1
  return steps.map((alt) =>
    alt == null
      ? null
      : ALTITUDE_COLORS[Math.min(ALTITUDE_BUCKETS - 1, Math.max(0, Math.floor(((alt - min) / span) * ALTITUDE_BUCKETS)))],
  )
}

/** 该轨迹走海拔着色还是配速着色（与小程序详情页 colorMode 同判据：白名单类型 + 有可分档的海拔） */
export function usesAltitudeColor<T extends AltitudePoint>(points: T[], type?: string): boolean {
  if (!type || !ALTITUDE_TYPES.includes(type)) return false
  return points.filter((p) => p.altitude != null).length >= 2
}
