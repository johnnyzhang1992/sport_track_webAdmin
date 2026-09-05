import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Dialog, Input, MessagePlugin } from 'tdesign-react'
import { MoonStars, Sun } from '@phosphor-icons/react'
import { getTheme, toggleTheme } from '../utils/theme'
import type { MenuValue } from 'tdesign-react'
import { clearToken, adminApi, getUsername } from '../api'

const { Header, Content, Aside } = Layout

const MENUS = [
  { value: '/dashboard', label: '数据概览' },
  { value: '/users', label: '用户管理' },
  { value: '/activities', label: '轨迹管理' },
]

export default function BasicLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pwdVisible, setPwdVisible] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [theme, setTheme] = useState(getTheme()) // 当前主题（按钮图标/文案用）

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    toggleTheme()
  }

  const handleMenu = (v: MenuValue) => navigate(String(v))

  const handleLogout = () => {
    clearToken()
    MessagePlugin.success('已退出登录')
    navigate('/login')
  }

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) {
      MessagePlugin.warning('请输入旧密码和新密码')
      return
    }
    if (newPwd.length < 6) {
      MessagePlugin.warning('新密码至少 6 位')
      return
    }
    setPwdLoading(true)
    try {
      await adminApi.changePassword(oldPwd, newPwd)
      MessagePlugin.success('密码修改成功')
      setPwdVisible(false)
      setOldPwd('')
      setNewPwd('')
    } catch (e) {
      MessagePlugin.error((e as Error).message || '修改失败')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Aside width="200px">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="brand"><span className="brand-logo">迹</span>管理后台</div>
          <Menu width={200} className="side-menu" value={'/' + (location.pathname.split('/')[1] || '')} onChange={handleMenu}>
            {MENUS.map((m) => (
              <Menu.MenuItem key={m.value} value={m.value}>
                {m.label}
              </Menu.MenuItem>
            ))}
          </Menu>
          <div className="aside-bottom">
            <button className="aside-theme-btn" onClick={handleToggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <MoonStars size={18} />}
              <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
            </button>
          </div>
        </div>
      </Aside>
      <Layout>
        <Header className="topbar">
          <span>运动轨迹小程序管理后台</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#0052d9,#2b6cf6)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
                {(getUsername() || 'A')[0].toUpperCase()}
              </span>
              <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary)' }}>{getUsername() || 'admin'}</span>
            </div>
            <span style={{ width: 1, height: 20, background: 'var(--td-component-stroke)' }} />
            <Button size="small" theme="primary" variant="text" onClick={() => setPwdVisible(true)}>修改密码</Button>
            <Button size="small" theme="danger" variant="text" onClick={handleLogout}>退出登录</Button>
          </div>
        </Header>
        <Content className="app-content" style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </Layout>

      <Dialog
        header="修改密码"
        visible={pwdVisible}
        onClose={() => setPwdVisible(false)}
        onConfirm={handleChangePwd}
        confirmBtn={{ content: '确认修改', loading: pwdLoading }}
        cancelBtn="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input type="password" placeholder="旧密码" value={oldPwd} onChange={(v: string) => setOldPwd(v)} />
          <Input type="password" placeholder="新密码（至少 6 位）" value={newPwd} onChange={(v: string) => setNewPwd(v)} />
        </div>
      </Dialog>
    </Layout>
  )
}
