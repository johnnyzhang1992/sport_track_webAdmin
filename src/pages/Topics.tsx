import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  DialogPlugin,
  Input,
  Switch,
  Table,
  Tag,
  DatePicker,
  Textarea,
  MessagePlugin,
} from 'tdesign-react'
import { adminApi, uploadTopicImage, type TopicItem } from '../api'

/**
 * 专题管理（官方信息页）：markdown 正文 + 图片上传 + 生效窗口（生效时间/过期时间）
 * 小程序首页展示生效中的专题入口，过期自动消失
 */

type TopicForm = {
  id?: string
  title: string
  coverUrl: string
  content: string
  published: boolean
  effectiveAt: number
  expiresAt: number | null
}

const EMPTY_FORM: TopicForm = {
  title: '',
  coverUrl: '',
  content: '',
  published: false,
  effectiveAt: Date.now(),
  expiresAt: null,
}

function fmtTime(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 专题状态：未发布 / 未生效 / 生效中 / 已过期 */
function topicStatus(t: TopicItem): { label: string; theme: 'default' | 'warning' | 'success' | 'danger' } {
  if (!t.published) return { label: '未发布', theme: 'default' }
  const now = Date.now()
  if (t.effectiveAt > now) return { label: '未生效', theme: 'warning' }
  if (t.expiresAt != null && t.expiresAt <= now) return { label: '已过期', theme: 'danger' }
  return { label: '生效中', theme: 'success' }
}

/** 极简 markdown 预览（与管理端编辑所见大致一致；完整渲染在小程序端） */
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const inline = (s: string) =>
    esc(s)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img src="$2" style="max-width:100%;border-radius:6px;margin:6px 0;" />')
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<span style="color:#2b6cf6">$1</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:#f2f3f5;padding:1px 5px;border-radius:4px;">$1</code>')
  return md
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim()
      if (!t) return ''
      const h = t.match(/^(#{1,4})\s+(.*)$/)
      if (h) {
        const size = [22, 19, 17, 15][h[1].length - 1]
        return `<h${h[1].length} style="font-size:${size}px;margin:10px 0 6px;">${inline(h[2])}</h${h[1].length}>`
      }
      if (/^(-{3,}|\*{3,})$/.test(t)) return '<hr style="border:none;border-top:1px solid #e5e6eb;margin:12px 0;" />'
      if (t.startsWith('> ')) return `<blockquote style="border-left:3px solid #d8dee9;margin:6px 0;padding:4px 12px;color:#8a93a6;">${inline(t.slice(2))}</blockquote>`
      if (/^[-*]\s+/.test(t)) return `<div style="padding-left:16px;">• ${inline(t.replace(/^[-*]\s+/, ''))}</div>`
      return `<p style="margin:6px 0;line-height:1.7;">${inline(t)}</p>`
    })
    .join('')
}

