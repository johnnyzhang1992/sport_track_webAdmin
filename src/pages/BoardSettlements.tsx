import { useEffect, useState } from 'react'
import { Button, Card, Dialog, Input, MessagePlugin, Select, Table, Tag, Textarea } from 'tdesign-react'
import {
  adminApi,
  type BoardSettlementPeriod,
  type BoardSettlementRow,
  type BoardSettlementStatus,
} from '../api'
import { TYPE_LABELS } from '../utils/format'

const PAGE_SIZE = 20

/**
 * 榜单发放台账（spec §4.7）：
 * - 默认视图只出发放行（pending/credited/revoked）；整榜级占位行要显式选 status=skipped 才出来
 * - 撤回按钮只按 canRevoke 渲染（整榜级占位行没有按钮，服务端也会独立拒绝）
 * - 撤回走 Modal + 必填备注，文案与占位照 spec §4.8 第 7 条逐字，不在这里改写
 */

/** 状态筛选项：空值＝api 默认的「只看发放行」，不是「全部状态」（skipped 不在默认视图里） */
const STATUS_OPTIONS = [
  { label: '发放行（默认）', value: '' },
  { label: '结算中', value: 'pending' },
  { label: '已发放', value: 'credited' },
  { label: '已撤回', value: 'revoked' },
  { label: '整榜级占位', value: 'skipped' },
]

const STATUS_TEXT: Record<BoardSettlementStatus, string> = {
  pending: '结算中',
  credited: '已发放',
  revoked: '已撤回',
  skipped: '整榜级占位',
}

const STATUS_THEME: Record<BoardSettlementStatus, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  credited: 'success',
  revoked: 'default',
  skipped: 'default',
}

const PERIOD_OPTIONS = [
  { label: '全部周期', value: '' },
  { label: '周榜', value: 'week' },
  { label: '月榜', value: 'month' },
  { label: '年榜', value: 'year' },
]

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

/** 整榜级占位行的身份：不是某个用户的奖励，别渲染成「微信用户 / 第 0 名」 */
const BOARD_LEVEL_KIND_TEXT: Record<BoardSettlementRow['kind'], string> = {
  payout: '',
  threshold_skip: '门槛未过',
  settled_marker: '完成标记',
  board_level: '整榜级',
}

const FILTER_LABEL_STYLE = { fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }

