/** 管理后台 API（对接 sport_track_api /api/admin/*，管理员 token 隔离） */

import { flattenMarkerPhotos } from '../utils/photo'

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

/**
 * 导出轨迹 GPX（文件流，不走 request() 的 JSON 信封）
 * 必须带管理员凭证 → 只能 fetch 成 blob 再用 a[download] 触发下载，直链 <a href> 带不上 Authorization 头
 * @returns 落盘文件名（取服务端的 Content-Disposition）
 */
export async function downloadActivityGpx(id: string): Promise<string> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/admin/activities/${id}/gpx`, { headers })
  if (res.status === 401) {
    redirectToLogin()
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) {
    // 失败时服务端回 JSON 信封（如「活动没有轨迹点，无法导出 GPX」），把原因原样抛给调用方提示
    const msg = await res
      .json()
      .then((j: { message?: string }) => j?.message)
      .catch(() => '')
    throw new Error(msg || `导出失败(${res.status})`)
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `activity-${id}.gpx`
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return filename
}

/** 统计概况分段（今日/周/月/年/累计） */
export interface OverviewSection {  count: number
  distance: number // 米
  duration: number // 秒
  elevationGain: number // 米
  calories: number // 千卡
  byStatus?: { status: string; count: number }[] // 各状态轨迹数（prev 周期为空）
  finishRate?: number // 完成率 %
  byType?: { type: string; count: number; distance: number; duration: number }[] // 各类型统计（仅 finished）
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
  pauseGap?: boolean
  /** 服务端判出的采样断档连线（丢锁后重定位超前）：线在此断开，点与指标都保留 */
  gapJump?: boolean
  /** 服务端判出的非运动段（疑似乘车）：地图画灰，指标已在服务端剔除 */
  vehicle?: boolean
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
  /** 是否已纠偏（旧轨迹缺字段时服务端按已纠偏下发） */
  corrected: boolean
  startTime: number
  endTime: number | null
  updatedAt: string
  /** 运动时长（秒，已扣暂停/静止/乘车段） */
  duration: number
  /** 总时长（秒，墙钟 endTime − startTime，含暂停与静止） */
  totalDuration: number
  distance: number
  avgPace: number | null
  fastestKm: number | null
  calories: number
  elevationGain: number
  minAltitude: number | null
  maxAltitude: number | null
  startAddress: string
  endAddress: string
  provinces: string[]
  startProvince: string
  startCity: string
  pausedMs: number
  /** 静止时长（毫秒，服务端纠偏/收尾时判出的停留段合计） */
  standstillMs: number
  /** 疑似乘车整句说明（服务端拼好下发，与小程序详情页同一句）；无车速段为空串 */
  vehicleNotice: string
  note: string
  pointsCount: number
  trackPoints: ActivityTrackPoint[]
  markers: ActivityMarker[]
}

export interface ActivityGeoStats {
  range: string
  total: number
  provinces: { province: string; count: number; cities: { city: string; count: number }[] }[]
}

/** 运动榜排行行（管理端带 userId 供跳转用户详情） */
export interface LeaderboardRankRow {
  rank: number
  userId?: string
  name: string
  gender: number
  avatarUrl: string
  avatarPreset: string
  distanceKm: number
  count: number
  /** 运动时长合计（秒）：筛选范围内 Σ duration */
  durationSec: number
  /** 加权平均配速（秒/公里）= Σ时长 ÷ Σ距离；无可信距离为 null */
  paceSecPerKm: number | null
}

/** 运动榜"本榜最佳"行（value 单位由 key 决定：米 / 秒） */
export interface LeaderboardBestRow {
  key: string
  value: number
  name: string
  gender: number
  avatarUrl: string
  avatarPreset: string
}

export interface LeaderboardData {
  type: string
  province: string
  period: string
  /** 参与人数（有该类型轨迹的用户数） */
  players: number
  top: LeaderboardRankRow[]
  me: LeaderboardRankRow | null
  best: LeaderboardBestRow[]
}

export interface LeaderboardRegions {
  provinces: { name: string; count: number; users: number }[]
  cities: { name: string; province: string; count: number; users: number }[]
  totalUsers: number
}

/** 用户概况（管理端用户列表页顶部）：总量 + 今日/近 7 天/近 30 天 注册数 + 登录 UV、PV */
export interface UserStats {
  totalUsers: number
  today: { newUsers: number; uv: number; pv: number }
  week: { newUsers: number; uv: number; pv: number }
  month: { newUsers: number; uv: number; pv: number }
}

/** 用户趋势时间范围：近一周 / 近一月 / 近一年 */
export type UserTrendRange = 'week' | 'month' | 'year'

export interface UserTrendPoint {
  date: string
  newUsers: number
  uv: number
  pv: number
}

/** 用户地理分布（按登录 IP 归属地聚合的去重用户数） */
export interface UserGeoStats {
  totalUsers: number
  /** 有归属地记录的去重用户累计（跨省登录会重复计入各省） */
  totalLocated: number
  provinces: { name: string; users: number }[]
  cities: { name: string; province: string; users: number }[]
}

/** 小时分布统计时间档（用户活跃时段 / 轨迹频率共用）：当天 / 最近 7 天 / 最近 30 天 */
export type HourStatsRange = 'today' | 'week' | 'month'

/** 小时桶：hour 为东八区 0–23 时，count 为该小时内的登录次数 / 轨迹数（多天档位为合计） */
export interface HourStatsPoint {
  hour: number
  count: number
}

export type ActivityStatsRange = 'today' | 'week' | 'month' | 'year' | 'all'
export type ActivityStatsSection = {
  count: number
  distance: number
  duration: number
  calories: number
  elevationGain: number
  byStatus: { status: string; count: number }[]
  finishRate: number
  byType: { type: string; count: number; distance: number; duration: number }[]
}

/** 专题（官方信息页） */
export interface TopicItem {
  id: string
  title: string
  coverUrl: string
  content: string // markdown 正文
  published: boolean
  effectiveAt: number // 生效时间（epoch ms）
  expiresAt: number | null // 过期时间（null=长期）
  createdAt: number
  updatedAt: number
}

/** 广告位（后台管理）：目前只支持模板广告（原生模板 ad-custom） */
export interface AdSlotRow {
  id: string
  /** 端上代码引用的稳定标识，创建后不可改 */
  key: string
  name: string
  /** 流量主后台的广告单元 id（adunit-xxx） */
  unitId: string
  kind: 'template'
  active: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface AdSlotInput {
  key?: string
  name: string
  unitId: string
  active: boolean
  sortOrder: number
}

/** 系统通知（首页单行入口 + 详情页，纯文本正文） */
export interface NotificationItem {
  id: string
  title: string
  content: string
  published: boolean
  publishedAt: number | null
  createdAt: number
  updatedAt: number
}

/** 管理端图片上传（专题图 / 道具图同一套闸门）：url 是裸链（入库用它），previewUrl 带签名（私有桶，展示用） */
async function uploadAdminImage(path: string, file: File): Promise<{ url: string; previewUrl: string }> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: fd })
  if (res.status === 401) {
    redirectToLogin()
    throw new Error('登录已过期，请重新登录')
  }
  const json = await res.json().catch(() => ({ success: false, message: '响应解析失败' }))
  if (!json.success) throw new Error(json.message || `上传失败(${res.status})`)
  return json.data as { url: string; previewUrl: string }
}

/** 专题图片上传 */
export async function uploadTopicImage(file: File): Promise<{ url: string; previewUrl: string }> {
  return uploadAdminImage('/admin/topics/upload', file)
}

/** 道具图上传 */
export async function uploadPointItemImage(file: File): Promise<{ url: string; previewUrl: string }> {
  return uploadAdminImage('/admin/points/items/image', file)
}

/** 作废轨迹清理预览（列表接口每次刷新带回；真删要显式调 purgeCancelled） */
export interface PurgePreview {
  /** 保留期天数，超期才进可删范围 */
  retentionDays: number
  /** 到了可删条件的条数（已作废 + 超期 + 恢复出来也成不了一条运动） */
  wouldDelete: number
  /** 超期但还能恢复成一条运动的：保留 */
  keptRescuable: number
  /** 未到保留期的作废行：本轮不动 */
  keptRecent: number
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/admin/login', { method: 'POST', body: { username, password } }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<null>('/admin/password', { method: 'PUT', body: { oldPassword, newPassword } }),
  overview: () =>
    request<{
      userCount: number
      genderCount: { male: number; female: number; unknown: number }
      activityCount: number
      finishedCount: number
      totalDistanceKm: number
      footprintCount: number
      footprintUserCount: number
      footprintPhotoCount: number
    }>('/admin/overview'),
  // 专题（官方信息页）
  topics: () => request<TopicItem[]>('/admin/topics'),
  createTopic: (body: Partial<TopicItem>) => request<TopicItem>('/admin/topics', { method: 'POST', body }),
  updateTopic: (id: string, body: Partial<TopicItem>) =>
    request<TopicItem>(`/admin/topics/${id}`, { method: 'PUT', body }),
  deleteTopic: (id: string) => request<null>(`/admin/topics/${id}`, { method: 'DELETE' }),
  // 系统通知（首页单行入口 + 详情页）
  notifications: () => request<NotificationItem[]>('/admin/notifications'),
  createNotification: (body: Partial<NotificationItem>) =>
    request<NotificationItem>('/admin/notifications', { method: 'POST', body }),
  updateNotification: (id: string, body: Partial<NotificationItem>) =>
    request<NotificationItem>(`/admin/notifications/${id}`, { method: 'PUT', body }),

  // ==================== 广告管理（目前只支持模板广告） ====================
  adSlots: () => request<AdSlotRow[]>('/admin/ads'),
  createAdSlot: (body: AdSlotInput) => request<AdSlotRow>('/admin/ads', { method: 'POST', body }),
  updateAdSlot: (id: string, body: AdSlotInput) =>
    request<AdSlotRow>(`/admin/ads/${id}`, { method: 'PUT', body }),
  deleteAdSlot: (id: string) => request<null>(`/admin/ads/${id}`, { method: 'DELETE' }),
  deleteNotification: (id: string) =>
    request<null>(`/admin/notifications/${id}`, { method: 'DELETE' }),
  users: (page = 1, pageSize = 20, keyword = '', sortBy = '', order = '') =>
    request<{ total: number; page: number; items: unknown[] }>(`/admin/users?page=${page}&pageSize=${pageSize}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}${sortBy ? `&sortBy=${sortBy}` : ''}${order ? `&order=${order}` : ''}`),
  adminStats: () =>
    request<{ today: AdminStatsCell; week: AdminStatsCell; month: AdminStatsCell }>('/admin/stats'),
  adminTrend: (type = 'day') =>
    request<{ type: string; data: AdminTrendPoint[] }>(`/admin/trend?type=${type}`),
  regionStats: () =>
    request<{ provinces: { name: string; count: number }[]; cities: { name: string; province: string; count: number }[] }>('/admin/region-stats'),
  activityStats: () =>
    request<Record<ActivityStatsRange, ActivityStatsSection>>('/admin/activity-stats'),
  activityTrend: (days = 30) =>
    request<{ days: number; data: { date: string; count: number; distanceKm: number }[] }>(`/admin/activity-trend?days=${days}`),
  activityGeoStats: (range: ActivityStatsRange = 'all') =>
    request<ActivityGeoStats>(`/admin/activity-geo-stats?range=${range}`),
  // 轨迹频率统计：已完成轨迹按开始时间小时分桶（24 桶补零）
  activityHourStats: (range: HourStatsRange = 'today') =>
    request<{ range: HourStatsRange; data: HourStatsPoint[] }>(`/admin/activity-hour-stats?range=${range}`),
  activities: (page = 1, pageSize = 20, filters: Record<string, string> = {}) => {
    const qs = Object.entries(filters)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return request<{ total: number; page: number; items: unknown[]; purgePreview?: PurgePreview }>(
      `/admin/activities?page=${page}&pageSize=${pageSize}${qs ? `&${qs}` : ''}`,
    )
  },
  // 清理已作废轨迹：判据是"恢复出来也成不了一条运动"，不是"有没有点"；不可逆，页面必须二次确认
  purgeCancelled: () =>
    request<{ retentionDays: number; scanned: number; wouldDelete: number; deleted: number; keptRescuable: number; keptRecent: number }>(
      '/admin/activities/purge-cancelled',
      { method: 'POST', body: { dryRun: false } },
    ),
  // 足迹记录（管理端只读 + 违规删除）：列表不下发照片，详情弹窗按需取
  footprintRecords: (page = 1, pageSize = 20, filters: Record<string, string> = {}) => {
    const qs = Object.entries(filters)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return request<{ total: number; page: number; pageSize: number; items: FootprintRecordItem[] }>(
      `/admin/footprint-records?page=${page}&pageSize=${pageSize}${qs ? `&${qs}` : ''}`,
    )
  },
  footprintDetail: (id: string) => request<FootprintRecordDetail>(`/admin/footprint-records/${id}`),
  deleteFootprintRecord: (id: string) => request<null>(`/admin/footprint-records/${id}`, { method: 'DELETE' }),
  // 足迹数据概况：五档一次给全，前端切档不再请求；传 userId 则收口到单个用户（用户详情页用）
  footprintStats: (userId?: string) =>
    request<Record<FootprintStatsRange, FootprintStatsCell>>(
      `/admin/footprint-stats${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`,
    ),
  // 足迹省份分布（含城市明细）：档位非法时后端回落成累计
  footprintGeoStats: (range: FootprintStatsRange = 'all') =>
    request<FootprintGeoStats>(`/admin/footprint-geo-stats?range=${range}`),
  footprintTrend: (days = 30) =>
    request<{ days: number; data: { date: string; count: number; photos: number }[] }>(
      `/admin/footprint-trend?days=${days}`,
    ),
  // 一起运动活动（管理端只读）：列表筛选值非法时服务端回 400（不是静默空列表）
  campaigns: (page = 1, pageSize = 20, filters: Record<string, string> = {}) => {
    const qs = Object.entries(filters)
      .filter(([, v]) => v !== '' && v != null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return request<{ total: number; page: number; pageSize: number; items: CampaignItem[] }>(
      `/admin/campaigns?page=${page}&pageSize=${pageSize}${qs ? `&${qs}` : ''}`,
    )
  },
  campaignDetail: (id: string, page = 1, pageSize = 20, sortBy = '', order = '') =>
    request<CampaignDetail>(
      `/admin/campaigns/${id}?page=${page}&pageSize=${pageSize}${sortBy ? `&sortBy=${sortBy}` : ''}${order ? `&order=${order}` : ''}`,
    ),
  // 成员轨迹弹窗：归属（计入/搭车/漂移/未完成/活动外）由服务端按成员全部贡献时段判
  campaignMemberActivities: (
    campaignId: string,
    userId: string,
    opts: { page?: number; pageSize?: number; type?: string } = {},
  ) => {
    const { page = 1, pageSize = 20, type } = opts
    const typeQs = type ? `&type=${encodeURIComponent(type)}` : ''
    return request<CampaignMemberActivities>(
      `/admin/campaigns/${campaignId}/member-activities?userId=${encodeURIComponent(userId)}&page=${page}&pageSize=${pageSize}${typeQs}`,
    )
  },
  userDetail: (id: string) => request<UserDetail>(`/admin/users/${id}`),
  userLoginLogs: (id: string, page = 1, pageSize = 20, startDate?: string, endDate?: string) => {
    let url = `/admin/users/${id}/login-logs?page=${page}&pageSize=${pageSize}`
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`
    return request<{ total: number; page: number; items: LoginLogItem[] }>(url)
  },
  userLoginStats: (id: string) =>
    request<{ last7Days: number; last30Days: number; last180Days: number; total: number }>(`/admin/users/${id}/login-stats`),
  activityDetail: (id: string) => request<ActivityDetail>(`/admin/activities/${id}`),
  downloadActivityGpx,
  // 预览列按需取整组照片：列表只给 photoCount + 签名首图，一页 100 行 × 多图全签名是白烧 CPU
  activityPhotos: (id: string) =>
    request<ActivityDetail>(`/admin/activities/${id}`).then((d) => flattenMarkerPhotos(d.markers)),
  footprintPhotos: (id: string) =>
    request<FootprintRecordDetail>(`/admin/footprint-records/${id}`).then((d) => d.photos),
  // 修改轨迹状态（管理端纠错：finished↔cancelled 互转，不提供删除）
  updateActivityStatus: (id: string, status: 'finished' | 'cancelled') =>
    request<{ id: string; status: string; changed: boolean }>(`/admin/activities/${id}/status`, {
      method: 'PUT',
      body: { status },
    }),
  // 用户备注（仅管理后台可见）
  updateUserNote: (id: string, note: string) =>
    request<{ id: string; note: string }>(`/admin/users/${id}/note`, { method: 'PUT', body: { note } }),
  leaderboard: (type: string, period: string, province: string, limit = 20) =>
    request<LeaderboardData>(
      `/admin/leaderboard?type=${type}&period=${period}&province=${encodeURIComponent(province)}&limit=${limit}`,
    ),
  leaderboardRegions: () => request<LeaderboardRegions>('/admin/leaderboard-regions'),
  userStats: () => request<UserStats>('/admin/user-stats'),
  userTrend: (range: UserTrendRange = 'week') =>
    request<{ range: UserTrendRange; data: UserTrendPoint[] }>(`/admin/user-trend?range=${range}`),
  userGeoStats: () => request<UserGeoStats>('/admin/user-geo-stats'),
  // 用户活跃时段：登录记录按小时分桶（24 桶补零）
  loginHourStats: (range: HourStatsRange = 'today') =>
    request<{ range: HourStatsRange; data: HourStatsPoint[] }>(`/admin/login-hour-stats?range=${range}`),
  getChinaMap: () => request<any>('/geo/china-map'),
  getProvinceMap: (adcode: number) => request<any>(`/geo/province-map?adcode=${adcode}`),
  // ==================== 积分管理 · 概况与双趋势 ====================
  // 概况按 PointRecord.type 聚合，故意不下发 totalSpent（它混了撤回，不能当消耗用）
  pointsOverview: () => request<PointsOverview>('/admin/points/overview'),
  // days 只认 7/30/90（其余服务端 400）；缺日补 0，data.length 恒等于 days
  pointsTrend: (days: PointsTrendDays = 30) =>
    request<{ days: number; data: PointsTrendBucket[] }>(`/admin/points/trend?days=${days}`),
  // ==================== 积分管理 · 用户积分 ====================
  // 列表：keyword 搜昵称/UID，sortBy 只认 balance / lastEarnedAt / totalEarned / exchanges
  pointsUsers: (page = 1, pageSize = 20, keyword = '', sortBy = '', order = '') => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (keyword) p.set('keyword', keyword)
    if (sortBy) p.set('sortBy', sortBy)
    if (order) p.set('order', order)
    return request<PointsUserList>(`/admin/points/users?${p}`)
  },
  pointsUser: (id: string) => request<PointsUserDetail>(`/admin/points/users/${id}`),
  pointsUserRecords: (id: string, page = 1, pageSize = 20, type = '') => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (type) p.set('type', type)
    return request<PointsUserRecordList>(`/admin/points/users/${id}/records?${p}`)
  },
  pointsUserCards: (id: string) => request<PointsUserCardRow[]>(`/admin/points/users/${id}/cards`),
  // ==================== 积分管理 · 道具目录与发放 ====================
  // 列表行带 id 与 previewUrl；create/update 回执用的主键叫 _id
  pointsItems: () => request<PointItemRow[]>('/admin/points/items'),
  createPointItem: (input: PointItemInput) =>
    request<SavedPointItemRow>('/admin/points/items', { method: 'POST', body: input }),
  // PUT 覆盖整行内容：十三个内容字段必传（缺一个 400 点名），stock/unlimited 一律不写
  updatePointItem: (id: string, input: PointItemInput) =>
    request<SavedPointItemRow>(`/admin/points/items/${id}`, { method: 'PUT', body: input }),
  // 库存/不限量/每日投放改写传目标值不是增量；回执只回 stock/unlimited 两态，
  // dailyQuota/perUserDaily 以改完重拉目录为准（api 的 StockState 只有这两个字段）
  setPointItemStock: (
    id: string,
    patch: { stock?: number; unlimited?: boolean; dailyQuota?: number; perUserDaily?: number },
  ) =>
    request<{ before: PointItemStockState; after: PointItemStockState }>(
      `/admin/points/items/${id}/stock`,
      { method: 'PATCH', body: patch },
    ),
  // 后台发放：userIds 是名单、count 是每个用户几张；整单库存不足 400，单个用户失败只跳过
  grantPointItem: (id: string, input: PointGrantInput) =>
    request<PointGrantResult>(`/admin/points/items/${id}/grant`, { method: 'POST', body: input }),
  pointIssuances: (q: PointIssuanceQuery = {}) => {
    const p = new URLSearchParams({ page: String(q.page ?? 1), pageSize: String(q.pageSize ?? 20) })
    if (q.itemKey) p.set('itemKey', q.itemKey)
    if (q.source) p.set('source', q.source)
    if (q.userId) p.set('userId', q.userId)
    if (q.keyword) p.set('keyword', q.keyword)
    return request<PointIssuanceList>(`/admin/points/issuances?${p}`)
  },
  pointItemsOverview: () => request<PointItemsOverview>('/admin/points/items/overview'),
  // 免广告名单：积分域内唯一下发 openid 的出口（导出人群包用）
  adFreeRoster: () => request<AdFreeRosterRow[]>('/admin/points/ad-free/roster'),
  // ===== 实物订单（兑换实物商品产生的发货单）=====
  // 列表只下发打码手机号；完整号码要在订单详情里看（这里就是同一行数据，不额外脱敏第二次）
  pointOrders: (q: { status?: string; keyword?: string; page?: number; pageSize?: number } = {}) => {
    const p = new URLSearchParams({ page: String(q.page ?? 1), pageSize: String(q.pageSize ?? 20) })
    if (q.status) p.set('status', q.status)
    if (q.keyword) p.set('keyword', q.keyword)
    return request<PointOrderList>(`/admin/points/orders?${p}`)
  },
  // 发货：只允许 待发货 → 已发货，重复点第二次 api 回 400 点名当前状态
  shipPointOrder: (id: string, input: { trackingNo: string; trackingCompany?: string }) =>
    request<PointOrderRow>(`/admin/points/orders/${id}/ship`, { method: 'PATCH', body: input }),
  // 代确认收货：用户忘了点确认时由客服代收，只允许 已发货 → 已完成
  completePointOrder: (id: string) =>
    request<PointOrderRow>(`/admin/points/orders/${id}/complete`, { method: 'PATCH' }),
  // ==================== 积分管理 · 榜单发放台账（spec §4.7） ====================
  // 默认视图只出发放行（pending/credited/revoked）；status=skipped 才给整榜级占位行。
  // periodKey 必须与 period 同传（api 会 400），这里只在两者都填时带上。
  boardSettlements: (q: BoardSettlementQuery = {}) => {
    const p = new URLSearchParams({ page: String(q.page ?? 1), pageSize: String(q.pageSize ?? 20) })
    if (q.status) p.set('status', q.status)
    if (q.period) p.set('period', q.period)
    if (q.period && q.periodKey) p.set('periodKey', q.periodKey)
    if (q.type) p.set('type', q.type)
    if (q.userId) p.set('userId', q.userId)
    return request<BoardSettlementList>(`/admin/points/board-settlements?${p}`)
  },
  // 撤回：note 必填（原文进用户通知），服务端会独立再校验行状态与余额
  revokeBoardSettlement: (id: string, note: string) =>
    request<BoardSettlementRevokeResult>(`/admin/points/board-settlements/${id}/revoke`, {
      method: 'POST',
      body: { note },
    }),
}

