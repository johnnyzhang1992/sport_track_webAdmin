import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Dialog,
  Input,
  InputNumber,
  MessagePlugin,
  Select,
  Table,
  Tag,
} from 'tdesign-react'
import { adminApi, type XpayOrderRow, type XpayRefundPreview } from '../api'
import { fenToYuan } from '../utils/fen-yuan'
import { fmtDateTime } from '../utils/format'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待支付', value: 'created' },
  { label: '已支付', value: 'paid' },
  { label: '已发货', value: 'delivered' },
  { label: '退款中', value: 'refunding' },
  { label: '已退款', value: 'refunded' },
  { label: '已关闭', value: 'closed' },
]

const CHANNEL_OPTIONS = [
  { label: '全部渠道', value: '' },
  { label: '安卓', value: 'android' },
  { label: 'iOS', value: 'ios' },
]

const STATUS_TEXT: Record<string, string> = {
  created: '待支付', paid: '已支付', delivered: '已发货', refunding: '退款中', refunded: '已退款', closed: '已关闭',
}
const STATUS_THEME: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  created: 'default', paid: 'primary', delivered: 'success', refunding: 'warning', refunded: 'danger', closed: 'default',
}

const yuan = (fen: number) => `${fenToYuan(fen)} 元`

/**
 * 会员订单（spec §6.3）：列表 + 详情 + 三步退款 + 手动查单。
 * 退款的第 1 步是「刷新可退额度」——它单独成一次接口调用，失败就禁用提交，绝不拿库里旧值猜。
 */
