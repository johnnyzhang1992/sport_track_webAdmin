import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  DialogPlugin,
  Input,
  InputNumber,
  MessagePlugin,
  Switch,
  Table,
  Tag,
  type PrimaryTableCol,
} from 'tdesign-react'
import { adminApi, type AdSlotRow } from '../api'

/**
 * 广告管理：目前只支持模板广告（小程序原生模板 `<ad-custom>`）。
 *
 * - key 是小程序代码里引用广告位的稳定标识（`<ad-template adslot="home_bottom" />`），创建后不可改；
 * - unitId 是流量主后台的广告单元 id，换广告单元不需要发版；
 * - 在架开关直接控制端上是否展示；免广告卡生效时端上同样不展示（任一不满足就不展示）。
 */

type AdSlotForm = {
  id?: string
  key: string
  name: string
  unitId: string
  active: boolean
  sortOrder: number
}

const EMPTY_FORM: AdSlotForm = { key: '', name: '', unitId: '', active: true, sortOrder: 0 }

const KEY_RE = /^[a-z][a-z0-9_]{1,31}$/
const UNIT_RE = /^adunit-[0-9a-z]{8,32}$/

function fmtTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Ads() {
  const [items, setItems] = useState<AdSlotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<AdSlotForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await adminApi.adSlots())
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
  const openEdit = (row: AdSlotRow) =>
    setForm({ id: row.id, key: row.key, name: row.name, unitId: row.unitId, active: row.active, sortOrder: row.sortOrder })

  const copy = (text: string) => {
    if (!navigator.clipboard) {
      MessagePlugin.warning('当前环境不支持剪贴板')
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => MessagePlugin.success('已复制'))
      .catch((e) => MessagePlugin.error((e as Error).message))
  }

  const save = async () => {
    if (!form) return
    const key = form.key.trim()
    const name = form.name.trim()
    const unitId = form.unitId.trim()
    if (!KEY_RE.test(key)) {
      MessagePlugin.warning('key 需小写字母开头，只含小写字母/数字/下划线，2–32 位')
      return
    }
    if (!name || name.length > 20) {
      MessagePlugin.warning('名称需 1–20 字')
      return
    }
    if (!UNIT_RE.test(unitId)) {
      MessagePlugin.warning('广告单元 ID 应形如 adunit-xxxx（流量主后台复制）')
      return
    }
    if (!Number.isInteger(form.sortOrder)) {
      MessagePlugin.warning('排序必须是整数')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        await adminApi.updateAdSlot(form.id, { key, name, unitId, active: form.active, sortOrder: form.sortOrder })
        MessagePlugin.success('已保存')
      } else {
        await adminApi.createAdSlot({ key, name, unitId, active: form.active, sortOrder: form.sortOrder })
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

  const toggleActive = async (row: AdSlotRow, next: boolean) => {
    setToggling(row.id)
    try {
      await adminApi.updateAdSlot(row.id, {
        key: row.key,
        name: row.name,
        unitId: row.unitId,
        active: next,
        sortOrder: row.sortOrder,
      })
      MessagePlugin.success(next ? '已上架' : '已下架')
      load()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setToggling(null)
    }
  }

  const remove = (row: AdSlotRow) => {
    const dialog = DialogPlugin.confirm({
      header: '删除广告位',
      body: `确定删除「${row.name}」（${row.key}）吗？删除后端上不再展示该广告位，且不可恢复`,
      confirmBtn: { content: '删除', theme: 'danger' },
      onCancel: () => dialog.destroy(),
      onClose: () => dialog.destroy(),
      onConfirm: async () => {
        try {
          await adminApi.deleteAdSlot(row.id)
          MessagePlugin.success('已删除')
          dialog.destroy()
          load()
        } catch (e) {
          MessagePlugin.error((e as Error).message)
        }
      },
    })
  }

  const columns: PrimaryTableCol<AdSlotRow>[] = [
    {
      colKey: 'name',
      title: '名称',
      width: 160,
      cell: ({ row }: { row: AdSlotRow }) => <span style={{ fontWeight: 600 }}>{row.name}</span>,
    },
    {
      colKey: 'key',
      title: 'key',
      width: 160,
      cell: ({ row }: { row: AdSlotRow }) => (
        <span
          title="点击复制"
          onClick={() => copy(row.key)}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursor: 'pointer' }}
        >
          {row.key}
        </span>
      ),
    },
    {
      colKey: 'unitId',
      title: '广告单元 ID',
      ellipsis: true,
      cell: ({ row }: { row: AdSlotRow }) => (
        <span
          title="点击复制"
          onClick={() => copy(row.unitId)}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursor: 'pointer' }}
        >
          {row.unitId}
        </span>
      ),
    },
    {
      colKey: 'kind',
      title: '类型',
      width: 90,
      cell: () => <Tag theme="default" variant="light">模板广告</Tag>,
    },
    {
      colKey: 'active',
      title: '状态',
      width: 120,
      cell: ({ row }: { row: AdSlotRow }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Switch
            value={row.active}
            loading={toggling === row.id}
            onChange={(v) => toggleActive(row, Boolean(v))}
          />
          <span style={{ fontSize: 12, color: row.active ? '#00a870' : '#8a93a6' }}>
            {row.active ? '在架' : '已下架'}
          </span>
        </span>
      ),
    },
    { colKey: 'sortOrder', title: '排序', width: 70, align: 'right' },
    {
      colKey: 'updatedAt',
      title: '更新时间',
      width: 150,
      cell: ({ row }: { row: AdSlotRow }) => fmtTime(row.updatedAt),
    },
    {
      colKey: 'op',
      title: '操作',
      width: 130,
      cell: ({ row }: { row: AdSlotRow }) => (
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
    <Card title="广告管理" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#8a93a6', fontSize: 13 }}>
          目前只支持模板广告：key 供小程序 `&lt;ad-template adslot="key" /&gt;` 引用（创建后不可改），
          unit-id 从流量主后台复制。关掉开关或用户持有免广告卡时，端上都不展示。
        </span>
        <Button theme="primary" onClick={openCreate}>
          新建广告位
        </Button>
      </div>
      <Table rowKey="id" columns={columns} data={items} loading={loading} size="medium" />

      <Dialog
        header={form?.id ? '编辑广告位' : '新建广告位'}
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
              <span style={{ width: 96, textAlign: 'right', color: '#4e5969' }}>key</span>
              <Input
                value={form.key}
                disabled={!!form.id}
                style={{ flex: 1 }}
                onChange={(v) => setForm({ ...form, key: v as string })}
                placeholder="如 home_bottom"
              />
              {form.id && <span style={{ fontSize: 12, color: '#8a93a6', flexShrink: 0 }}>创建后不可修改</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, textAlign: 'right', color: '#4e5969' }}>名称</span>
              <Input
                value={form.name}
                maxlength={20}
                style={{ flex: 1 }}
                onChange={(v) => setForm({ ...form, name: v as string })}
                placeholder="后台展示用，如：首页底部"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, textAlign: 'right', color: '#4e5969' }}>广告单元 ID</span>
              <Input
                value={form.unitId}
                style={{ flex: 1 }}
                onChange={(v) => setForm({ ...form, unitId: v as string })}
                placeholder="adunit-xxxxxxxxxxxxxxxx"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 96, textAlign: 'right', color: '#4e5969' }}>排序</span>
              <InputNumber
                value={form.sortOrder}
                step={1}
                style={{ width: 120 }}
                onChange={(v) =>
                  setForm({
                    ...form,
                    sortOrder: typeof v === 'number' && Number.isFinite(v) ? v : form.sortOrder,
                  })
                }
              />
              <span style={{ fontSize: 12, color: '#8a93a6' }}>数字小的排在前面</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                <Switch value={form.active} onChange={(v) => setForm({ ...form, active: Boolean(v) })} />
                <span style={{ fontSize: 13, color: '#4e5969' }}>在架</span>
              </span>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