/** 积分概况（GET /admin/points/overview）：全部按 PointRecord.type 聚合，没有 totalSpent */
export interface PointsOverview {
  /** 毛发放：Σ delta (delta > 0) */
  earnedGross: number
  /** 撤回：type 以 _rollback 结尾的 |delta| 之和 */
  rolledBack: number
  /** 净发放 = earnedGross − rolledBack */
  earnedNet: number
  /** 发放人数：有 delta > 0 流水的 distinct userId */
  earnedUsers: number
  /** 兑换消耗：Σ |delta| (type = exchange) */
  spentExchange: number
  /** 过期回收：Σ |delta| (type = expire) */
  spentExpire: number
  /** 流通余额：Σ PointAccount.balance */
  balance: number
  /** 今日签到人数（含补签，按人去重） */
  todaySigninUsers: number
  /** 近 7 天（含今天）签到人数 */
  weekSigninUsers: number
  /** 累计签到人数（全表 distinct） */
  totalSigninUsers: number
  /** 持卡未使用人数（unused 且未过期） */
  cardsUnusedUsers: number
}

/** 趋势档位：只有这三档（其余 days 服务端 400） */
export type PointsTrendDays = 7 | 30 | 90

/** 趋势桶：缺日补 0，data.length 恒等于 days */
export interface PointsTrendBucket {
  date: string
  signinUsers: number
  makeupUsers: number
  earned: number
  exchanged: number
  expired: number
}

