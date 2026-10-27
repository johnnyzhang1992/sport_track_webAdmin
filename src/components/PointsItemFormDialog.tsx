import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Dialog, Input, InputNumber, MessagePlugin, Select, Switch, Textarea } from 'tdesign-react'
import { adminApi, uploadPointItemImage, type PointItemEffectKind, type PointItemInput, type PointItemKind, type PointItemRow } from '../api'

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
  kind: PointItemKind
  /** 实物详情图：裸链入库、签名链只用于展示，两个数组按下标一一对应 */
  detailImages: string[]
  detailPreviews: string[]
  /** 每人限购张数，0 = 不限 */
  perUserLimit: number
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
  kind: 'virtual',
  detailImages: [],
  detailPreviews: [],
  perUserLimit: 0,
}

/** key 形状与 api 的 ITEM_KEY_RE 一字不差（先在前端拦一次，报错文案带字段名） */
const ITEM_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/

/** 实物详情图上限，与 api 的 DETAIL_IMAGE_MAX 同值 */
const DETAIL_IMAGE_MAX = 6
/** 兑换价换算：后台按「元」录实物售价，落库一律积分，固定 1 元 = 100 分 */
const POINTS_PER_YUAN = 100

const EFFECT_OPTIONS = [
  { label: '补签（补一天用一张）', value: 'makeup' },
  { label: '免广告（激活后 N 天）', value: 'ad_free' },
]

