/**
 * 足迹分类的中文名：key 与后端 src/utils/footprint-category.ts、小程序 config 一致。
 * 三处各自持有一份是刻意的——分类是代码内枚举（图标要打进小程序包），不是后台可配数据；
 * 加/改分类时这三处一起改，漏一处表现为「未知分类」而不是报错。
 */
export const FOOTPRINT_CATEGORY_LABELS: Record<string, string> = {
  scenic: '景区',
  mountain: '山峰',
  park: '公园绿地',
  heritage: '古迹寺庙',
  museum: '博物馆展馆',
  street: '商圈街区',
  food: '餐饮咖啡',
  camp: '露营户外',
  other: '其他',
}

export function footprintCategoryLabel(key?: string): string {
  if (!key) return ''
  return FOOTPRINT_CATEGORY_LABELS[key] ?? `未知(${key})`
}