export interface PointsUserRow {
  id: string
  /** 缺号（未补号用户）为 0 */
  uid: number
  nickname: string
  /** 头像签名链；没上传头像为空串（前端走首字占位） */
  avatarUrl: string
  balance: number
  /** 累计获得 = 毛发放（撤回前口径，不扣 rolledBack） */
  totalEarned: number
  /** 兑换次数（type=exchange 的流水条数） */
  exchanges: number
  /** 持卡未使用张数 */
  cardsUnused: number
  /** 最后发放时刻（epoch ms）；从未发放为 0 */
  lastEarnedAt: number
}

export interface PointsUserList {
  total: number
  page: number
  pageSize: number
  items: PointsUserRow[]
}

export interface PointsUserDetail extends PointsUserRow {
  avatarUrl: string
  /** 撤回（含补签撤回等 _rollback 族） */
  rolledBack: number
  spentExchange: number
  spentExpire: number
  /** 累计消耗 = 兑换 + 过期（不含撤回） */
  totalSpent: number
  /** 累计签到天数（distinct dateKey，含补签） */
  signinDays: number
  streakDay: number
  /** 免广告权益到期时刻（epoch ms）；无权益为 0 */
  adFreeUntil: number
}

/** 积分明细行（列表与弹窗 Tab 共用） */
export interface PointsRecordRow {
  id: string
  type: string
  title: string
  /** 正数为发放、负数为扣减 */
  delta: number
  balanceAfter: number
  /** 业务日期（东八区 YYYY-MM-DD） */
  bizDate: string
  refType: string
  refId: string
  createdAt: number
}

