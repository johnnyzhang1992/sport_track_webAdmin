import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  Input,
  InputNumber,
  MessagePlugin,
  Switch,
  Table,
  Tag,
} from 'tdesign-react'
import { adminApi, type MemberSwitchState, type PaidProductRow } from '../api'
import { fenToYuan, yuanToFen } from '../utils/fen-yuan'

const PERK_LABELS: Array<[keyof PaidProductRow['perks'], string]> = [
  ['adFree', '免广告'],
  ['exportBundle', '打包导出 GPX'],
  ['photoQuota', '照片额度'],
  ['subscribeNotice', '订阅提醒'],
]

const perksText = (p: PaidProductRow['perks']) =>
  PERK_LABELS.map(([k, label]) => (k === 'photoQuota' ? `${label} ${p.photoQuota} 张` : p[k] ? label : '')).filter(Boolean).join(' · ')

interface FormState {
  id: string | null
  key: string
  name: string
  subtitle: string
  priceYuan: string
  durationDays: number
  adFree: boolean
  exportBundle: boolean
  photoQuota: number
  subscribeNotice: boolean
  sortOrder: number
  notes: string
  synced: boolean
}

const emptyForm = (): FormState => ({
  id: null, key: '', name: '', subtitle: '', priceYuan: '', durationDays: 30,
  adFree: true, exportBundle: true, photoQuota: 300, subscribeNotice: true,
  sortOrder: 0, notes: '', synced: false,
})

const formOf = (r: PaidProductRow): FormState => ({
  id: r.id, key: r.key, name: r.name, subtitle: r.subtitle,
  priceYuan: r.priceYuanText, durationDays: r.durationDays,
  adFree: r.perks.adFree, exportBundle: r.perks.exportBundle,
  photoQuota: r.perks.photoQuota, subscribeNotice: r.perks.subscribeNotice,
  sortOrder: r.sortOrder, notes: r.notes.join('\n'), synced: false,
})

/**
 * 会员商品（现金目录）：开关 + 三档商品 CRUD。
 * 价格在库里是「分」、在 MP 后台是「元」——改价必须两边同步，所以保存前强制勾选确认（spec §5.1）。
 */
