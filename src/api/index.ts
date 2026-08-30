/** 管理后台 API（对接 sport_track_api /api/admin/*，管理员 token 隔离） */

const TOKEN_KEY = 'admin_token'
const USERNAME_KEY = 'admin_username'
// dev 走 vite 代理（相对路径）；生产用 VITE_API_BASE 绝对地址（独立子域跨域调用 api.historybook.cn）
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/sport-track/api'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY)
}

export function saveUsername(name: string) {
  localStorage.setItem(USERNAME_KEY, name)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// 并发请求同时 401 时只重定向一次
let redirectingToLogin = false

/** 会话过期（401）：清除 token 并跳回登录页，携带当前路径供登录后回跳 */
function redirectToLogin() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  clearToken()
  const back = window.location.pathname + window.location.search
  window.location.assign(`/login?redirect=${encodeURIComponent(back)}`)
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  // 登录接口自身 401（用户名/密码错误）不触发重定向
  if (res.status === 401 && path !== '/admin/login') {
    redirectToLogin()
    throw new Error('登录已过期，请重新登录')
  }
  const json = await res.json().catch(() => ({ success: false, message: '响应解析失败' }))
  if (!json.success) {
    throw new Error(json.message || `请求失败(${res.status})`)
  }
  return json.data as T
}

/** 统计概况分段（今日/周/月/年/累计） */
export interface OverviewSection {
  count: number
  distance: number // 米
  duration: number // 秒
  elevationGain: number // 米
  calories: number // 千卡
}

/** 个人最佳单行（按运动类型） */
export interface BestRow {
  id: string
  type: string
  startTime: number
  distance: number
  avgPace: number | null
  fastestKm: number | null // 最快 1km 分段（秒/公里）
  duration: number
  elevationGain: number
}

export interface UserDetail {
  user: {
    id: string
    nickname: string
    avatarUrl: string
    gender: number
    openid: string
    weightKg: number | null
    heightCm: number | null
    createdAt: string
    lastLoginAt: number | string
  }
  activityCount: number
  overview: { today: OverviewSection; week: OverviewSection; month: OverviewSection; year: OverviewSection; total: OverviewSection }
  best: {
    maxDistanceByType: BestRow[]
    minPaceByType: BestRow[]
    maxDurationByType: BestRow[]
    maxElevationByType: BestRow[]
  }
  footprint: {
    provinceCount: number
    cityCount: number
    provinces: { name: string; count: number; cities: number }[]
    cities: { name: string; province: string; count: number }[]
  }
}

export interface ActivityTrackPoint {
  seq: number
  lat: number
  lng: number
  altitude: number | null
  speed: number | null
  accuracy: number | null
  timestamp: number
}

export interface ActivityMarker {
  id: string
  lat: number
  lng: number
  timestamp: number
  type: 'checkpoint' | 'rest' | 'photo' | 'note'
  note: string
  photoUrl: string
  photos: string[]
  address: string
}

export interface ActivityDetail {
  id: string
  userId: string
  userNickname: string
  type: string
  status: string
  startTime: number
  endTime: number | null
  duration: number
  distance: number
  avgPace: number | null
  fastestKm: number | null
  calories: number
  elevationGain: number
  maxAltitude: number | null
  startAddress: string
  endAddress: string
  provinces: string[]
  startProvince: string
  startCity: string
  pausedMs: number
  note: string
  pointsCount: number
  trackPoints: ActivityTrackPoint[]
  markers: ActivityMarker[]
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/admin/login', { method: 'POST', body: { username, password } }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<null>('/admin/password', { method: 'PUT', body: { oldPassword, newPassword } }),
  overview: () => request<{ userCount: number; activityCount: number; finishedCount: number; totalDistanceKm: number }>('/admin/overview'),
  users: (page = 1, pageSize = 20, keyword = '', sortBy = '', order = '') =>
    request<{ total: number; page: number; items: unknown[] }>(`/admin/users?page=${page}&pageSize=${pageSize}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}${sortBy ? `&sortBy=${sortBy}` : ''}${order ? `&order=${order}` : ''}`),
  adminStats: () =>
    request<{ today: { newUsers: number; newActivities: number; uv: number; pv: number }; week: { newUsers: number; newActivities: number; uv: number; pv: number }; month: { newUsers: number; newActivities: number; uv: number; pv: number } }>('/admin/stats'),
  adminTrend: (type = 'day') =>
    request<{ type: string; data: { date: string; newUsers: number; newActivities: number }[] }>(`/admin/trend?type=${type}`),
  regionStats: () =>
    request<{ provinces: { name: string; count: number }[]; cities: { name: string; count: number }[] }>('/admin/region-stats'),
  activities: (page = 1, pageSize = 20, filters: Record<string, string> = {}) => {
    const qs = Object.entries(filters)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return request<{ total: number; page: number; items: unknown[] }>(
      `/admin/activities?page=${page}&pageSize=${pageSize}${qs ? `&${qs}` : ''}`,
    )
  },
  userDetail: (id: string) => request<UserDetail>(`/admin/users/${id}`),
  userLoginLogs: (id: string, page = 1, pageSize = 20) =>
    request<{ total: number; page: number; items: LoginLogItem[] }>(`/admin/users/${id}/login-logs?page=${page}&pageSize=${pageSize}`),
  activityDetail: (id: string) => request<ActivityDetail>(`/admin/activities/${id}`),
}

export interface LoginLogItem {
  id: string
  ip: string
  province: string
  city: string
  platform: string
  system: string
  brand: string
  model: string
  sdkVersion: string
  appVersion: string
  createdAt: string
}