export interface PointsUserRecordList {
  items: PointsRecordRow[]
  total: number
  balance: number
  page: number
  pageSize: number
}

export type PointCardStatus = 'unused' | 'used' | 'expired'

/** 用户全部道具卡（含后台手动/系统赠送）；状态由服务端实时推导 */
export interface PointsUserCardRow {
  id: string
  itemKey: string
  itemName: string
  source: string
  sourceText: string
  status: PointCardStatus
  statusText: string
  createdAt: number
  expiresAt: number
  usedForDate: string
  activatedAt: number
  benefitDays: number
  grantedBy: string
  note: string
}

export type PointItemEffectKind = 'makeup' | 'ad_free'

/** 道具类型：virtual = 发卡到账户（补签卡/免广告卡）；physical = 实物商品，兑换即生成待发货订单 */
export type PointItemKind = 'virtual' | 'physical'

/** 道具入参：新建时除 key/name/price/validDays/effect 外可省略；PUT 的十三个内容字段全必传 */
export interface PointItemInput {
  key: string
  name: string
  subtitle?: string
  description?: string
  notes?: string[]
  price: number
  validDays: number
  effect: { kind: PointItemEffectKind; days: number }
  /** 省略 = virtual */
  kind?: PointItemKind
  /** 实物详情图（入库裸链，最多 6 张）；省略 = 空数组 */
  detailImages?: string[]
  /** 每人限购张数，0 = 不限；实物新建默认 1，虚拟默认 0 */
  perUserLimit?: number
  stock?: number
  unlimited?: boolean
  active?: boolean
  sortOrder?: number
  /** 入库裸链（预览取 previewUrl） */
  image?: string
}

