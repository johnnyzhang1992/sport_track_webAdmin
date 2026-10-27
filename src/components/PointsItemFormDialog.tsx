import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Dialog, Input, InputNumber, MessagePlugin, Select, Switch, Textarea } from 'tdesign-react'
import { adminApi, uploadPointItemImage, type PointItemEffectKind, type PointItemInput, type PointItemRow } from '../api'

interface Props {
  visible: boolean
  /** null = 新建；非 null = 编辑该行 */
  row: PointItemRow | null
  onClose: () => void
  onSaved: () => void
}

interface ItemForm {
  id: string
  key: string
  name: string
  subtitle: string
  description: string
  /** 多行文本，保存时按换行切条（空行丢弃，上限 8 条） */
  notesText: string
  price: number
  validDays: number
  effectKind: PointItemEffectKind
  effectDays: number
  active: boolean
  sortOrder: number
  /** 入库裸链（上传接口回的 url）；展示用 previewUrl */
  image: string
  previewUrl: string
}

const EMPTY_FORM: ItemForm = {
  id: '',
  key: '',
  name: '',
  subtitle: '',
  description: '',
  notesText: '',
  price: 200,
  validDays: 30,
  effectKind: 'makeup',
  effectDays: 0,
  active: true,
  sortOrder: 0,
  image: '',
  previewUrl: '',
}

/** key 形状与 api 的 ITEM_KEY_RE 一字不差（先在前端拦一次，报错文案带字段名） */
const ITEM_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/

const EFFECT_OPTIONS = [
  { label: '补签（补一天用一张）', value: 'makeup' },
  { label: '免广告（激活后 N 天）', value: 'ad_free' },
]

