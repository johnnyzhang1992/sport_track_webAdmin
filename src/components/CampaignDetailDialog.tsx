import { useEffect, useState } from 'react'
import { Dialog, Table, Tag, Loading, MessagePlugin } from 'tdesign-react'
import { adminApi, type CampaignDetail, type CampaignMemberRow } from '../api'
import { fmtDateTime, fmtDuration, fmtKm, typeLabel } from '../utils/format'
import { campaignStatusMeta } from '../utils/campaign-status'

interface Props {
  id: string | null
  onClose: () => void
}

/** 活动可见性文案（服务端只回 public / private） */
const VISIBILITY_LABELS: Record<string, string> = { public: '公开', private: '私密' }
const VISIBILITY_THEMES: Record<string, 'primary' | 'default'> = { public: 'primary', private: 'default' }

/** 成员行状态：joined 在队；left / removed 为已离开的历史段（仍在列表里） */
const MEMBER_STATE_LABELS: Record<string, string> = {
  pending: '待审批',
  joined: '在队',
  rejected: '已拒绝',
  left: '已离开',
  removed: '已移出',
}
const MEMBER_STATE_THEMES: Record<string, 'success' | 'default' | 'warning' | 'danger'> = {
  joined: 'success',
  left: 'default',
  removed: 'danger',
}

/** 成员行不是每行唯一：同一用户多次加入＝多段（joined / left / removed），需拼一个唯一 rowKey */
type MemberRow = CampaignMemberRow & { rowId: string }
const toMemberRows = (members: CampaignMemberRow[]): MemberRow[] =>
  members.map((m) => ({ ...m, rowId: `${m.userId}-${m.joinedAt ?? 'x'}-${m.state}` }))

const ROLE_LABELS: Record<string, string> = { creator: '发起人', member: '成员' }

/** 一起运动活动详情弹窗（管理端只读：自取数 + 成员表，无任何写操作） */
export default function CampaignDetailDialog({ id, onClose }: Props) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setDetail(null)
    adminApi
      .campaignDetail(id)
      .then(setDetail)
      .catch((e) => MessagePlugin.error((e as Error).message || '加载活动详情失败'))
      .finally(() => setLoading(false))
  }, [id])

  const items: { label: string; value: string }[] = detail
    ? [
        { label: '活动标题', value: detail.title },
        { label: '可见性', value: VISIBILITY_LABELS[detail.visibility] || detail.visibility },
        { label: '状态', value: campaignStatusMeta(detail.status).label },
        { label: '开始时间', value: fmtDateTime(detail.startAt) },
        { label: '结束时间', value: fmtDateTime(detail.endAt) },
        { label: '人数上限', value: detail.memberLimit == null ? '不限' : `${detail.memberLimit} 人` },
        {
          label: '运动类型',
          value: detail.allowedTypes.length ? detail.allowedTypes.map((t) => typeLabel(t)).join('、') : '不限',
        },
        { label: '创建时间', value: fmtDateTime(detail.createdAt) },
        { label: '更新时间', value: fmtDateTime(detail.updatedAt) },
      ]
    : []

  return (
    <Dialog
      header={detail ? `活动详情 · ${detail.title}` : '活动详情'}
      visible={!!id}
      width={760}
      onClose={onClose}
      destroyOnClose
      confirmBtn={null}
      cancelBtn={{ content: '关闭', variant: 'outline', onClick: onClose }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loading />
        </div>
      ) : detail ? (
        <div style={{ maxHeight: 'calc(80vh - 160px)', overflowY: 'auto' }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag theme={VISIBILITY_THEMES[detail.visibility] || 'default'} variant="light">
              {VISIBILITY_LABELS[detail.visibility] || detail.visibility}
            </Tag>
            <Tag theme={campaignStatusMeta(detail.status).theme} variant="light">
              {campaignStatusMeta(detail.status).label}
            </Tag>
            <span style={{ fontSize: 13, color: 'var(--td-text-color-placeholder, #8a93a6)' }}>活动 ID：{detail.id}</span>
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
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>活动描述</div>
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
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>成员（{detail.members.length}）</div>
            {detail.members.length > 0 ? (
              <Table<MemberRow>
                data={toMemberRows(detail.members)}
                rowKey="rowId"
                size="small"
                bordered
                columns={[
                  { colKey: 'name', title: '昵称', ellipsis: true, cell: ({ row }) => row.name || '微信用户' },
                  { colKey: 'uid', title: 'UID', width: 80, cell: ({ row }) => row.uid ?? '—' },
                  { colKey: 'role', title: '角色', width: 80, cell: ({ row }) => ROLE_LABELS[row.role] || row.role },
                  {
                    colKey: 'state',
                    title: '状态',
                    width: 90,
                    cell: ({ row }) => (
                      <Tag theme={MEMBER_STATE_THEMES[row.state] || 'default'} variant="light">
                        {MEMBER_STATE_LABELS[row.state] || row.state}
                      </Tag>
                    ),
                  },
                  { colKey: 'joinedAt', title: '加入时间', width: 160, cell: ({ row }) => fmtDateTime(row.joinedAt) },
                  { colKey: 'leftAt', title: '离开时间', width: 160, cell: ({ row }) => (row.leftAt ? fmtDateTime(row.leftAt) : '—') },
                  { colKey: 'count', title: '次数', width: 70, cell: ({ row }) => row.count },
                  { colKey: 'distance', title: '距离(km)', width: 90, cell: ({ row }) => fmtKm(row.distance) },
                  { colKey: 'duration', title: '时长', width: 110, cell: ({ row }) => fmtDuration(row.duration) },
                ]}
              />
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
                暂无成员
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder, #8a93a6)', marginTop: 8 }}>
              含已离开 / 已被移出的成员（离开时间为「—」表示仍在队）；贡献仅统计其加入时段
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