export default function PaidProducts() {
  const [sw, setSw] = useState<MemberSwitchState | null>(null)
  const [rows, setRows] = useState<PaidProductRow[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, list] = await Promise.all([adminApi.memberSwitch(), adminApi.xpayProducts()])
      setSw(s)
      setRows(list)
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleSwitch = async (on: boolean) => {
    try {
      const next = await adminApi.setMemberSwitch(on)
      setSw(next)
      MessagePlugin.success(on ? '会员购买已开启' : '会员购买已关闭')
      if (next.hint) MessagePlugin.warning(next.hint)
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    }
  }

  const submit = async () => {
    if (!form) return
    const priceFen = yuanToFen(form.priceYuan)
    if (priceFen === null) {
      setError(`金额格式不对（收到 "${form.priceYuan}"，最多两位小数，如 1.99）`)
      return
    }
    if (!form.name.trim()) { setError('名称不能为空'); return }
    if (form.id === null && !form.key.trim()) { setError('道具 ID 不能为空'); return }
    if (!form.synced) { setError(`请先确认 MP 后台道具价已同步为 ${fenToYuan(priceFen)} 元`); return }
    setSaving(true)
    setError('')
    try {
      const perks = {
        adFree: form.adFree,
        exportBundle: form.exportBundle,
        photoQuota: form.photoQuota,
        subscribeNotice: form.subscribeNotice,
      }
      if (form.id) {
        await adminApi.updateXpayProduct(form.id, {
          name: form.name, subtitle: form.subtitle, priceFen, durationDays: form.durationDays, perks,
        })
        await adminApi.setXpayProductSort(form.id, form.sortOrder)
      } else {
        await adminApi.createXpayProduct({
          key: form.key, name: form.name, subtitle: form.subtitle, priceFen,
          durationDays: form.durationDays, perks, sortOrder: form.sortOrder,
          notes: form.notes.split('\n').map((s) => s.trim()).filter(Boolean),
        })
      }
      MessagePlugin.success('已保存')
      setForm(null)
      await load()
    } catch (e) {
      setError((e as Error).message) // 服务端整句中文留在弹窗里，关掉前能看清原因
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { colKey: 'name', title: '名称', width: 160 },
    { colKey: 'key', title: '道具 ID', width: 140 },
    {
      colKey: 'priceFen', title: '价格（元）', width: 120,
      cell: ({ row }: { row: PaidProductRow }) => <span>{fenToYuan(row.priceFen)} 元</span>,
    },
    { colKey: 'durationDays', title: '天数', width: 90 },
    {
      colKey: 'perks', title: '权益', width: 280,
      cell: ({ row }: { row: PaidProductRow }) => <span style={{ color: '#5b6474' }}>{perksText(row.perks)}</span>,
    },
    {
      colKey: 'active', title: '上架', width: 90,
      cell: ({ row }: { row: PaidProductRow }) => (
        <Tag theme={row.active ? 'success' : 'default'} variant="light">{row.active ? '在售' : '下架'}</Tag>
      ),
    },
    { colKey: 'sortOrder', title: '排序', width: 80 },
    {
      colKey: 'op', title: '操作', width: 200,
      cell: ({ row }: { row: PaidProductRow }) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="text" size="small" onClick={() => setForm(formOf(row))}>编辑</Button>
          <Button
            variant="text"
            size="small"
            onClick={async () => {
              try {
                await adminApi.setXpayProductActive(row.id, !row.active)
                MessagePlugin.success(row.active ? '已下架' : '已上架')
                await load()
              } catch (e) {
                MessagePlugin.error((e as Error).message)
              }
            }}
          >
            {row.active ? '下架' : '上架'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <Card className="page-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontWeight: 600 }}>会员购买总开关</div>
            <div style={{ color: '#8a93a6', fontSize: 12 }}>
              支付密钥：{sw?.payConfigured ? '已配置' : '未配置'} · 推送密钥：{sw?.pushConfigured ? '已配置' : '未配置'}
            </div>
          </div>
          <Switch value={!!sw?.enabled} onChange={(v) => toggleSwitch(!!v)} />
          <Tag theme={sw?.enabled ? 'success' : 'default'} variant="light">{sw?.enabled ? '已开启' : '已关闭'}</Tag>
          <div style={{ flex: 1 }} />
          <Button onClick={() => setForm(emptyForm())}>新建档位</Button>
        </div>
      </Card>

      <Card className="page-card">
        <Table
          rowKey="id"
          columns={columns as never}
          data={rows}
          loading={loading}
          pagination={undefined}
        />
      </Card>

      <Dialog
        header={form?.id ? '编辑档位' : '新建档位'}
        visible={form !== null}
        onClose={() => !saving && setForm(null)}
        onConfirm={submit}
        confirmBtn={{ content: '保存', loading: saving, disabled: !form?.synced }}
        cancelBtn="取消"
        width={520}
      >
        {form && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Input
              label="道具 ID"
              value={form.key}
              disabled={!!form.id}
              onChange={(v) => setForm({ ...form, key: String(v) })}
              placeholder="与 MP 后台 productId 完全一致"
            />
            {form.id && <div style={{ color: '#8a93a6', fontSize: 12, marginTop: -8 }}>创建后不可改</div>}
            <Input label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: String(v) })} />
            <Input label="副标题" value={form.subtitle} onChange={(v) => setForm({ ...form, subtitle: String(v) })} />
            <Input
              label="价格（元）"
              value={form.priceYuan}
              onChange={(v) => setForm({ ...form, priceYuan: String(v) })}
            />
            <div style={{ color: '#8a93a6', fontSize: 12, marginTop: -8 }}>
              保存为 {yuanToFen(form.priceYuan) ?? '—'} 分；MP 后台道具价填同一个数
            </div>
            <InputNumber
              label="天数"
              value={form.durationDays}
              min={1}
              max={3660}
              onChange={(v) => setForm({ ...form, durationDays: Number(v) || 1 })}
            />
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Checkbox checked={form.adFree} onChange={(v) => setForm({ ...form, adFree: !!v })}>免广告</Checkbox>
              <Checkbox checked={form.exportBundle} onChange={(v) => setForm({ ...form, exportBundle: !!v })}>打包导出</Checkbox>
              <Checkbox checked={form.subscribeNotice} onChange={(v) => setForm({ ...form, subscribeNotice: !!v })}>订阅提醒</Checkbox>
            </div>
            <InputNumber
              label="照片额度（0＝不给加成）"
              value={form.photoQuota}
              min={0}
              max={10000}
              onChange={(v) => setForm({ ...form, photoQuota: Number(v) || 0 })}
            />
            <InputNumber
              label="排序"
              value={form.sortOrder}
              min={0}
              max={9999}
              onChange={(v) => setForm({ ...form, sortOrder: Number(v) || 0 })}
            />
            <Input
              label="备注"
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: String(v) })}
              placeholder="每行一条"
            />
            <Checkbox checked={form.synced} onChange={(v) => setForm({ ...form, synced: !!v })}>
              我已确认 MP 后台道具价已同步为 {fenToYuan(yuanToFen(form.priceYuan) ?? 0)} 元
            </Checkbox>
            {error && <div style={{ color: '#d54941', fontSize: 13 }}>{error}</div>}
          </div>
        )}
      </Dialog>
    </>
  )
}