/** 管理端目录行（含下架项）：id 是主键，previewUrl 是签名链 */
export interface PointItemRow {
  id: string
  key: string
  name: string
  subtitle: string
  description: string
  notes: string[]
  price: number
  validDays: number
  effect: { kind: PointItemEffectKind; days: number }
  kind: PointItemKind
  /** 入库裸链（回填表单时写回它） */
  detailImages: string[]
  /** 与 detailImages 一一对应的签名缩略链：<img> 只能用这个，裸链直连 403 */
  detailPreviewUrls: string[]
  /** 0 = 不限购 */
  perUserLimit: number
  /** 每日投放总量：0 = 不限（PATCH /stock 侧独立字段，内容编辑不碰） */
  dailyQuota: number
  /** 每人每日上限：0 = 不限（同 PATCH /stock 侧） */
  perUserDaily: number
  stock: number
  unlimited: boolean
  active: boolean
  sortOrder: number
  image: string
  previewUrl: string
  exchangeCount: number
  grantCount: number
}

/** create/update 回执：主键叫 _id，其余同目录行；不返回兑换数/发放数 */
export type SavedPointItemRow = Omit<PointItemRow, 'id' | 'exchangeCount' | 'grantCount'> & { _id: string }

/** 库存改写的改前/改后（stock 与 unlimited 两个字段各自的当前值） */
export interface PointItemStockState {
  stock: number
  unlimited: boolean
}

