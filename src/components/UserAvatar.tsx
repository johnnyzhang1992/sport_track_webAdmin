/**
 * 用户头像（管理端共用）：有头像用服务端下发的签名链，没头像用蓝渐变首字占位。
 * 用户列表与用户详情页共用，避免同一形态在两页各写一遍。
 */
export default function UserAvatar({ url, name, size }: { url?: string; name?: string; size: number }) {
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0 }
  if (url) return <img src={url} alt="头像" style={{ ...base, objectFit: 'cover' }} />
  return (
    <div
      style={{
        ...base,
        background: 'linear-gradient(135deg,#0052d9,#2b6cf6)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {(name || 'U')[0].toUpperCase()}
    </div>
  )
}
