/* Tiền về chờ Quản lý duyệt: kế toán nhập tay → Quản lý Duyệt / Từ chối (có lý do). Chỉ khoản đã duyệt mới tính vào
   tiền đã về, tạm ứng và công nợ. Dùng trong drawer Hợp đồng và Dashboard. */
import { App, Button, Input } from 'antd'
import { Check, Hourglass, X } from 'lucide-react'
import { useApprovePayment, useRejectPayment } from '@/api/hooks'
import type { Payment } from '@/api/types'
import { Sec, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT, money } from '@/lib/format'
import { MODAL_Z } from './utils'

export function PaymentDecision({ p, size = 'small' }: { p: Payment; size?: 'small' | 'middle' }) {
  const { hasRole } = useAuth()
  const { modal } = App.useApp()
  const approve = useApprovePayment()
  const reject = useRejectPayment()
  if (!hasRole('admin')) return <span className="caption">Chờ Quản lý duyệt</span>
  const askReject = () => {
    let reason = ''
    modal.confirm({
      title: `Từ chối khoản tiền về ${money(p.amount)}?`, zIndex: MODAL_Z, okText: 'Từ chối', okButtonProps: { danger: true }, cancelText: 'Hủy',
      content: <Input.TextArea autoFocus rows={2} placeholder="Lý do (bắt buộc) — VD: sai số tiền, chưa thấy tiền về tài khoản"
        onChange={(e) => { reason = e.target.value }} />,
      onOk: () => (reason.trim() ? reject.mutateAsync({ pid: p.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <Button size={size} type="primary" icon={<Check size={13} />} loading={approve.isPending} onClick={() => approve.mutate(p.id)}>Duyệt</Button>
      <Button size={size} danger icon={<X size={13} />} onClick={askReject}>Từ chối</Button>
    </span>
  )
}

export default function PaymentApprovals({ payments }: { payments: Payment[] }) {
  const rows = payments.filter((p) => p.status !== 'Đã duyệt')
  if (!rows.length) return null
  return (
    <>
      <Sec icon={<Hourglass />}>Tiền về chờ duyệt / bị từ chối</Sec>
      <table className="pk-items" style={{ marginBottom: 12 }}>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDT(p.date)}<div className="sub-soft">{p.createdBy || '—'} nhập</div></td>
              <td>{p.type}{p.note && <div className="sub-soft">{p.note}</div>}
                {p.rejectReason && <div className="sub-soft" style={{ color: 'var(--signal)' }}>Lý do: {p.rejectReason} — {p.approvedBy}</div>}</td>
              <td className="r"><b className="num">{money(p.amount)}</b></td>
              <td className="r">{p.status === 'Chờ duyệt' ? <PaymentDecision p={p} /> : <StatusTag status={p.status} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
