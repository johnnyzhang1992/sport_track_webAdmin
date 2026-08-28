import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Input, Button, Card, MessagePlugin } from 'tdesign-react'
import BasicLayout from './components/BasicLayout'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Activities from './pages/Activities'
import { getToken, setToken, saveUsername, adminApi } from './api'

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')

  const handleLogin = async () => {
    if (!username || !password) {
      MessagePlugin.warning('请输入用户名和密码')
      return
    }
    setLoading(true)
    try {
      const { token } = await adminApi.login(username, password)
      setToken(token)
      saveUsername(username)
      MessagePlugin.success('登录成功')
      // 回跳跳转前页面；仅允许站内路径（防 open redirect）
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        navigate(redirect, { replace: true })
      } else {
        navigate('/dashboard')
      }
    } catch (e) {
      MessagePlugin.error((e as Error).message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-title" style={{ fontSize: 20, fontWeight: 700, color: '#0052d9' }}>小迹一下 · 管理后台</div>
        <div className="login-sub">{redirect ? '登录已过期，请重新登录' : '运动轨迹小程序数据管理'}</div>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="管理员用户名"
            value={username}
            onChange={(v) => setUsername(v)}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <Input
            type="password"
            placeholder="管理员密码"
            value={password}
            onChange={(v) => setPassword(v)}
            onEnter={handleLogin}
          />
        </div>
        <Button block theme="primary" loading={loading} onClick={handleLogin}>登 录</Button>
      </Card>
    </div>
  )
}

/** 路由守卫：未登录跳登录页 */
function Guard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    setAuthed(!!getToken())
    setReady(true)
  }, [])
  if (!ready) return null
  return authed ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Guard>
            <BasicLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/:id" element={<UserDetail />} />
                <Route path="/activities" element={<Activities />} />
              </Routes>
            </BasicLayout>
          </Guard>
        }
      />
    </Routes>
  )
}
