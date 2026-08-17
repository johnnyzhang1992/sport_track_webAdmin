/** 管理后台 API（对接 sport_track_api /api/admin/*，管理员 token 隔离） */

const TOKEN_KEY = 'admin_token'
const USERNAME_KEY = 'admin_username'
const API_BASE = '/sport-track/api'

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

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const json = await res.json().catch(() => ({ success: false, message: '响应解析失败' }))
  if (!json.success) {
    throw new Error(json.message || `请求失败(${res.status})`)
  }
  return json.data as T
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/admin/login', { method: 'POST', body: { username, password } }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<null>('/admin/password', { method: 'PUT', body: { oldPassword, newPassword } }),
  overview: () => request<{ userCount: number; activityCount: number; finishedCount: number; totalDistanceKm: number }>('/admin/overview'),
  users: (page = 1, pageSize = 20, keyword = '') =>
    request<{ total: number; page: number; items: unknown[] }>(`/admin/users?page=${page}&pageSize=${pageSize}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`),
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
}
