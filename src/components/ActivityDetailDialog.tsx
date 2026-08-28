import { useEffect, useRef, useState } from 'react'
import { Dialog, Tag, Loading, MessagePlugin } from 'tdesign-react'
import * as echarts from 'echarts'
import { adminApi, type ActivityDetail } from '../api'
import { typeLabel, STATUS_LABELS, fmtKm, fmtDuration, fmtPace, fmtDateTime, haversine } from '../utils/format'

const MARKER_LABELS: Record<string, { label: string; theme: 'primary' | 'success' | 'warning' | 'default' }> = {
  checkpoint: { label: '打卡', theme: 'primary' },
  rest: { label: '休息', theme: 'warning' },
  photo: { label: '拍照', theme: 'success' },
  note: { label: '备注', theme: 'default' },
}

interface Props {
  id: string | null
  onClose: () => void
}

/** 轨迹详情弹窗（用户页/轨迹列表共用） */
export default function ActivityDetailDialog({ id, onClose }: Props) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setDetail(null)
    adminApi
      .activityDetail(id)
      .then(setDetail)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载轨迹详情失败'))
      .finally(() => setLoading(false))
  }, [id])

  // 海拔/速度剖面图（横轴：累计距离；海拔优先，无海拔用速度兜底）
  useEffect(() => {
    if (!detail || !chartRef.current) return
    const pts = detail.trackPoints
    let cum = 0
    const coords: { dist: number; altitude: number | null; speed: number | null }[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      if (i > 0) {
        const prev = pts[i - 1]
        cum += haversine(prev.lat, prev.lng, p.lat, p.lng)
      }
      coords.push({ dist: +(cum / 1000).toFixed(3), altitude: p.altitude, speed: p.speed })
    }
    const altSeries = coords.filter((c) => c.altitude != null)
    const useAltitude = altSeries.length >= 2
    const data = useAltitude
      ? altSeries.map((c) => [c.dist, c.altitude])
      : coords.filter((c) => c.speed != null).map((c) => [c.dist, +((c.speed! * 3.6).toFixed(1))])
    if (data.length < 2) return

    if (!chart.current) chart.current = echarts.init(chartRef.current)
    chart.current.setOption(
      {
        tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v} ${useAltitude ? 'm' : 'km/h'}` },
        grid: { left: 44, right: 16, top: 32, bottom: 30 },
        xAxis: { type: 'category', name: 'km', data: data.map((d) => d[0]), axisLabel: { interval: 'auto' } },
        yAxis: { type: 'value', name: useAltitude ? '海拔 m' : '速度 km/h' },
        series: [
          {
            name: useAltitude ? '海拔' : '速度',
            type: 'line',
            data: data.map((d) => d[1]),
            showSymbol: false,
            smooth: true,
            lineStyle: { color: '#0052d9', width: 2 },
            areaStyle: { color: 'rgba(0,82,217,0.08)' },
          },
        ],
      },
      true,
    )
    const onResize = () => chart.current?.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [detail])

  useEffect(
    () => () => {
      chart.current?.dispose()
      chart.current = null
    },
    [],
  )

  const items: { label: string; value: string }[] = detail
    ? [
        { label: '用户', value: detail.userNickname },
        { label: '运动类型', value: typeLabel(detail.type) },
        { label: '开始时间', value: fmtDateTime(detail.startTime) },
        { label: '结束时间', value: fmtDateTime(detail.endTime) },
        { label: '距离', value: `${fmtKm(detail.distance)} km` },
        { label: '时长', value: fmtDuration(detail.duration) },
        { label: '平均配速', value: fmtPace(detail.avgPace) },
        { label: '最快 1km', value: fmtPace(detail.fastestKm) },
        { label: '卡路里', value: `${detail.calories ?? 0} 千卡` },
        { label: '累计爬升', value: `${detail.elevationGain ?? 0} m` },
        { label: '最高海拔', value: detail.maxAltitude != null ? `${detail.maxAltitude} m` : '—' },
        { label: '暂停时长', value: fmtDuration(Math.round((detail.pausedMs ?? 0) / 1000)) },
        { label: '轨迹点', value: `${detail.pointsCount} 个` },
        { label: '起点地址', value: detail.startAddress || detail.startCity || '—' },
        { label: '终点地址', value: detail.endAddress || '—' },
        { label: '途经省份', value: detail.provinces?.length ? detail.provinces.join('、') : '—' },
      ]
    : []

  return (
    <Dialog
      header={detail ? `轨迹详情 · ${typeLabel(detail.type)}` : '轨迹详情'}
      visible={!!id}
      width={780}
      footer={false}
      onClose={onClose}
      destroyOnClose
      className="activity-detail-dialog"
      style={{ maxHeight: '85vh' }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loading />
        </div>
      ) : detail ? (
        <div style={{ maxHeight: 'calc(85vh - 60px)', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag theme={detail.status === 'finished' ? 'success' : detail.status === 'cancelled' ? 'danger' : 'warning'}>
              {STATUS_LABELS[detail.status] || detail.status}
            </Tag>
            <span style={{ fontSize: 13, color: '#8a93a6' }}>轨迹 ID：{detail.id}</span>
          </div>

          {/* 指标网格 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px 16px',
              background: '#f8f9fb',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            {items.map((it) => (
              <div key={it.label}>
                <div style={{ fontSize: 12, color: '#8a93a6', marginBottom: 2 }}>{it.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{it.value}</div>
              </div>
            ))}
          </div>

          {detail.note && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fffbe6', borderRadius: 6, fontSize: 13 }}>
              备注：{detail.note}
            </div>
          )}

          {/* 海拔/速度剖面 */}
          <div ref={chartRef} style={{ height: 220, marginBottom: 16 }} />

          {/* 打点列表 */}
          {detail.markers.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>打点记录（{detail.markers.length}）</div>
              {detail.markers.map((m) => {
                const meta = MARKER_LABELS[m.type] || MARKER_LABELS.note
                const photos = m.photos?.length ? m.photos : m.photoUrl ? [m.photoUrl] : []
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '10px 0',
                      borderTop: '1px solid #f0f2f5',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Tag theme={meta.theme}>{meta.label}</Tag>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>
                        {fmtDateTime(m.timestamp)}
                        {m.note ? <span style={{ marginLeft: 8, color: '#4e5969' }}>{m.note}</span> : null}
                      </div>
                      {photos.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          {photos.map((p) => (
                            <img
                              key={p}
                              src={p}
                              alt="打点照片"
                              style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid #eef0f3' }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}