/** 后台发放入参：source 只接受 admin / system，count 是每个用户几张 */
export interface PointGrantInput {
  userIds: string[]
  count?: number
  source?: 'admin' | 'system'
  note?: string
}

export interface PointGrantResult {
  /** 实际落卡张数 */
  granted: number
  /** 逐个失败原因（用户不存在等），不影响已发出的 */
  failed: { userId: string; reason: string }[]
  /** 回补失败的库存张数：>0 需人工核对 */
  refundFailed: number
}

export type PointIssuanceSource = 'exchange' | 'admin' | 'system'

/** 发放记录行（以卡为主体，三来源都在） */
export interface PointIssuanceRow {
  id: string
  userId: string
  uid: number
  nickname: string
  itemKey: string
  /** 目录被改名后跟随新名；道具被删为空串 */
  itemName: string
  source: PointIssuanceSource
  sourceText: string
  createdAt: number
  expiresAt: number
  /** 实时推导：unused 且已过 expiresAt 算 expired */
  status: PointCardStatus
  statusText: string
  usedForDate: string
  activatedAt: number
  benefitDays: number
  grantedBy: string
  note: string
}

export interface PointIssuanceQuery {  itemKey?: string
  source?: string
  userId?: string
  /** 持卡人昵称或 UID */
  keyword?: string
  page?: number
  pageSize?: number
}

export interface PointIssuanceList {
  total: number
  page: number
  pageSize: number
  items: PointIssuanceRow[]
}

