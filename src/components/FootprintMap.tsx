import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Button, Space, Dialog, MessagePlugin } from 'tdesign-react'
import { Plus, Minus } from '@phosphor-icons/react'
import { adminApi } from '../api'

interface City {
  name: string
  province: string
  count: number
}

interface Props {
  cities: City[]
  onProvinceClick?: (province: string) => void
}

// 省份名称到行政区划代码的映射
const PROVINCE_TO_CODE: Record<string, string> = {
  '北京市': '110000',
  '天津市': '120000',
  '河北省': '130000',
  '山西省': '140000',
  '内蒙古自治区': '150000',
  '辽宁省': '210000',
  '吉林省': '220000',
  '黑龙江省': '230000',
  '上海市': '310000',
  '江苏省': '320000',
  '浙江省': '330000',
  '安徽省': '340000',
  '福建省': '350000',
  '江西省': '360000',
  '山东省': '370000',
  '河南省': '410000',
  '湖北省': '420000',
  '湖南省': '430000',
  '广东省': '440000',
  '广西壮族自治区': '450000',
  '海南省': '460000',
  '重庆市': '500000',
  '四川省': '510000',
  '贵州省': '520000',
  '云南省': '530000',
  '西藏自治区': '540000',
  '陕西省': '610000',
  '甘肃省': '620000',
  '青海省': '630000',
  '宁夏回族自治区': '640000',
  '新疆维吾尔自治区': '650000',
  '台湾省': '710000',
  '香港特别行政区': '810000',
  '澳门特别行政区': '820000',
}

