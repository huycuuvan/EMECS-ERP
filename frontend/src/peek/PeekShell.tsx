/* Khung chung của một drawer bản ghi: header tối (nhãn loại · mã · trạng thái · dòng phụ · nút thao tác) + thân.
   Dùng trong mọi component drawer ở peek/drawers/*. */
import { Button, Result, Skeleton, Space } from 'antd'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { DeleteButton } from '@/components/DeleteRecord'
import { StatusTag } from '@/components/ui'
import { usePeek } from './context'
import { PEEK_META, type PeekType } from './meta'

interface Props {
  type: PeekType
  id: string
  status?: string
  sub?: ReactNode
  actions?: ReactNode
  loading?: boolean
  notFound?: boolean
  children?: ReactNode
}

/** Loại bản ghi xóa được từ drawer → API xóa (chỉ Quản lý; máy chủ chặn khi còn chứng từ phía sau). */
const DELETE_API: Partial<Record<PeekType, string>> = {
  dh: '/orders', hd: '/contracts', lsx: '/lsx', ptn: '/receipts', pc: '/weighings', vc: '/tasks',
}

export default function PeekShell({ type, id, status, sub, actions, loading, notFound, children }: Props) {
  const { close } = usePeek()
  const meta = PEEK_META[type]
  const Icon = meta.icon
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '18px 24px 20px', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--rust-2)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 700 }}>
            <Icon size={15} />{meta.label}
          </span>
          <Space size={6}>
            {actions}
            {DELETE_API[type] && !loading && !notFound && (
              <DeleteButton ghost url={`${DELETE_API[type]}/${encodeURIComponent(id)}`} label={`${meta.label.toLowerCase()} ${id}`} onDone={close} />
            )}
            <Button shape="circle" size="small" ghost icon={<X size={14} />} onClick={close} aria-label="Đóng" />
          </Space>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.01em' }}>{id}</span>
          {status && <StatusTag status={status} />}
        </div>
        {sub && <div style={{ color: 'var(--ash-3)', marginTop: 6, fontSize: 13.5 }}>{sub}</div>}
      </div>
      <div style={{ padding: '6px 24px 32px', flex: 1 }}>
        {loading ? <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 20 }} />
          : notFound ? <Result status="404" title="Không tìm thấy bản ghi" subTitle={id} />
            : children}
      </div>
    </div>
  )
}
