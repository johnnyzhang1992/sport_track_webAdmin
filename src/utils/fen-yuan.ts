/**
 * 分 ↔ 元。虚拟支付目录价在库里是「分」、在 MP 后台是「元」，两边必须一致（spec §2.4）。
 * 这不是展示格式化器（展示走 utils/format.ts），而是**换算器**：
 * 输入可能是运营手打的 "1.99"、"1.9"，输出必须是精确整数分——
 * 用浮点乘 100 会把 1.005 变成 100.49999…，所以按字符串拆位算。
 */
export function yuanToFen(text: string | number | null | undefined): number | null {
  const s = String(text ?? '').trim()
  if (!s) return null
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return null // 三位小数、负数、非数字一律拒（提示里要点名实际收到的值）
  const whole = Number(m[1])
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0
  if (!Number.isFinite(whole) || whole > 10000) return null
  return whole * 100 + frac
}

export function fenToYuan(fen: number): string {
  const n = Number(fen)
  if (!Number.isFinite(n) || n < 0) return ''
  const yuan = Math.floor(n / 100)
  const rest = n % 100
  return rest === 0 ? String(yuan) : `${yuan}.${String(rest).padStart(2, '0')}`
}