const KIND_OPTIONS = [
  { label: '虚拟道具（发卡到账户）', value: 'virtual' },
  { label: '实物商品（兑换后发货）', value: 'physical' },
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
 * 道具新建 / 编辑（Task 13 + 实物批次）。
 * 编辑提交的是**完整内容对象**：PUT 拥有十三个内容字段（缺一个 api 400 点名），且永不写 stock/unlimited；
 * key 创建后不可改，编辑态禁用并在旁边说明。
 * 类型选「实物商品」时：兑换价按元录入（1 元 = 100 积分，落库仍是积分）、多出详情图与每人限购两格、
 * 隐藏用不上的「效果」与「卡有效期」；切回虚拟时这三格反向处理（值归零，不留隐藏状态）。
 */
export default function PointsItemFormDialog({ visible, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ItemForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)

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
            // 老行（实物批次之前入库）缺这三个字段时接口按 virtual / 空图 / 不限补齐，这里直接取
            kind: row.kind,
            detailImages: [...row.detailImages],
            detailPreviews: [...row.detailPreviewUrls],
            perUserLimit: row.perUserLimit,
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

  /** 详情图逐张追加（一次选一张，避免整批里混一张超限的就全批白传） */
  const uploadDetail = async (file: File | undefined) => {
    if (!file || !form) return
    if (form.detailImages.length >= DETAIL_IMAGE_MAX) {
      MessagePlugin.warning(`商品详情图最多 ${DETAIL_IMAGE_MAX} 张`)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      MessagePlugin.warning('图片不能超过 2MB')
      return
    }
    setUploading(true)
    try {
      const { url, previewUrl } = await uploadPointItemImage(file)
      setForm((f) =>
        f
          ? { ...f, detailImages: [...f.detailImages, url], detailPreviews: [...f.detailPreviews, previewUrl] }
          : f,
      )
      MessagePlugin.success('详情图已添加')
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const removeDetail = (index: number) => {
    setForm((f) =>
      f
        ? {
            ...f,
            detailImages: f.detailImages.filter((_, i) => i !== index),
            detailPreviews: f.detailPreviews.filter((_, i) => i !== index),
          }
        : f,
    )
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
    const physical = form.kind === 'physical'
    if (physical && (!Number.isInteger(form.perUserLimit) || form.perUserLimit < 0 || form.perUserLimit > 99)) {
      MessagePlugin.warning(`每人限购只能是 0（不限）或 1–99 的整数（当前 ${form.perUserLimit}）`)
      return
    }
    if (form.detailImages.length > DETAIL_IMAGE_MAX) {
      MessagePlugin.warning(`商品详情图最多 ${DETAIL_IMAGE_MAX} 张（当前 ${form.detailImages.length} 张）`)
      return
    }

    // PUT 覆盖整行内容：十三个内容字段全带上（缺一个 api 就 400 点名）；
    // stock/unlimited 不属于内容对象，改库存走单独接口
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
      kind: form.kind,
      // 虚拟道具带上空数组/0 也是必填：不写就是「缺字段」，api 不猜默认值
      detailImages: physical ? form.detailImages : [],
      perUserLimit: physical ? form.perUserLimit : 0,
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

            <Field label="类型">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Select
                  value={form.kind}
                  style={{ width: 240 }}
                  options={KIND_OPTIONS}
                  onChange={(v) => {
                    const kind = String(v) as PointItemKind
                    // 切到实物：效果位用不上，一并归零，免得留着看不见的 ad_free 天数被提交
                    // 切回虚拟：限购与详情图同理清掉（实物专属），限购归 0（不限）、详情图清空
                    setForm(
                      kind === 'physical'
                        ? { ...form, kind, effectKind: 'makeup', effectDays: 0 }
                        : { ...form, kind, detailImages: [], detailPreviews: [], perUserLimit: 0 },
                    )
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                  实物商品兑换后生成待发货订单，用户要填收货地址
                </span>
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
              {form.kind === 'physical' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <InputNumber
                    value={form.price / POINTS_PER_YUAN}
                    min={0.01}
                    step={1}
                    style={{ width: 160 }}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        price: Math.round(numOr(v as number | string | undefined, form.price / POINTS_PER_YUAN) * POINTS_PER_YUAN),
                      })
                    }
                  />
                  <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                    元 = {form.price.toLocaleString()} 积分（固定 1 元 = 100 积分）
                  </span>
                </div>
              ) : (
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
              )}
            </Field>

            {form.kind !== 'physical' && (
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
            )}

            {/* 卡有效期只对「发卡」有用：实物兑换落的是订单、不发卡，所以实物隐藏这一格。
                值仍随表单保留并提交（api 要求 validDays ≥1）——切回虚拟时它还在，不会被悄悄改成默认值 */}
            {form.kind !== 'physical' && (
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
            )}

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

            {form.kind === 'physical' && (
              <>
                <Field label="商品详情图" top>
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {form.detailPreviews.map((src, i) => (
                        <div key={`${src}-${i}`} style={{ position: 'relative', width: 72, height: 72 }}>
                          <img
                            src={src}
                            alt={`详情图 ${i + 1}`}
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 8,
                              objectFit: 'cover',
                              border: '1px solid var(--td-component-stroke, #eef0f3)',
                            }}
                          />
                          <button
                            type="button"
                            aria-label={`删除详情图 ${i + 1}`}
                            onClick={() => removeDetail(i)}
                            style={{
                              position: 'absolute',
                              top: -6,
                              right: -6,
                              width: 20,
                              height: 20,
                              lineHeight: '18px',
                              padding: 0,
                              borderRadius: '50%',
                              border: '1px solid var(--td-component-stroke, #eef0f3)',
                              background: 'var(--td-bg-color-container, #fff)',
                              color: 'var(--td-text-color-secondary, #4e5969)',
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {form.detailImages.length < DETAIL_IMAGE_MAX && (
                        <Button
                          size="small"
                          variant="dashed"
                          loading={uploading}
                          onClick={() => detailFileRef.current?.click()}
                          style={{ width: 72, height: 72 }}
                        >
                          +
                        </Button>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 4 }}>
                      {form.detailImages.length} / {DETAIL_IMAGE_MAX} 张，2MB 以内；用户在小程序商品详情里横滑查看
                    </div>
                  </div>
                </Field>

                <Field label="每人限购">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InputNumber
                      value={form.perUserLimit}
                      min={0}
                      max={99}
                      step={1}
                      style={{ width: 120 }}
                      onChange={(v) => setForm({ ...form, perUserLimit: numOr(v as number | string | undefined, form.perUserLimit) })}
                    />
                    <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                      张（0 = 不限；按人累计已兑换数判定，退货不回退额度）
                    </span>
                  </div>
                </Field>
              </>
            )}

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
      {/* 详情图单独一个 input：和主图共用一个的话，选完主图的残留 state 会串到详情那条链上 */}
      <input
        ref={detailFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          uploadDetail(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
