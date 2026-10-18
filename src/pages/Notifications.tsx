import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  DialogPlugin,
  Input,
  MessagePlugin,
  Switch,
  Table,
  Tag,
  Textarea,
} from 'tdesign-react'
import { adminApi, type NotificationItem } from '../api'

/**
 * 系统通知管理：纯文本标题 + 正文（保留换行）+ 发布开关。
 * 发布后小程序首页出现单行入口；未发布仅后台可见。
 */

type NotificationForm = {
  id?: string
  title: string
  content: string
  published: boolean
}

const EMPTY_FORM: NotificationForm = { title: '', content: '', published: false }

function fmtTime(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<NotificationForm | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await adminApi.notifications())
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => setForm({ ...EMPTY_FORM })
  const openEdit = (row: NotificationItem) =>
    setForm({ id: row.id, title: row.title, content: row.content, published: row.published })

  const save = async () => {
    if (!form) return
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title) {
      MessagePlugin.warning('请填写标题')
      return
    }
    if (title.length > 60) {
      MessagePlugin.warning('标题不能超过 60 字')
      return
    }
    if (!content) {
      MessagePlugin.warning('请填写正文')
      return
    }
    if (content.length > 5000) {
      MessagePlugin.warning('正文不能超过 5000 字')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        await adminApi.updateNotification(form.id, { title, content, published: form.published })
        MessagePlugin.success('已保存')
      } else {
        await adminApi.createNotification({ ...form, title, content })
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

  const remove = (row: NotificationItem) => {
    const dialog = DialogPlugin.confirm({
      header: '删除通知',
      body: `确定删除「${row.title}」吗？删除后立即生效且不可恢复`,
      confirmBtn: { content: '删除', theme: 'danger' },
      onCancel: () => dialog.destroy(),
      onClose: () => dialog.destroy(),
      onConfirm: async () => {
        try {
          await adminApi.deleteNotification(row.id)
          MessagePlugin.success('已删除')
          dialog.destroy()
          load()
        } catch (e) {
          MessagePlugin.error((e as Error).message)
        }
      },
    })
  }

  const columns = [
    {
      colKey: 'title',
      title: '标题',
      cell: ({ row }: { row: NotificationItem }) => (
        <span style={{ fontWeight: 600 }}>{row.title}</span>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 100,
      cell: ({ row }: { row: NotificationItem }) => (
        <Tag theme={row.published ? 'success' : 'default'}>
          {row.published ? '已发布' : '未发布'}
        </Tag>
      ),
    },
    {
      colKey: 'publishedAt',
      title: '发布时间',
      width: 160,
      cell: ({ row }: { row: NotificationItem }) => fmtTime(row.publishedAt),
    },
    {
      colKey: 'updatedAt',
      title: '更新时间',
      width: 160,
      cell: ({ row }: { row: NotificationItem }) => fmtTime(row.updatedAt),
    },
    {
      colKey: 'op',
      title: '操作',
      width: 130,
      cell: ({ row }: { row: NotificationItem }) => (
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
    <Card title="系统通知" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#8a93a6', fontSize: 13 }}>
          发布后展示在小程序首页顶部；用户打开详情即记已读。正文为纯文本，换行会原样保留。
        </span>
        <Button theme="primary" onClick={openCreate}>
          新建通知
        </Button>
      </div>
      <Table rowKey="id" columns={columns} data={items} loading={loading} size="medium" />

      <Dialog
        header={form?.id ? '编辑通知' : '新建通知'}
        visible={form != null}
        width={640}
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
                placeholder="如：系统维护通知"
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Switch
                  value={form.published}
                  onChange={(v) => setForm({ ...form, published: v as boolean })}
                />
                <span style={{ color: '#4e5969' }}>发布</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 76, textAlign: 'right', color: '#4e5969', paddingTop: 8 }}>正文</span>
              <div style={{ flex: 1 }}>
                <Textarea
                  value={form.content}
                  maxlength={5000}
                  autosize={{ minRows: 8, maxRows: 16 }}
                  onChange={(v) => setForm({ ...form, content: v as string })}
                  placeholder="纯文本，支持换行"
                />
                <div style={{ color: '#8a93a6', fontSize: 12, marginTop: 4 }}>
                  {form.content.length} / 5000
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