export default function BoardSettlements() {
  const [rows, setRows] = useState<BoardSettlementRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  /** 默认视图提示：payoutRowsOnly=true 时整榜级占位行被结构性排除 */
  const [payoutRowsOnly, setPayoutRowsOnly] = useState(true)

  const [status, setStatus] = useState('')
  const [period, setPeriod] = useState<BoardSettlementPeriod | ''>('')
  const [type, setType] = useState('')
  /** 输入框里的值：回车或点「查询」才提交，避免每敲一个字就打一次接口 */
  const [periodKeyInput, setPeriodKeyInput] = useState('')
  const [periodKey, setPeriodKey] = useState('')
  const [userIdInput, setUserIdInput] = useState('')
  const [userId, setUserId] = useState('')
  const [reload, setReload] = useState(0)

  // 撤回弹窗
  const [revokeRow, setRevokeRow] = useState<BoardSettlementRow | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [revokeError, setRevokeError] = useState('')
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminApi
      .boardSettlements({
        page,
        pageSize: PAGE_SIZE,
        status: status as BoardSettlementStatus | '',
        period,
        periodKey,
        type,
        userId,
      })
      .then((d) => {
        if (!alive) return
        setRows(d.items)
        setTotal(d.total)
        setPayoutRowsOnly(d.payoutRowsOnly)
      })
      .catch((e) => MessagePlugin.error((e as Error).message))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [page, status, period, periodKey, type, userId, reload])

  const submitFilters = () => {
    setPeriodKey(periodKeyInput.trim())
    setUserId(userIdInput.trim())
    setPage(1)
  }

  const openRevoke = (row: BoardSettlementRow) => {
    setRevokeRow(row)
    setNote('')
    setNoteError('')
    setRevokeError('')
  }

  const closeRevoke = () => {
    if (revoking) return
    setRevokeRow(null)
  }

  const submitRevoke = async () => {
    if (!revokeRow) return
    const trimmed = note.trim()
    if (!trimmed) {
      setNoteError('备注必填')
      return
    }
    setRevoking(true)
    setRevokeError('')
    try {
      const res = await adminApi.revokeBoardSettlement(revokeRow.id, trimmed)
      if (res.notification) {
        MessagePlugin.success(`已撤回 · 余额 ${res.balance.toLocaleString()}`)
      } else {
        // 半态：钱与台账已成对，通知发送失败（服务端有日志），提示运营补发
        MessagePlugin.warning('已撤回，但通知未发出，请按服务端日志补发')
      }
      setRevokeRow(null)
      setReload((n) => n + 1)
    } catch (e) {
      // 400 整句中文（备注必填 / 余额不足 / 重复撤回…）原样展示在弹窗里，关掉前能看清原因
      setRevokeError((e as Error).message)
    } finally {
      setRevoking(false)
    }
  }

  return (
    <>
      <Card className="page-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={FILTER_LABEL_STYLE}>状态</span>
          <Select
            size="small"
            style={{ width: 150 }}
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => {
              setStatus(String(v ?? ''))
              setPage(1)
            }}
          />
          <span style={FILTER_LABEL_STYLE}>周期</span>
          <Select
            size="small"
            style={{ width: 120 }}
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(v) => {
              const next = String(v ?? '') as BoardSettlementPeriod | ''
              setPeriod(next)
              // periodKey 必须与 period 同传（api 400）：切周期时把键一起清掉
              setPeriodKey('')
              setPeriodKeyInput('')
              setPage(1)
            }}
          />
          <Input
            size="small"
            style={{ width: 180 }}
            value={periodKeyInput}
            disabled={!period}
            placeholder="周期键，如 2034-03-06"
            onChange={(v) => setPeriodKeyInput(String(v))}
            onEnter={submitFilters}
          />
          <span style={FILTER_LABEL_STYLE}>类型</span>
          <Select
            size="small"
            style={{ width: 120 }}
            value={type}
            options={TYPE_OPTIONS}
            onChange={(v) => {
              setType(String(v ?? ''))
              setPage(1)
            }}
          />
          <Input
            size="small"
            style={{ width: 250 }}
            value={userIdInput}
            placeholder="用户 ID（24 位 ObjectId）"
            onChange={(v) => setUserIdInput(String(v))}
            onEnter={submitFilters}
          />
          <Button size="small" variant="outline" onClick={submitFilters}>
            查询
          </Button>
          <Button size="small" variant="text" onClick={() => setReload((n) => n + 1)}>
            刷新
          </Button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginBottom: 8 }}>
          {payoutRowsOnly
            ? '默认只看发放行；整榜级占位行请把状态筛成「整榜级占位」'
            : '整榜级占位行只读：不是发放记录，不提供撤回'}
        </div>
        <Table
          rowKey="id"
          data={rows}
          loading={loading}
          empty="暂无发放台账"
          rowClassName={({ row }) => (row.boardLevel ? 'board-level-row' : '')}
          columns={[
            {
              colKey: 'period',
              title: '周期',
              width: 220,
              cell: ({ row }: { row: BoardSettlementRow }) => (
                <div style={{ minWidth: 0 }}>
                  <div>{row.periodLabel}</div>
                  {row.periodKey !== row.periodLabel && (
                    <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>{row.periodKey}</div>
                  )}
                </div>
              ),
            },
            { colKey: 'typeLabel', title: '类型', width: 88 },
            {
              colKey: 'user',
              title: '用户',
              width: 180,
              ellipsis: true,
              cell: ({ row }: { row: BoardSettlementRow }) =>
                row.boardLevel ? (
                  <Tag theme="default" variant="outline">
                    整榜级 · {BOARD_LEVEL_KIND_TEXT[row.kind]}
                  </Tag>
                ) : (
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.nickname || '微信用户'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>
                      UID {row.uid || '—'}
                    </div>
                  </div>
                ),
            },
            {
              colKey: 'rank',
              title: '名次',
              width: 84,
              align: 'center',
              cell: ({ row }: { row: BoardSettlementRow }) => (row.boardLevel ? '—' : `第 ${row.rank} 名`),
            },
            {
              colKey: 'points',
              title: '分值',
              width: 88,
              align: 'right',
              cell: ({ row }: { row: BoardSettlementRow }) => (row.boardLevel ? '—' : `+${row.points.toLocaleString()}`),
            },
            {
              colKey: 'status',
              title: '状态',
              width: 110,
              cell: ({ row }: { row: BoardSettlementRow }) => (
                <Tag theme={STATUS_THEME[row.status] ?? 'default'} variant="light">
                  {STATUS_TEXT[row.status] ?? row.status}
                </Tag>
              ),
            },
            {
              colKey: 'reason',
              title: '备注',
              ellipsis: true,
              // 整句由服务端下发（占位说明/撤回备注原文），原样渲染
              cell: ({ row }: { row: BoardSettlementRow }) => (
                <span title={row.reason}>{row.reason || '—'}</span>
              ),
            },
            {
              colKey: 'op',
              title: '操作',
              width: 90,
              cell: ({ row }: { row: BoardSettlementRow }) =>
                row.canRevoke ? (
                  <Button variant="text" theme="danger" size="small" onClick={() => openRevoke(row)}>
                    撤回
                  </Button>
                ) : (
                  <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)' }}>—</span>
                ),
            },
          ]}
          pagination={{
            total,
            current: page,
            pageSize: PAGE_SIZE,
            showJumper: true,
            onChange: (info) => setPage(info.current),
          }}
        />
      </Card>

      {/* 撤回：标题/正文/占位照 spec §4.8 第 7 条逐字；不额外加解释句 */}
      <Dialog
        header="撤回这笔榜单奖励？"
        visible={revokeRow != null}
        width={480}
        confirmBtn={{ content: '确认撤回', theme: 'danger', loading: revoking }}
        onCancel={closeRevoke}
        onClose={closeRevoke}
        onConfirm={submitRevoke}
      >
        {revokeRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, lineHeight: '22px' }}>
              将扣回 {revokeRow.points.toLocaleString()} 积分并给用户发送通知。备注必填，会原文出现在用户收到的消息里。
            </div>
            <div>
              <Textarea
                value={note}
                maxlength={200}
                count={false}
                autosize={{ minRows: 3, maxRows: 5 }}
                placeholder="例如：该周轨迹经复核为搭车刷量"
                onChange={(v) => {
                  setNote(String(v))
                  setNoteError('')
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--td-error-color, #d54941)' }}>{noteError}</span>
                <span style={{ color: 'var(--td-text-color-placeholder, #8a93a6)' }}>{note.length} / 200</span>
              </div>
            </div>
            {revokeError && (
              <div
                style={{
                  fontSize: 13,
                  lineHeight: '20px',
                  color: 'var(--td-error-color, #d54941)',
                  background: 'var(--td-error-color-1, #fff0ed)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  wordBreak: 'break-all',
                }}
              >
                {revokeError}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
