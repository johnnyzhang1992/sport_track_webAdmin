/** 运动类型标签（与小程序口径一致） */
export const TYPE_LABELS: Record<string, string> = {
  walking: '散步',
  running: '跑步',
  hiking: '徒步',
  mountaineering: '爬山',
  cycling: '骑行',
  skiing: '滑雪',
  rowing: '划船',
  swimming: '游泳',
}

export const typeLabel = (type: string) => TYPE_LABELS[type] || type

export const STATUS_LABELS: Record<string, string> = {
  finished: '已完成',
  in_progress: '进行中',
  cancelled: '已作废',
}

/** 米 → 公里（保留 2 位） */
export const fmtKm = (meters: number) => ((meters || 0) / 1000).toFixed(2)

/** 秒 → 时长文本 */
export function fmtDuration(sec: number): string {
  sec = Math.round(sec || 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}小时${String(m).padStart(2, '0')}分`
  if (m > 0) return `${m}分${String(s).padStart(2, '0')}秒`
  return `${s}秒`
}

/** 配速（秒/公里）→ 6'05" */
export function fmtPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

/** 时间戳（数字或 ISO 字符串）→ 本地时间文本 */
export function fmtDateTime(t: number | string | null | undefined): string {
  if (!t) return '—'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

/** 经纬度距离（米） */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