/** InputNumber 清空时给 undefined/''，统一折成 fallback 而不是 NaN（NaN 会一路写进请求体） */
function numOr(v: number | string | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** 左标签 / 右控件（与 Notifications / Topics 同一套手写表单） */
function Field({ label, children, top }: { label: string; children: ReactNode; top?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: top ? 'flex-start' : 'center', gap: 10 }}>
      <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: 'var(--td-text-color-secondary, #4e5969)', paddingTop: top ? 6 : 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** notes 按换行切条：trim 后丢弃空行，条数与上限都由这一份口径算 */
function splitNotes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 道具新建 / 编辑（Task 13）。
 * 编辑提交的是**完整内容对象**：PUT 拥有十个内容字段（缺一个 api 400 点名），且永不写 stock/unlimited；
 * key 创建后不可改，编辑态禁用并在旁边说明。
 */
export default function PointsItemFormDialog({ visible, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ItemForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!visible) {
      setForm(null)
      return
    }
    setForm(
      row
        ? {
            id: row.id,
            key: row.key,
            name: row.name,
            subtitle: row.subtitle,
            description: row.description,
            notesText: row.notes.join('\n'),
            price: row.price,
            validDays: row.validDays,
            effectKind: row.effect.kind,
            effectDays: row.effect.days,
            active: row.active,
            sortOrder: row.sortOrder,
            image: row.image,
            previewUrl: row.previewUrl,
          }
        : { ...EMPTY_FORM },
    )
  }, [visible, row])

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      MessagePlugin.warning('图片不能超过 2MB')
      return
    }
    setUploading(true)
    try {
      // url 入库、previewUrl 只用于展示（私有桶裸链会 403）
      const { url, previewUrl } = await uploadPointItemImage(file)
      setForm((f) => (f ? { ...f, image: url, previewUrl } : f))
      MessagePlugin.success('图片已上传')
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!form) return
    const key = form.key.trim()
    const name = form.name.trim()
    const notes = splitNotes(form.notesText)

    if (!ITEM_KEY_RE.test(key)) {
      MessagePlugin.warning('key 只能是小写字母开头的 a-z0-9_，长度 2–40')
      return
    }
    if (!name) {
      MessagePlugin.warning('请填写道具名称')
      return
    }
    if (name.length > 20) {
      MessagePlugin.warning(`道具名称最多 20 字（当前 ${name.length} 字）`)
      return
    }
    if (!(form.price >= 1)) {
      MessagePlugin.warning('兑换价至少 1 分')
      return
    }
    if (!(form.validDays >= 1)) {
      MessagePlugin.warning('卡有效期至少 1 天')
      return
    }
    if (form.effectKind === 'ad_free' && !(form.effectDays >= 1)) {
      MessagePlugin.warning('免广告道具必须填天数（≥1）')
      return
    }
    if (notes.length > 8) {
      MessagePlugin.warning(`兑换说明最多 8 条（当前 ${notes.length} 条）`)
      return
    }

    // PUT 的十个内容字段全带上；stock/unlimited 不属于内容对象，改库存走单独接口
    const payload: PointItemInput = {
      key,
      name,
      subtitle: form.subtitle.trim(),
      description: form.description.trim(),
      notes,
      price: form.price,
      validDays: form.validDays,
      effect: { kind: form.effectKind, days: form.effectKind === 'ad_free' ? form.effectDays : 0 },
      active: form.active,
      sortOrder: form.sortOrder,
      image: form.image,
    }

    setSaving(true)
    try {
      if (form.id) {
        await adminApi.updatePointItem(form.id, payload)
        MessagePlugin.success('已保存')
      } else {
        await adminApi.createPointItem(payload)
        MessagePlugin.success('已创建')
      }
      setForm(null)
      onSaved()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog
        header={form?.id ? '编辑道具' : '新建道具'}
        visible={form != null}
        width={680}
        confirmBtn={{ content: '保存', theme: 'primary', loading: saving }}
        onCancel={onClose}
        onClose={onClose}
        onConfirm={save}
      >
        {form && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflow: 'auto', paddingRight: 4 }}>
            <Field label="key">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  value={form.key}
                  disabled={!!form.id}
                  style={{ flex: 1 }}
                  onChange={(v) => setForm({ ...form, key: v as string })}
                  placeholder="如 ad_free_10d"
                />
                {form.id && <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', flexShrink: 0 }}>创建后不可修改</span>}
              </div>
            </Field>

            <Field label="名称">
              <Input
                value={form.name}
                maxlength={20}
                onChange={(v) => setForm({ ...form, name: v as string })}
                placeholder="最多 20 字"
              />
            </Field>

            <Field label="副标题">
              <Input
                value={form.subtitle}
                onChange={(v) => setForm({ ...form, subtitle: v as string })}
                placeholder="列表卡片上的一句话说明"
              />
            </Field>

            <Field label="描述" top>
              <Textarea
                value={form.description}
                autosize={{ minRows: 3, maxRows: 6 }}
                onChange={(v) => setForm({ ...form, description: v as string })}
                placeholder="商品详情页的正文"
              />
            </Field>

            <Field label="兑换说明" top>
              <div>
                <Textarea
                  value={form.notesText}
                  autosize={{ minRows: 3, maxRows: 8 }}
                  onChange={(v) => setForm({ ...form, notesText: v as string })}
                  placeholder="一行一条，最多 8 条"
                />
                <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 4 }}>
                  {splitNotes(form.notesText).length} / 8 条
                </div>
              </div>
            </Field>

            <Field label="兑换价">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InputNumber
                  value={form.price}
                  min={1}
                  step={1}
                  style={{ width: 160 }}
                  onChange={(v) => setForm({ ...form, price: numOr(v as number | string | undefined, form.price) })}
                />
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>积分（≥1 的整数）</span>
              </div>
            </Field>

            <Field label="卡有效期">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InputNumber
                  value={form.validDays}
                  min={1}
                  step={1}
                  style={{ width: 160 }}
                  onChange={(v) => setForm({ ...form, validDays: numOr(v as number | string | undefined, form.validDays) })}
                />
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>天（兑换后可持有的时长）</span>
              </div>
            </Field>

            <Field label="效果">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Select
                  value={form.effectKind}
                  style={{ width: 240 }}
                  options={EFFECT_OPTIONS}
                  onChange={(v) => setForm({ ...form, effectKind: String(v) as PointItemEffectKind })}
                />
                {form.effectKind === 'ad_free' && (
                  <>
                    <InputNumber
                      value={form.effectDays}
                      min={1}
                      step={1}
                      style={{ width: 120 }}
                      onChange={(v) => setForm({ ...form, effectDays: numOr(v as number | string | undefined, form.effectDays) })}
                    />
                    <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>天</span>
                  </>
                )}
              </div>
            </Field>

            <Field label="道具图">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {form.previewUrl ? (
                  <img
                    src={form.previewUrl}
                    alt={form.name || '道具图'}
                    style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: 'var(--td-bg-color-secondarycontainer, #f2f3f5)',
                    }}
                  />
                )}
                <Button size="small" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                  {form.image ? '更换图片' : '上传图片'}
                </Button>
                {form.image && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setForm({ ...form, image: '', previewUrl: '' })}
                  >
                    清除
                  </Button>
                )}
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>可选，2MB 以内</span>
              </div>
            </Field>

            <Field label="排序">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <InputNumber
                  value={form.sortOrder}
                  step={1}
                  style={{ width: 120 }}
                  onChange={(v) => setForm({ ...form, sortOrder: numOr(v as number | string | undefined, form.sortOrder) })}
                />
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>数字小的排在前面</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <Switch value={form.active} onChange={(v) => setForm({ ...form, active: Boolean(v) })} />
                  <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary, #4e5969)' }}>上架</span>
                </span>
              </div>
            </Field>
          </div>
        )}
      </Dialog>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