export default function Topics() {
  const [items, setItems] = useState<TopicItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<TopicForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState<'cover' | 'content' | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const contentInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await adminApi.topics())
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => setForm({ ...EMPTY_FORM, effectiveAt: Date.now() })
  const openEdit = (row: TopicItem) =>
    setForm({
      id: row.id,
      title: row.title,
      coverUrl: row.coverUrl,
      content: row.content,
      published: row.published,
      effectiveAt: row.effectiveAt,
      expiresAt: row.expiresAt,
    })

  const save = async () => {
    if (!form) return
    if (!form.title.trim()) {
      MessagePlugin.warning('请填写标题')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        await adminApi.updateTopic(form.id, form)
        MessagePlugin.success('已保存')
      } else {
        await adminApi.createTopic(form)
        MessagePlugin.success('已创建')
      }
      setForm(null)
      load()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = (row: TopicItem) => {
    const dialog = DialogPlugin.confirm({
      header: '删除专题',
      body: `确定删除「${row.title}」吗？删除后立即生效且不可恢复`,
      confirmBtn: { content: '删除', theme: 'danger' },
      onConfirm: async () => {
        try {
          await adminApi.deleteTopic(row.id)
          MessagePlugin.success('已删除')
          dialog.destroy()
          load()
        } catch (e) {
          MessagePlugin.error((e as Error).message)
        }
      },
    })
  }

  const upload = async (file: File | undefined, target: 'cover' | 'content') => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      MessagePlugin.warning('图片不能超过 2MB')
      return
    }
    setUploading(target)
    try {
      const { url } = await uploadTopicImage(file)
      setForm((f) => {
        if (!f) return f
        if (target === 'cover') return { ...f, coverUrl: url }
        return { ...f, content: `${f.content}\n\n![${file.name}](${url})` }
      })
      MessagePlugin.success('已上传')
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setUploading(null)
    }
  }

  const columns = [
    {
      colKey: 'title',
      title: '标题',
      cell: ({ row }: { row: TopicItem }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {row.coverUrl ? (
            <img src={row.coverUrl} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f2f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎉</div>
          )}
          <span style={{ fontWeight: 600 }}>{row.title}</span>
        </div>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 100,
      cell: ({ row }: { row: TopicItem }) => {
        const s = topicStatus(row)
        return <Tag theme={s.theme}>{s.label}</Tag>
      },
    },
    { colKey: 'effectiveAt', title: '生效时间', width: 160, cell: ({ row }: { row: TopicItem }) => fmtTime(row.effectiveAt) },
    { colKey: 'expiresAt', title: '过期时间', width: 160, cell: ({ row }: { row: TopicItem }) => fmtTime(row.expiresAt) },
    { colKey: 'updatedAt', title: '更新时间', width: 160, cell: ({ row }: { row: TopicItem }) => fmtTime(row.updatedAt) },
    {
      colKey: 'op',
      title: '操作',
      width: 130,
      cell: ({ row }: { row: TopicItem }) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="text" theme="primary" size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button variant="text" theme="danger" size="small" onClick={() => remove(row)}>
            删除
          </Button>
        </div>
      ),
    },
  ]

  return (
    <Card title="专题管理" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#8a93a6', fontSize: 13 }}>
          生效中的专题展示在小程序首页；过期后自动消失。正文支持 Markdown，图片上传后插入正文。
        </span>
        <Button theme="primary" onClick={openCreate}>
          新建专题
        </Button>
      </div>
      <Table rowKey="id" columns={columns} data={items} loading={loading} size="medium" />

      <Dialog
        header={form?.id ? '编辑专题' : '新建专题'}
        visible={form != null}
        width={720}
        confirmBtn={{ content: '保存', theme: 'primary', loading: saving }}
        onCancel={() => setForm(null)}
        onClose={() => setForm(null)}
        onConfirm={save}
      >
        {form && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 76, textAlign: 'right', color: '#4e5969' }}>标题</span>
              <Input
                value={form.title}
                maxlength={60}
                style={{ flex: 1 }}
                onChange={(v) => setForm({ ...form, title: v as string })}
                placeholder="如：用户量突破 1000！"
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Switch value={form.published} onChange={(v) => setForm({ ...form, published: v as boolean })} />
                <span style={{ color: '#4e5969' }}>发布</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 76, textAlign: 'right', color: '#4e5969' }}>生效时间</span>
              <DatePicker
                valueType="time-stamp"
                enableTimePicker
                clearable={false}
                style={{ width: 220 }}
                value={form.effectiveAt}
                onChange={(v) => {
                  const ts = Number(v)
                  setForm({ ...form, effectiveAt: ts < 1e12 ? ts * 1000 : ts })
                }}
              />
              <span style={{ color: '#4e5969' }}>过期时间</span>
              <DatePicker
                valueType="time-stamp"
                enableTimePicker
                clearable
                style={{ width: 220 }}
                value={form.expiresAt ?? undefined}
                onChange={(v) => {
                  if (v == null) {
                    setForm({ ...form, expiresAt: null })
                    return
                  }
                  const ts = Number(v)
                  setForm({ ...form, expiresAt: ts < 1e12 ? ts * 1000 : ts })
                }}
              />
              <span style={{ color: '#8a93a6', fontSize: 12 }}>留空=长期有效</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 76, textAlign: 'right', color: '#4e5969', paddingTop: 4 }}>正文</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" variant="outline" loading={uploading === 'content'} onClick={() => contentInputRef.current?.click()}>
                    插入图片
                  </Button>
                  <Button size="small" variant="outline" loading={uploading === 'cover'} onClick={() => coverInputRef.current?.click()}>
                    {form.coverUrl ? '更换封面' : '上传封面'}
                  </Button>
                  {form.coverUrl && <img src={form.coverUrl} style={{ height: 32, borderRadius: 4 }} />}
                  <Button size="small" variant="text" onClick={() => setPreview(!preview)}>
                    {preview ? '编辑' : '预览'}
                  </Button>
                </div>
                {preview ? (
                  <div
                    style={{
                      border: '1px solid var(--td-component-border, #e7e7e7)',
                      borderRadius: 6,
                      minHeight: 220,
                      maxHeight: 420,
                      overflow: 'auto',
                      padding: '8px 12px',
                    }}
                    dangerouslySetInnerHTML={{ __html: mdToHtml(form.content) }}
                  />
                ) : (
                  <Textarea
                    value={form.content}
                    autosize={{ minRows: 10, maxRows: 18 }}
                    placeholder={'支持 Markdown：# 标题、**加粗**、- 列表、![图片](url)…'}
                    onChange={(v) => setForm({ ...form, content: v as string })}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* 隐藏的文件选择框 */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          upload(e.target.files?.[0], 'cover')
          e.target.value = ''
        }}
      />
      <input
        ref={contentInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          upload(e.target.files?.[0], 'content')
          e.target.value = ''
        }}
      />
    </Card>
  )
}
