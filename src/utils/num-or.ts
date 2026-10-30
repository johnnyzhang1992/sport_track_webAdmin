/** 清空输入框给的是 ''，而 Number('') === 0 —— 这些字段里 0 表示「不限」，把清空折成 0 等于静默放开限额，所以空值必须回落 fallback。 */
export function numOr(v: number | string | null | undefined, fallback: number): number {
  if (v === '' || v == null) return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}
