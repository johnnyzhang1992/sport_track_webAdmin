/** 轨迹打点里的照片：photos 优先，老数据只有 photoUrl 时回落成单图 */
export function flattenMarkerPhotos(
  markers: Array<{ photoUrl?: string; photos?: string[] }> | undefined,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of markers ?? []) {
    const urls = m.photos && m.photos.length ? m.photos : m.photoUrl ? [m.photoUrl] : []
    for (const p of urls) {
      // 同一张图会以 photoUrl / photos[0] 两份记录存在，跨打点也可能重复挂 → 按裸链去重
      const bare = p.split('?')[0]
      if (!bare || seen.has(bare)) continue
      seen.add(bare)
      out.push(p)
    }
  }
  return out
}
