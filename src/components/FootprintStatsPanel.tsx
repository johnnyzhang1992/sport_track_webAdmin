import { Card } from 'tdesign-react'
import type { FootprintStatsCell, FootprintStatsRange } from '../api'
import RangeButtons from './RangeButtons'

export const FOOTPRINT_STAT_RANGES: { key: FootprintStatsRange; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '近7天' },
  { key: 'month', label: '近30天' },
  { key: 'year', label: '近一年' },
  { key: 'all', label: '累计' },
]

const num = (v: number | undefined) => (v == null ? '—' : String(v))

/**
 * 足迹数据概况卡（足迹管理页 / 用户详情页足迹 Tab 共用）
 * 时间档由父级持有（足迹管理页那组按钮还要驱动省份分布），这里只负责展示；
 * stats 未落地时显示「—」而不是 0，避免先闪一排 0 再跳真值。
 */
export default function FootprintStatsPanel({
  stats,
  range,
  onRangeChange,
  title = '足迹数据概况',
}: {
  stats: Record<FootprintStatsRange, FootprintStatsCell> | null
  range: FootprintStatsRange
  onRangeChange: (v: FootprintStatsRange) => void
  title?: string
}) {
  const sec: FootprintStatsCell | undefined = stats?.[range]
  const perUser = sec && sec.userCount > 0 ? (sec.total / sec.userCount).toFixed(1) : '—'

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          marginBottom: 12,
          paddingRight: 24,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--td-text-color-primary, #1f2329)' }}>时间范围</span>
        <RangeButtons options={FOOTPRINT_STAT_RANGES} value={range} onChange={onRangeChange} />
      </div>

      <Card className="page-card" title={title} style={{ marginBottom: 16 }}>
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: '足迹条数', value: num(sec?.total) },
            { label: '记录用户数', value: num(sec?.userCount) },
            { label: '覆盖省份', value: num(sec?.provinceCount) },
            { label: '照片总数', value: num(sec?.photoCount) },
          ].map((it) => (
            <div key={it.label} style={{ background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.value}</div>
              <div style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 2 }}>{it.label}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            fontSize: 13,
            color: 'var(--td-text-color-secondary, #4e5969)',
            background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
            borderRadius: 8,
            padding: '10px 16px',
          }}
        >
          <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)' }}>按记录创建时间</span>
          <span>
            覆盖城市 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{num(sec?.cityCount)}</b>
          </span>
          <span>
            有照片 <b style={{ fontVariantNumeric: 'tabular-nums' }}>{num(sec?.withPhotoCount)}</b> 条
          </span>
          <span>
            无照片{' '}
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{sec ? String(sec.total - sec.withPhotoCount) : '—'}</b> 条
          </span>
          <span style={{ color: '#00a870' }}>
            人均 <b>{perUser}</b> 条
          </span>
        </div>
      </Card>
    </>
  );
}