export default function XpayOrders() {
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<XpayOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<XpayOrderRow | null>(null)

  // 退款弹窗：preview 是「刷新后的可退额度」，没拿到就不许提交
  const [refundRow, setRefundRow] = useState<XpayOrderRow | null>(null)
  const [preview, setPreview] = useState<XpayRefundPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [fee, setFee] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const previewSeq = useRef(0)

  const loadSeqRef = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    const seq = ++loadSeqRef.current
    try {
      const res = await adminApi.xpayOrders({ status, channel, keyword, page, pageSize: PAGE_SIZE })
      if (seq !== loadSeqRef.current) return // 迟到响应丢弃
      setRows(res.items)
      setTotal(res.total)
    } catch (e) {
      if (seq === loadSeqRef.current) MessagePlugin.error((e as Error).message)
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [status, channel, keyword, page])

  useEffect(() => { void load() }, [load])

  const openRefund = async (row: XpayOrderRow) => {
    setRefundRow(row)
    setPreview(null)
    setFee(null)
    setReason('')
    setReasonCode('')
    setError('')
    setPreviewLoading(true)
    const seq = ++previewSeq.current
    try {
      const p = await adminApi.xpayRefundPreview(row.id)
      if (seq !== previewSeq.current) return
      setPreview(p)
      if (p.canRefund && p.suggestFeeFen > 0) setFee(p.suggestFeeFen)
      if (!p.canRefund) setError(p.reason ?? '当前不可退款')
    } catch (e) {
      if (seq === previewSeq.current) setError((e as Error).message)
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false)
    }
  }

  const closeRefund = () => {
    if (submitting) return
    previewSeq.current += 1
    setRefundRow(null)
  }

  const submitRefund = async () => {
    if (!refundRow || !preview) return
    const left = preview.leftFeeFen
    if (!Number.isInteger(fee) || (fee ?? 0) <= 0) {
      setError(`退款金额必须是正整数分（收到 ${JSON.stringify(fee)}，本次可退 ${left} 分）`)
      return
    }
    if ((fee as number) > left) {
      setError(`退款金额超过可退上限（本次填 ${fee} 分，可退 ${left} 分）`)
      return
    }
    if (!reason.trim()) { setError('退款备注必填'); return }
    if (!reasonCode) { setError('请选择退款原因（发给微信的枚举）'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await adminApi.xpayRefund(refundRow.id, fee as number, reason.trim(), reasonCode)
      MessagePlugin.success(res.status === 'refunded' ? '退款已完成' : '退款已发起（处理中以微信通知为准）')
      setRefundRow(null)
      await load()
    } catch (e) {
      setError((e as Error).message) // 服务端整句留在弹窗里
    } finally {
      setSubmitting(false)
    }
  }

  const queryOne = async (row: XpayOrderRow) => {
    try {
      const r = await adminApi.xpayOrderQuery(row.id)
      MessagePlugin.success(`查单完成：status=${r.status}，可退 ${r.leftFeeFen} 分`)
      await load()
    } catch (e) {
      MessagePlugin.error((e as Error).message)
    }
  }

  const columns = [
    {
      colKey: 'createdAt', title: '下单时间', width: 150,
      cell: ({ row }: { row: XpayOrderRow }) => <span>{fmtDateTime(row.createdAt)}</span>,
    },
    { colKey: 'outTradeNo', title: '商户单号', width: 200, ellipsis: true },
    { colKey: 'name', title: '档位', width: 100 },
    {
      colKey: 'priceFen', title: '金额（元）', width: 100,
      cell: ({ row }: { row: XpayOrderRow }) => <span>{fenToYuan(row.priceFen)}</span>,
    },
    {
      colKey: 'refundedFen', title: '已退（元）', width: 100,
      cell: ({ row }: { row: XpayOrderRow }) => <span>{fenToYuan(row.refundedFen)}</span>,
    },
    {
      colKey: 'netFen', title: '净收入（元）', width: 110,
      cell: ({ row }: { row: XpayOrderRow }) => <span>{fenToYuan(row.netFen)}</span>,
    },
    {
      colKey: 'status', title: '状态', width: 90,
      cell: ({ row }: { row: XpayOrderRow }) => (
        <Tag theme={STATUS_THEME[row.status] ?? 'default'} variant="light">{STATUS_TEXT[row.status] ?? row.status}</Tag>
      ),
    },
    {
      colKey: 'channel', title: '渠道', width: 70,
      cell: ({ row }: { row: XpayOrderRow }) => <span>{row.channel === 'ios' ? 'iOS' : row.channel === 'android' ? '安卓' : '—'}</span>,
    },
    {
      colKey: 'period', title: '会员区间', width: 180,
      cell: ({ row }: { row: XpayOrderRow }) => (
        <span style={{ color: '#5b6474' }}>{row.paidAtText ? `${row.paidAtText} ~ ${row.periodEndText}` : '—'}</span>
      ),
    },
    {
      colKey: 'op', title: '操作', width: 220,
      cell: ({ row }: { row: XpayOrderRow }) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="text" size="small" onClick={() => setDetail(row)}>详情</Button>
          <Button variant="text" size="small" onClick={() => queryOne(row)}>查单</Button>
          <Button
            variant="text"
            size="small"
            onClick={() => openRefund(row)}
          >
            退款
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <Card className="page-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Select size="small" style={{ width: 150 }} value={status} options={STATUS_OPTIONS}
            onChange={(v) => { setStatus(String(v ?? '')); setPage(1) }} />
          <Select size="small" style={{ width: 130 }} value={channel} options={CHANNEL_OPTIONS}
            onChange={(v) => { setChannel(String(v ?? '')); setPage(1) }} />
          <Input
            size="small" style={{ width: 220 }} value={keyword}
            placeholder="单号 / openid / 档位"
            onChange={(v) => setKeyword(String(v))}
            onEnter={() => { setPage(1); void load() }}
          />
          <Button size="small" theme="primary" onClick={() => { setPage(1); void load() }}>查询</Button>
          <Button size="small" onClick={() => { setStatus(''); setChannel(''); setKeyword(''); setPage(1) }}>重置</Button>
        </div>
      </Card>

      <Card className="page-card">
        <Table
          rowKey="id"
          columns={columns as never}
          data={rows}
          loading={loading}
          tableLayout="fixed"
          pagination={{
            current: page, pageSize: PAGE_SIZE, total,
            showJumper: true,
            onChange: (p: { current: number }) => setPage(p.current),
          }}
        />
      </Card>

      {/* 详情：退款/发货留痕都在这里，方便客服对着日志解释 */}
      <Dialog header="订单详情" visible={detail !== null} onClose={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <span style={{ color: '#8a93a6' }}>商户单号</span><span>{detail.outTradeNo}</span>
            <span style={{ color: '#8a93a6' }}>微信单号</span><span>{detail.wxOrderId || '—'}</span>
            <span style={{ color: '#8a93a6' }}>档位</span><span>{detail.name}（{detail.durationDays} 天）</span>
            <span style={{ color: '#8a93a6' }}>金额 / 已退</span><span>{yuan(detail.priceFen)} / {yuan(detail.refundedFen)}</span>
            <span style={{ color: '#8a93a6' }}>状态</span><span>{STATUS_TEXT[detail.status] ?? detail.status}</span>
            <span style={{ color: '#8a93a6' }}>会员区间</span>
            <span>{detail.paidAtText ? `${detail.paidAtText} ~ ${detail.periodEndText}` : '—'}</span>
            <span style={{ color: '#8a93a6' }}>退款单号</span><span>{detail.refundOrderId || '—'}</span>
            <span style={{ color: '#8a93a6' }}>退款备注</span><span>{detail.refundReason || '—'}</span>
            <span style={{ color: '#8a93a6' }}>最近可退额度</span>
            <span>{detail.leftFeeAt ? `${yuan(detail.leftFeeFen)}（${fmtDateTime(detail.leftFeeAt)}）` : '—'}</span>
            <span style={{ color: '#8a93a6' }}>最近错误</span><span style={{ color: '#d54941' }}>{detail.lastError || '—'}</span>
          </div>
        )}
      </Dialog>

      {/* 三步退款：打开即刷新额度 → 金额（预填可改）+ 备注 → 提交 */}
      <Dialog
        header="退款"
        visible={refundRow !== null}
        onClose={closeRefund}
        onConfirm={submitRefund}
        confirmBtn={{
          content: '提交退款',
          loading: submitting,
          disabled: previewLoading || !preview?.canRefund,
        }}
        cancelBtn="取消"
        width={520}
      >
        {refundRow && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: '#5b6474', fontSize: 13 }}>
              可退额度：
              {previewLoading ? '刷新中…' : preview ? `${yuan(preview.leftFeeFen)}` : '—'}
              {preview && `（订单 ${yuan(preview.priceFen)}，已退 ${yuan(preview.refundedFen)}）`}
            </div>
            <div style={{ color: '#5b6474', fontSize: 13 }}>退款金额（分）</div>
            <InputNumber
              value={fee ?? undefined}
              min={1}
              max={preview?.leftFeeFen ?? undefined}
              disabled={!preview?.canRefund}
              style={{ width: 240 }}
              onChange={(v) => setFee(v === undefined ? null : Number(v))}
              placeholder="建议值见下方"
            />
            {preview?.canRefund && (
              <div style={{ color: '#8a93a6', fontSize: 12, marginTop: -6 }}>
                建议值 {preview.suggestFeeFen} 分（按剩余天数折算，仅建议、可改）
              </div>
            )}
            <div style={{ color: '#8a93a6', fontSize: 12 }}>
              本次退款后权益将截断至 {preview?.truncateToText ?? '—'}（与金额无关）
            </div>
            <div style={{ color: '#5b6474', fontSize: 13 }}>退款原因（发给微信，必选）</div>
            <Select
              value={reasonCode || undefined}
              style={{ width: 240 }}
              placeholder="选择退款原因"
              onChange={(v) => setReasonCode(String(v ?? ''))}
              options={[
                { value: '1', label: '产品问题，影响使用或效果不佳' },
                { value: '2', label: '售后问题，无法满足需求' },
                { value: '3', label: '意愿问题，用户主动退款' },
                { value: '4', label: '价格问题' },
                { value: '5', label: '其他原因' },
              ]}
            />
            <Input
              label="备注（存档）"
              value={reason}
              disabled={!preview?.canRefund}
              onChange={(v) => setReason(String(v))}
              placeholder="写进订单留痕，方便日后与用户核对（不发给微信）"
            />
            {error && <div style={{ color: '#d54941', fontSize: 13 }}>{error}</div>}
          </div>
        )}
      </Dialog>
    </>
  )
}
