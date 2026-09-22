import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogPlugin, Tag, Loading, MessagePlugin, Button } from 'tdesign-react'
import { adminApi, type FootprintRecordDetail } from '../api'

interface Props {
  id: string | null
  onClose: () => void
  /** 删除成功后回调（列表页据此刷新） */
  onDeleted?: () => void
}

/** 足迹详情弹窗（足迹管理页 / 用户详情页共用：自取数 + 照片九宫格 + 删除二次确认） */
export default function FootprintDetailDialog({ id, onClose, onDeleted }: Props) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState<FootprintRecordDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setDetail(null)
    adminApi
      .footprintDetail(id)
      .then(setDetail)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载足迹详情失败'))
      .finally(() => setLoading(false))
  }, [id])

  /** 硬删（库文档 + OSS 照片一起没），必须二次确认 */
  const confirmDelete = (row: FootprintRecordDetail) => {
    const dialog = DialogPlugin.confirm({
      header: '删除该足迹？',
      body: `${row.userNickname || '微信用户'} · ${row.visitDate} · ${row.title}\n删除后用户端同步消失，${row.photos.length} 张照片一并从 OSS 清除，不可恢复。`,
      confirmBtn: { content: '删除', theme: 'danger' },
      onConfirm: () => {
        adminApi
          .deleteFootprintRecord(row.id)
          .then(() => {
            MessagePlugin.success('已删除')
            dialog.destroy()
            onDeleted?.()
            onClose()
          })
          .catch((e) => MessagePlugin.error((e as Error).message || '删除失败'))
      },
    })
  }

  const items: { label: string; value: string }[] = detail
    ? [
        { label: '用户', value: detail.userNickname || '微信用户' },
        { label: 'UID', value: detail.userUid || '—' },
        { label: '到访日期', value: detail.visitDate },
        { label: '同行的人', value: detail.people.length ? detail.people.join('、') : '—' },
        { label: '省份', value: detail.location.province || '—' },
        { label: '城市', value: detail.location.city || '—' },
        { label: '地点', value: detail.location.name || '—' },
        { label: '详细地址', value: detail.location.address || '—' },
        { label: '经纬度', value: `${detail.location.latitude}, ${detail.location.longitude}` },
        { label: '记录时间', value: new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false }) },
      ]
    : []

  return (
    <Dialog
      header={detail ? `足迹详情 · ${detail.title}` : '足迹详情'}
      visible={!!id}
      width={720}
      onClose={onClose}
      destroyOnClose
      confirmBtn={
        detail
          ? { content: '删除该足迹', theme: 'danger', onClick: () => confirmDelete(detail) }
          : undefined
      }
      cancelBtn={{ content: '关闭', variant: 'outline', onClick: onClose }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loading />
        </div>
      ) : detail ? (
        <div style={{ maxHeight: 'calc(80vh - 160px)', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag theme="primary" variant="light">
              {detail.visitDate}
            </Tag>
            <span style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>足迹 ID：{detail.id}</span>
            <Button
              size="small"
              theme="primary"
              variant="text"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate(`/users/${detail.userId}`)}
            >
              查看该用户
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px 16px',
              background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}
          >
            {items.map((it) => (
              <div key={it.label}>
                <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginBottom: 2 }}>{it.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{it.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>描述</div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
                borderRadius: 8,
                padding: '10px 12px',
                color: detail.description ? 'var(--td-text-color-primary, #1f2329)' : 'var(--td-text-color-placeholder, #8a93a6)',
              }}
            >
              {detail.description || '（无描述）'}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>照片（{detail.photos.length}）</div>
            {detail.photos.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {detail.photos.map((p, i) => (
                  <a key={p} href={p} target="_blank" rel="noreferrer">
                    <img
                      src={p}
                      alt={`足迹照片 ${i + 1}`}
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid var(--td-component-stroke, #eef0f3)',
                        display: 'block',
                      }}
                    />
                  </a>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: 'var(--td-text-color-placeholder, #8a93a6)',
                  fontSize: 13,
                  background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
                  borderRadius: 8,
                }}
              >
                该足迹没有照片
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 8 }}>
              照片链接为临时签名地址（24 小时有效），点开可看原图
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
