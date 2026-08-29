/** 轨迹地图：maplibre-gl + 腾讯栅格瓦片底图 + Canvas 2D 叠加绘制轨迹线 */
import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export interface TrackLatLng {
  lat: number
  lng: number
}

export interface TrackMarker extends TrackLatLng {
  id: string
}

interface Props {
  points: TrackLatLng[]
  markers?: TrackMarker[]
  height?: number
  onExtent?: (extent: { widthKm: number; heightKm: number }) => void
}

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

export default function TrackMap({ points, markers = [], height = 360, onExtent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onExtentRef = useRef(onExtent)
  onExtentRef.current = onExtent

  useEffect(() => {
    const el = containerRef.current
    if (!el || points.length < 2) return

    const coords: [number, number][] = points.map((p) => [p.lng, p.lat])
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds())

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
      ctx.beginPath()
      ctx.strokeStyle = '#0052d9'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      projected.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
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
  }, [points, markers])

  return <div ref={containerRef} style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid #eef0f3', position: 'relative' }} />
}
