/**
 * 一起运动活动（campaign）状态的文案与配色 —— 列表页与详情弹窗共用一份。
 *
 * 状态是**服务端派生值**：库里只写 active / dissolved，`upcoming`（未开赛）与 `ended`（已到期）
 * 都由服务端按 now 算好下发。前端不拿 startAt / endAt 自己重算，否则两处判据会因
 * 「刚好跨过边界」而分叉。
 */
export type CampaignStatus = 'upcoming' | 'active' | 'ended' | 'dissolved'

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  upcoming: '未开始',
  active: '进行中',
  ended: '已结束',
  dissolved: '已解散',
}

/** 四档各占一个 theme：未开始蓝（倒计时感）· 进行中绿 · 已结束灰 · 已解散橙 */
export const CAMPAIGN_STATUS_THEMES: Record<CampaignStatus, 'primary' | 'success' | 'default' | 'warning'> = {
  upcoming: 'primary',
  active: 'success',
  ended: 'default',
  dissolved: 'warning',
}

/** 未知档位原样透传 + 落 default，后端加档时不至于是空白 */
export function campaignStatusMeta(status: string): { label: string; theme: 'primary' | 'success' | 'default' | 'warning' } {
  const key = status as CampaignStatus
  return {
    label: CAMPAIGN_STATUS_LABELS[key] || status,
    theme: CAMPAIGN_STATUS_THEMES[key] || 'default',
  }
}
