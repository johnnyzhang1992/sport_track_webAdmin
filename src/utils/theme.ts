/**
 * 管理后台深/浅色主题（TDesign theme-mode + localStorage 持久化）
 * 切换时派发 window 'theme-change' 事件，图表监听后重绘
 */
export type ThemeMode = 'light' | 'dark'

const KEY = 'admin_theme'

export function getTheme(): ThemeMode {
  const v = localStorage.getItem(KEY)
  return v === 'dark' ? 'dark' : 'light'
}

/** 应用主题到 <html theme-mode>（TDesign 组件按该属性切换 CSS 变量） */
export function applyTheme(mode: ThemeMode) {
  localStorage.setItem(KEY, mode)
  if (mode === 'dark') document.documentElement.setAttribute('theme-mode', 'dark')
  else document.documentElement.removeAttribute('theme-mode')
  window.dispatchEvent(new CustomEvent('theme-change', { detail: mode }))
}

export function initTheme() {
  applyTheme(getTheme())
}

export function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark')
}

export function isDark() {
  return getTheme() === 'dark'
}

/** 监听主题切换（返回解绑函数）；图表 effect 里配合重绘 */
export function onThemeChange(cb: () => void) {
  window.addEventListener('theme-change', cb)
  return () => window.removeEventListener('theme-change', cb)
}

/** ECharts 文本/轴线颜色（按当前主题） */
export function chartColors() {
  const dark = isDark()
  return {
    text: dark ? '#b8c2d1' : '#4e5969',
    textStrong: dark ? '#e7ecf3' : '#1f2329',
    muted: dark ? '#7a8499' : '#8a93a6',
    axisLine: dark ? '#3a4353' : '#d9dee6',
    splitLine: dark ? '#333c4c' : '#e8ebf0',
    legendText: dark ? '#b8c2d1' : '#4e5969',
  }
}