export default function FootprintMap({ cities, onProvinceClick }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const [provinceModal, setProvinceModal] = useState<{ name: string; visible: boolean }>({ name: '', visible: false })
  const provinceChartRef = useRef<HTMLDivElement>(null)
  const provinceChart = useRef<echarts.ECharts | null>(null)

  const zoomIn = () => {
    if (!chart.current) return
    const opt = chart.current.getOption() as any
    const currentZoom = opt?.series?.[0]?.zoom || 1
    chart.current.setOption({
      series: [{ zoom: Math.min(currentZoom * 1.3, 3) }],
    })
  }

  const zoomOut = () => {
    if (!chart.current) return
    const opt = chart.current.getOption() as any
    const currentZoom = opt?.series?.[0]?.zoom || 1
    chart.current.setOption({
      series: [{ zoom: Math.max(currentZoom / 1.3, 0.5) }],
    })
  }

  // 加载省份地图
  useEffect(() => {
    if (!provinceModal.visible || !provinceChartRef.current) {
      // Dialog 可能还没渲染完，延迟重试
      if (provinceModal.visible) {
        const timer = setTimeout(() => {
          if (provinceChartRef.current) {
            loadProvinceMap()
          }
        }, 100)
        return () => clearTimeout(timer)
      }
      return
    }
    loadProvinceMap()
  }, [provinceModal.visible, provinceModal.name, cities])

  const loadProvinceMap = async () => {
    const code = PROVINCE_TO_CODE[provinceModal.name]
    if (!code) {
      console.warn(`未找到省份 ${provinceModal.name} 的行政区划代码`)
      return
    }

    const provCities = cities.filter((c) => c.province === provinceModal.name)
    if (provCities.length === 0) {
      console.warn(`省份 ${provinceModal.name} 无城市数据`)
      return
    }

    // 获取该省所有城市名称（用于判断哪些已点亮）
    const litCityNames = new Set(provCities.map((c) => c.name))
    const mapKey = `province-${provinceModal.name}`
    
    // 省份 GeoJSON 从阿里云 DataV 获取（带容错处理）
    const provinceUrls = [
      `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`,
    ]
    
    let geoJson: any = null
    for (const url of provinceUrls) {
      try {
        const r = await fetch(url)
        if (r.ok) {
          geoJson = await r.json()
          break
        }
      } catch {}
    }
    
    if (!geoJson) {
      MessagePlugin.error(`无法加载 ${provinceModal.name} 地图数据，请稍后重试`)
      console.error(`所有省份数据源均失败`)
      return
    }
    
    console.log(`已加载 ${provinceModal.name} 地图 GeoJSON`, geoJson.features?.length, '个要素')
    echarts.registerMap(mapKey, geoJson)

    try {
      // 构建完整城市数据：已点亮的有 value，未点亮的 value 为 undefined
      const allCities: Array<{ name: string; value?: number }> = []
      const features = geoJson.features || []
      features.forEach((f: any) => {
        const cityName = f.properties?.name
        if (cityName && !allCities.find(c => c.name === cityName)) {
          if (litCityNames.has(cityName)) {
            const city = provCities.find(c => c.name === cityName)
            allCities.push({ name: cityName, value: city?.count || 0 })
          } else {
            allCities.push({ name: cityName })
          }
        }
      })
      // 补充 provCities 中有但 GeoJSON 中没有的城市
      provCities.forEach(c => {
        if (!allCities.find(ac => ac.name === c.name)) {
          allCities.push({ name: c.name, value: c.count })
        }
      })

      const maxVal = Math.max(...provCities.map((d: any) => d.count), 1)

      if (!provinceChart.current) {
        provinceChart.current = echarts.init(provinceChartRef.current!)
      }

      const option: echarts.EChartsOption = {
        title: {
          text: `${provinceModal.name} - 城市点亮`,
          left: 'center',
          textStyle: { fontSize: 16 },
        },
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const val = params.value ?? 0
            return `${params.name}<br/>${val > 0 ? `轨迹数：${val}` : '未点亮'}`
          },
        },
        visualMap: {
          min: 0,
          max: maxVal,
          left: 'left',
          bottom: '20',
          text: ['高', '低'],
          calculable: true,
          inRange: {
            color: ['#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
          },
        },
        series: [
          {
            type: 'map',
            map: mapKey,
            roam: true,
            scaleLimit: { min: 0.5, max: 3 },
            label: {
              show: true,
              fontSize: 8,
              color: '#333',
            },
            emphasis: {
              label: { show: true, fontSize: 10, color: '#fff' },
              itemStyle: { areaColor: '#ffd700' },
            },
            itemStyle: {
              areaColor: '#f0f0f0',
              borderColor: '#ccc',
            },
            data: (allCities as any[]).map((c: any) => {
              const isLit = typeof c.value === 'number' && c.value > 0
              return {
                ...c,
                itemStyle: isLit ? undefined : { areaColor: '#e8e8e8' },
                label: { color: isLit ? '#fff' : '#666' },
              }
            }),
          },
        ],
      }

      provinceChart.current.setOption(option, true)
      // 强制 resize 确保正确渲染
      setTimeout(() => provinceChart.current?.resize(), 50)
    } catch (e) {
      console.error(`加载${provinceModal.name}地图失败:`, e)
    }
  }

  useEffect(() => {
    if (!chartRef.current || !cities.length) return

    // 按省聚合
    const provMap = new Map<string, number>()
    cities.forEach((c) => {
      provMap.set(c.province, (provMap.get(c.province) || 0) + c.count)
    })

    const data = [...provMap.entries()].map(([name, value]) => ({ name, value }))
    const maxVal = Math.max(...data.map((d) => d.value), 1)

    if (!chart.current) {
      chart.current = echarts.init(chartRef.current)
    }

    // 从后端 API 获取中国地图 GeoJSON（与小程序同源）
    adminApi.getChinaMap()
      .then((geoJson) => {
        echarts.registerMap('china', geoJson)

        const option: echarts.EChartsOption = {
          tooltip: {
            trigger: 'item',
            formatter: (params: any) => `${params.name}<br/>轨迹数：${params.value ?? 0}`,
          },
          visualMap: {
            min: 0,
            max: maxVal,
            left: 'left',
            bottom: '20',
            text: ['高', '低'],
            calculable: true,
            inRange: {
              color: ['#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
            },
          },
          series: [
            {
              type: 'map',
              map: 'china',
              roam: true,
              scaleLimit: { min: 0.5, max: 3 },
              label: {
                show: false,
              },
              emphasis: {
                label: { show: true, fontSize: 10, color: '#333' },
                itemStyle: { areaColor: '#ffd700' },
              },
              select: {
                label: { show: true, fontSize: 10, color: '#333' },
                itemStyle: { areaColor: '#ff6b6b' },
              },
              data,
            },
          ],
        }

        chart.current!.setOption(option)

        // 点击省份
        chart.current!.on('click', (params: any) => {
          if (params.componentType === 'series' && params.seriesType === 'map') {
            setProvinceModal({ name: params.name, visible: true })
          }
        })
      })
      .catch((e) => {
        console.error('[FootprintMap] 加载中国地图失败:', e)
      })

    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [cities, onProvinceClick])

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div ref={chartRef} style={{ width: '100%', height: 400 }} />
        <div
          ref={controlsRef}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            zIndex: 10,
          }}
        >
          <Space direction="horizontal" size={4}>
            <Button shape="circle" size="small" icon={<Plus size={18} color="#333" />} onClick={zoomIn} style={{ background: '#e5e7eb', border: 'none' }} />
            <Button shape="circle" size="small" icon={<Minus size={18} color="#333" />} onClick={zoomOut} style={{ background: '#e5e7eb', border: 'none' }} />
          </Space>
        </div>
      </div>

      <Dialog
        header={provinceModal.name}
        visible={provinceModal.visible}
        onClose={() => {
          setProvinceModal({ name: '', visible: false })
          // 关闭时销毁省份图表
          provinceChart.current?.dispose()
          provinceChart.current = null
        }}
        width={700}
        destroyOnClose
      >
        <div ref={provinceChartRef} style={{ width: '100%', height: 450 }} />
      </Dialog>
    </>
  )
}