/** 道具概况（GET /points/items/overview）：bySource 恒为三行，相加等于 totalIssued */
export interface PointItemsOverview {
  totalIssued: number
  bySource: { source: PointIssuanceSource; count: number }[]
  byItem: { itemKey: string; itemName: string; count: number }[]
  /** 累计消耗积分（Σ |exchange delta|） */
  totalSpentPoints: number
  /** 生效中免广告人数（等于当天名单行数） */
  adFreeUsers: number
}

/** 免广告名单行：openid 只在这里下发，用于导出 We分析 人群包 */
export interface AdFreeRosterRow {
  openid: string
  uid: number
  nickname: string
  /** 权益到期时刻（epoch ms） */
  adFreeUntil: number
  /** 到期日的东八区日期串（YYYY-MM-DD） */
  adFreeUntilDate: string
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

/** /admin/stats 的每档计数（今日/本周/本月同构） */
export interface AdminStatsCell {
  newUsers: number
  /** 按创建时间新增的轨迹数（含各状态）；概览页轨迹段已改用 /admin/activity-stats */
  newActivities: number
  /** newActivities 里 status=finished 的子集 */
  finishedActivities: number
  newFootprints: number
  uv: number
  pv: number
}

/** /admin/trend 的每个时间桶（newUsers/newFootprints 按创建时间；activities 按开始时间） */
export interface AdminTrendPoint {
  date: string
  newUsers: number
  activities: number
  newFootprints: number
}

/** 足迹列表项（不下发照片数组，photoCount 计数 + coverPhoto 签名首图给缩略图） */
export interface FootprintRecordItem {
  id: string
  userId: string
  userNickname: string
  userUid: string
  /** 归属人头像签名链；没上传头像为空串 */
  userAvatarUrl: string
  title: string
  visitDate: string
  category: string
  placeName: string
  address: string
  province: string
  city: string
  people: string[]
  peopleCount: number
  photoCount: number
  coverPhoto: string
  createdAt: string
}

/** 足迹详情（含照片签名 URL，列表接口不下发） */
export interface FootprintRecordDetail {
  id: string
  userId: string
  userNickname: string
  userUid: string
  visitDate: string
  title: string
  category: string
  people: string[]
  description: string
  location: {
    name: string
    address: string
    province: string
    city: string
    adcode: number
    latitude: number
    longitude: number
  }
  photos: string[]
  createdAt: string
  updatedAt: string
}

/** 活动列表项（管理端只读） */
export interface CampaignItem {
  id: string
  title: string
  visibility: 'public' | 'private'
  status: 'upcoming' | 'active' | 'ended' | 'dissolved'
  allowedTypes: string[]
  memberLimit: number | null
  startAt: number
  endAt: number
  creatorNickname: string
  creatorUid: number | null
  joinedCount: number
  pendingCount: number
  createdAt: string
}

/** 活动成员（含加入段与个人汇总） */
export interface CampaignMemberRow {
  userId: string
  role: 'creator' | 'member'
  state: string
  name: string
  /** 头像签名链；没上传头像为空串 */
  avatarUrl: string
  uid: number | null
  joinedAt: number | null
  leftAt: number | null
  count: number
  distance: number
  duration: number
  /** 被 driftScore 门禁排除的轨迹条数（数据保留，不计入活动统计） */
  excludedCount?: number
}

/** 活动内按运动类型的汇总（只统计当前在队成员的贡献时段） */
export interface CampaignTypeSummaryRow {
  type: string
  count: number
  distance: number
  duration: number
}

/** 活动内距离排行榜（只在队成员，服务端已排好序并带名次，TOP 10） */
export interface CampaignLeaderboardRow {
  rank: number
  userId: string
  name: string
  /** 头像签名链；没上传头像为空串 */
  avatarUrl: string
  distance: number
  count: number
  duration: number
}

export interface CampaignTrendRow {
  date: string
  distance: number
}

export interface CampaignTotals {
  count: number
  distance: number
  duration: number
}

export interface CampaignDetail {
  id: string
  title: string
  description: string
  visibility: 'public' | 'private'
  allowedTypes: string[]
  memberLimit: number | null
  startAt: number
  endAt: number
  status: 'upcoming' | 'active' | 'ended' | 'dissolved'
  createdAt: string
  updatedAt: string
  typeSummary: CampaignTypeSummaryRow[]
  /** 逐日全队距离趋势（活动跨度内每天一行） */
  trend: CampaignTrendRow[]
  /** 当前在队成员的汇总（与小程序活动页同一口径） */
  totals: CampaignTotals
  /** 被 driftScore 门禁排除的轨迹总数（当前在队成员） */
  excludedTotal: number
  /** 末位成员（在队、距离最少）：管理端一键看 TA 的全部轨迹 */
  lastPlace: { userId: string; name: string; distance: number } | null
  leaderboard: CampaignLeaderboardRow[]
  /** 成员表当前页（含已离开/被移出的历史段）；汇总与排行榜始终按全员算 */
  members: CampaignMemberRow[]
  membersTotal: number
  membersPage: number
  membersPageSize: number
}

/**
 * 成员轨迹弹窗的行归属（服务端判，与活动汇总同一套判据）：
 * - counted：计入活动
 * - vehicle / drift：在贡献时段内，但被「疑似搭车 / 定位漂移」门禁挡掉
 * - unfinished：还没成为一条完成的运动
 * - outside：不在该成员任何一个贡献时段内（开赛前、入队前、离队后）
 */
export type CampaignMemberActivityReason = 'counted' | 'vehicle' | 'drift' | 'unfinished' | 'outside'

export interface CampaignMemberActivityRow {
  id: string
  type: string
  status: string
  startTime: number
  distance: number
  duration: number
  vehicleMs: number
  driftScore: number | null
  reason: CampaignMemberActivityReason
}

/** 摘要按全量算（与分页无关），前端头部直接展示 */
export interface CampaignMemberActivitySummary {
  counted: number
  vehicle: number
  drift: number
  unfinished: number
  outside: number
}

export interface CampaignMemberActivities {
  campaignId: string
  userId: string
  name: string
  allowedTypes: string[]
  startAt: number
  endAt: number
  summary: CampaignMemberActivitySummary
  total: number
  page: number
  pageSize: number
  items: CampaignMemberActivityRow[]
}

/** 足迹概况档位（与后端 /admin/footprint-stats 的 key 同名） */
export type FootprintStatsRange = 'today' | 'week' | 'month' | 'year' | 'all'
/** 足迹概况单档指标（时间一律按记录创建时间，不是用户手填的到访日期） */
export interface FootprintStatsCell {
  total: number
  userCount: number
  provinceCount: number
  cityCount: number
  photoCount: number
  withPhotoCount: number
}

/** 足迹省份分布（range 原样回显；空省市记录不在 total 里） */
export interface FootprintGeoStats {
  range: string
  total: number
  provinces: {
    province: string
    count: number
    cities: { city: string; count: number }[]
  }[]
}

/** 实物订单状态机：待发货 →（后台发货）已发货 →（用户确认或后台代确认）已完成 */
export type PointOrderStatus = 'pending_ship' | 'shipped' | 'completed'

/** 订单行（GET /admin/points/orders）：地址三件套下单时快照，改地址不影响历史单 */
export interface PointOrderRow {
  id: string
  userId: string
  uid: number
  nickname: string
  itemKey: string
  /** 商品名快照（目录改名不影响历史单读得懂） */
  itemName: string
  /** 下单时实付积分 */
  cost: number
  receiver: string
  /** 打码手机号（列表不出完整号码） */
  phoneMasked: string
  /** 详细地址 */
  detail: string
  status: PointOrderStatus
  statusText: string
  trackingNo: string
  trackingCompany: string
  createdAt: number
  shippedAt: number
  completedAt: number
}

export interface PointOrderList {
  total: number
  page: number
  pageSize: number
  items: PointOrderRow[]
}

// ==================== 积分管理 · 榜单发放台账 ====================

/** 台账行状态：skipped = 整榜级占位（门槛未过/完成标记），永不提供撤回 */
export type BoardSettlementStatus = 'pending' | 'credited' | 'skipped' | 'revoked'

/** 榜单周期 */
export type BoardSettlementPeriod = 'week' | 'month' | 'year'

/**
 * 台账行（GET /admin/points/board-settlements 的 items[]）：
 * - boardLevel/userId=null：整榜级占位行（不是某个用户的奖励，rank/points 恒为 0）
 * - canRevoke：只有「发放行且 credited」为 true，撤回按钮按它渲染（服务端会独立再拒一次）
 * - reason：skipped = 占位说明；revoked = 后台撤回备注原文
 */
export interface BoardSettlementRow {
  id: string
  type: string
  /** 中文类型名（未知值回落裸值） */
  typeLabel: string
  period: BoardSettlementPeriod
  periodKey: string
  /** 周期文案（周＝「2034/03/06 至 2034/03/12 这一周」、月＝「2034年3月」、年＝「2034年」） */
  periodLabel: string
  /** 「骑行·周榜」 */
  board: string
  userId: string | null
  uid: number
  nickname: string
  rank: number
  points: number
  status: BoardSettlementStatus
  kind: 'payout' | 'threshold_skip' | 'settled_marker' | 'board_level'
  boardLevel: boolean
  canRevoke: boolean
  reason: string
  recordId: string | null
  revokedBy: string
  revokedAt: number
  createdAt: number
  updatedAt: number
}

export interface BoardSettlementList {
  total: number
  page: number
  pageSize: number
  /** true = 默认「只看发放行」视图（整榜级占位行需显式筛 status=skipped） */
  payoutRowsOnly: boolean
  items: BoardSettlementRow[]
}

export interface BoardSettlementQuery {
  page?: number
  pageSize?: number
  status?: BoardSettlementStatus | ''
  period?: BoardSettlementPeriod | ''
  /** 规范周期键（周＝该周周一），必须与 period 同传 */
  periodKey?: string
  type?: string
  userId?: string
}

/** 撤回结果：notification 为 null 时撤回已成功但通知未发出（按服务端日志补发） */
export interface BoardSettlementRevokeResult {
  id: string
  status: BoardSettlementStatus
  userId: string
  type: string
  period: BoardSettlementPeriod
  periodKey: string
  rank: number
  points: number
  recordId: string
  rollbackRecordId: string
  /** 撤回后余额 */
  balance: number
  note: string
  revokedBy: string
  revokedAt: number
  notification: { id: string; title: string; content: string } | null
}
