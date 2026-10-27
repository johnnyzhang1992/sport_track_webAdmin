import { useEffect, useState } from 'react'
import { Button, Checkbox, Dialog, Input, InputNumber, MessagePlugin, Radio, RadioGroup, Tag } from 'tdesign-react'
import type { PointGrantResult, PointItemRow, PointsUserRow } from '../api'
import { adminApi } from '../api'
import UserAvatar from './UserAvatar'

interface Props {
  visible: boolean
  item: PointItemRow | null
  onClose: () => void
  /** 发放已落库（含部分失败）：父页面据此刷新道具/概况/发放记录 */
  onIssued: (result: PointGrantResult) => void
}

const MAX_CANDIDATES = 20

function numOr(v: number | string | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * 后台发放（Task 13）：选用户 → 每人张数 → 来源 → 备注。
 * 用户搜索走 /admin/points/users 的 keyword（昵称子串 + UID 精确号）：
 * /admin/users 的 keyword 只匹配昵称/备注、不匹配 UID，做不到「按 UID 搜人」。
 */
export default function PointsGrantDialog({ visible, item, onClose, onIssued }: Props) {
  const [keyword, setKeyword] = useState('')
  const [candidates, setCandidates] = useState<PointsUserRow[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PointsUserRow[]>([])
  const [count, setCount] = useState(1)
  const [source, setSource] = useState<'admin' | 'system'>('admin')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // 重开 / 换道具即清空上一单的名单与参数：发放名单最忌讳残留
  useEffect(() => {
    if (!visible) return
    setKeyword('')
    setCandidates(null)
    setSelected([])
    setCount(1)
    setSource('admin')
    setNote('')
  }, [visible, item?.id])

  const search = async () => {
    setSearching(true)
    try {
      const d = await adminApi.pointsUsers(1, MAX_CANDIDATES, keyword.trim())
      setCandidates(d.items)
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const toggle = (u: PointsUserRow, checked: boolean) => {
    setSelected((prev) => {
      if (!checked) return prev.filter((x) => x.id !== u.id)
      if (prev.some((x) => x.id === u.id)) return prev
      return [...prev, u]
    })
  }

  const need = selected.length * count
  const overStock = !!item && !item.unlimited && need > item.stock

  const submit = async () => {
    if (!item) return
    if (selected.length === 0) {
      MessagePlugin.warning('请先选择要发放的用户')
      return
    }
    if (!Number.isInteger(count) || count < 1) {
      MessagePlugin.warning('每人张数必须是 ≥1 的整数')
      return
    }
    setSaving(true)
    try {
      const res = await adminApi.grantPointItem(item.id, {
        userIds: selected.map((u) => u.id),
        count,
        source,
        note: note.trim(),
      })
      // refundFailed > 0 表示多占的库存没能原路退回：卡已发出，必须人工核对，不能报成功
      if (res.refundFailed > 0) {
        MessagePlugin.warning(`已发出 ${res.granted} 张，但 ${res.refundFailed} 张库存回补失败，请人工核对库存`)
      } else if (res.failed.length > 0) {
        const first = res.failed[0]
        MessagePlugin.warning(
          `已发出 ${res.granted} 张；${res.failed.length} 人失败（${first.reason}${res.failed.length > 1 ? ' 等' : ''}）`,
        )
      } else {
        MessagePlugin.success(`已发出 ${res.granted} 张`)
      }
      onIssued(res)
      onClose()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      header={item ? `发放「${item.name}」` : '发放道具'}
      visible={visible}
      width={640}
      confirmBtn={{ content: '确认发放', theme: 'primary', loading: saving, disabled: overStock }}
      onCancel={onClose}
      onClose={onClose}
      onConfirm={submit}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969', paddingTop: 6 }}>用户</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                value={keyword}
                placeholder="UID（精确）/ 昵称（模糊）"
                onChange={(v) => setKeyword(v as string)}
                onEnter={search}
              />
              <Button variant="outline" loading={searching} onClick={search}>
                搜索
              </Button>
            </div>
            {candidates && (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 220,
                  overflow: 'auto',
                  border: '1px solid var(--td-component-border, #e7e7e7)',
                  borderRadius: 6,
                }}
              >
                {candidates.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: '#8a93a6' }}>没有匹配的用户</div>
                ) : (
                  candidates.map((u) => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--td-component-stroke, #f0f2f5)',
                      }}
                    >
                      <Checkbox checked={selected.some((x) => x.id === u.id)} onChange={(c) => toggle(u, c)} />
                      <UserAvatar name={u.nickname} size={24} />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.nickname || '微信用户'}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8a93a6', flexShrink: 0 }}>
                        UID {u.uid || '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
            {selected.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, maxHeight: 88, overflow: 'auto' }}>
                {selected.map((u) => (
                  <Tag key={u.id} closable onClose={() => toggle(u, false)}>
                    {u.nickname || `UID ${u.uid || '—'}`}
                  </Tag>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#8a93a6', marginTop: 6 }}>
              已选 {selected.length} 人（UID 按精确号匹配，昵称按子串）
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969' }}>每人张数</span>
          <InputNumber
            value={count}
            min={1}
            step={1}
            style={{ width: 140 }}
            onChange={(v) => setCount(numOr(v as number | string | undefined, count))}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969' }}>来源</span>
          <RadioGroup value={source} onChange={(v) => setSource(String(v) as 'admin' | 'system')}>
            <Radio value="admin">手动发放</Radio>
            <Radio value="system">系统赠送</Radio>
          </RadioGroup>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 96, flexShrink: 0, textAlign: 'right', color: '#4e5969' }}>备注</span>
          <Input
            value={note}
            placeholder="写给台账的说明（可选）"
            onChange={(v) => setNote(v as string)}
          />
        </div>

        {/* 不可逆动作先把代价说清楚：发几张、扣多少库存 */}
        {item && (
          <div
            style={{
              fontSize: 13,
              color: overStock ? '#e34d59' : need > 0 ? '#e37318' : '#8a93a6',
              background: 'var(--td-bg-color-secondarycontainer, #f8f9fb)',
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            {overStock
              ? `库存不足：将发出 ${need} 张，当前库存 ${item.stock.toLocaleString()}`
              : `将发出 ${need} 张，${
                  item.unlimited ? '该道具不限量，不扣减库存' : `扣减库存 ${need} 张（当前 ${item.stock.toLocaleString()}）`
                }`}
          </div>
        )}
      </div>
    </Dialog>
  )
}
