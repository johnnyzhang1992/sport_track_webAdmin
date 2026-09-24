/** 轨迹地图：maplibre-gl + 腾讯栅格瓦片底图 + Canvas 2D 叠加绘制轨迹线（按海拔或配速分档着色） */
import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { altitudeSegColors, applyVehicleColor, computeSegPaces, paceColor, usesAltitudeColor } from '../utils/pace'

export interface TrackLatLng {
  lat: number
  lng: number
  pauseGap?: boolean
  timestamp?: number
  altitude?: number | null
  /** 服务端判出的非运动段（疑似乘车）：线画灰，不隐身删掉 */
  vehicle?: boolean
}

export interface TrackMarker extends TrackLatLng {
  id: string
}

interface Props {
  points: TrackLatLng[]
  markers?: TrackMarker[]
  height?: number
  /** 运动类型：徒步/爬山按海拔着色，其余按该类型的绝对配速刻度；点无时间戳时自动回退单色 */
  activityType?: string
  onExtent?: (extent: { widthKm: number; heightKm: number }) => void
}

/** 无配速数据（点缺时间戳）时的整条单色 */
const PLAIN_COLOR = '#0052d9'

function transformRequest(url: string, resourceType?: string) {
  if (resourceType === 'Tile' && url.includes('gtimg.com')) {
    const m = url.match(/z=(\d+)&x=(\d+)&y=(\d+)/)
    if (m) {
      const z = +m[1]
      const x = +m[2]
      const y = +m[3]
      const flippedY = 2 ** z - 1 - y
      return { url: `https://rt${(x + y) % 4}.map.gtimg.com/tile?z=${z}&x=${x}&y=${flippedY}` }
    }
  }
  return { url }
}

export default function TrackMap({ points, markers = [], height = 360, activityType, onExtent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onExtentRef = useRef(onExtent)
  onExtentRef.current = onExtent

  useEffect(() => {
    const el = containerRef.current
    if (!el || points.length < 2) return

    const coords: [number, number][] = points.map((p) => [p.lng, p.lat])
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds())

    // 按 pauseGap 切段（暂停间隙断开连线）+ 逐点着色：只依赖点数据，算一次即可，
    // 地图 move/resize 重绘不重复计算
    const ranges: { start: number; end: number }[] = []
    let segStart = 0
    for (let i = 0; i < points.length; i++) {
      if (points[i].pauseGap && i > segStart) {
        ranges.push({ start: segStart, end: i })
        segStart = i
      }
    }
    ranges.push({ start: segStart, end: points.length })
    const segs = ranges.map((r) => points.slice(r.start, r.end))
    // 每段一个「与段内点等长」的颜色数组，下标 i = 进入第 i 点那一步的颜色，null = 该步不画
    // 徒步/爬山有可分档的海拔 → 按海拔；其余按平滑配速；配速算不出来（点没时间戳）→ 整条单色
    // 最后统一把车速步盖成灰色（两种着色模式都盖，与小程序同一条规则）
    const tierColors: (string | null)[][] = usesAltitudeColor(points, activityType)
      ? segs.map(altitudeSegColors)
      : (() => {
          const paces = computeSegPaces(segs)
          const hasPace = paces.some((list) => list.some((p) => p != null))
          return paces.map((list) =>
            list.map((p, i) => (hasPace ? (i === 0 ? null : paceColor(p, activityType)) : PLAIN_COLOR)),
          )
        })()
    const segColors = segs.map((seg, si) => applyVehicleColor(seg, tierColors[si]))

    const latMid = (bounds.getSouth() + bounds.getNorth()) / 2
    onExtentRef.current?.({
      widthKm: +((bounds.getEast() - bounds.getWest()) * 111.32 * Math.cos((latMid * Math.PI) / 180)).toFixed(2),
      heightKm: +((bounds.getNorth() - bounds.getSouth()) * 111.32).toFixed(2),
    })

    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        base: {
          type: 'raster',
          tiles: ['https://rt0.map.gtimg.com/tile?z={z}&x={x}&y={y}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: '&copy; 腾讯地图',
        },
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }],
    }

    const map = new maplibregl.Map({
      container: el,
      style,
      bounds,
      transformRequest,
      fitBoundsOptions: { padding: 48, duration: 0, maxZoom: 17 },
      attributionControl: { compact: true },
    })

    // Canvas overlay：在 maplibre canvas 之上叠一层透明 canvas 手绘轨迹线
    const overlay = document.createElement('canvas')
    overlay.style.position = 'absolute'
    overlay.style.inset = '0'
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = '1'
    el.appendChild(overlay)

    const drawTrack = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      const dpr = window.devicePixelRatio || 1
      overlay.width = w * dpr
      overlay.height = h * dpr
      overlay.style.width = `${w}px`
      overlay.style.height = `${h}px`
      const ctx = overlay.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      const projected = coords.map((c) => map.project(c as [number, number]))
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const stroke = (path: { x: number; y: number }[]) => {
        ctx.beginPath()
        path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.stroke()
      }
      segs.forEach((_, si) => {
        const seg = projected.slice(ranges[si].start, ranges[si].end)
        if (seg.length < 2) return
        // 同色连续点合并成一条子路径，跨档时共享前后两个端点，接缝不断口；null 档（无海拔）留断口
        const colors = segColors[si]
        let i = 1
        while (i < seg.length) {
          const color = colors[i]
          if (!color) {
            i++
            continue
          }
          let end = i
          while (end + 1 < seg.length && colors[end + 1] === color) end++
          ctx.strokeStyle = color
          stroke(seg.slice(i - 1, end + 1))
          i = end + 1
        }
      })
    }

    // 初始绘制 + 每次地图移动/缩放后重绘
    map.on('move', drawTrack)
    map.on('resize', drawTrack)
    // 首次等 map 有有效尺寸后绘制
    const initDraw = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) drawTrack()
      else requestAnimationFrame(initDraw)
    }
    requestAnimationFrame(initDraw)

    const markerInsts: maplibregl.Marker[] = [
      new maplibregl.Marker({ color: '#00a870' }).setLngLat(coords[0]).addTo(map),
      new maplibregl.Marker({ color: '#e34d59' }).setLngLat(coords[coords.length - 1]).addTo(map),
      ...markers.map((m) => new maplibregl.Marker({ color: '#ed7b2f', scale: 0.7 }).setLngLat([m.lng, m.lat]).addTo(map)),
    ]

    map.on('error', () => {})

    const ro = new ResizeObserver(() => {
      map.resize()
      drawTrack()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      markerInsts.forEach((m) => m.remove())
      overlay.remove()
      map.remove()
    }
  }, [points, markers, activityType])

  return <div ref={containerRef} style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid #eef0f3', position: 'relative' }} />
}
