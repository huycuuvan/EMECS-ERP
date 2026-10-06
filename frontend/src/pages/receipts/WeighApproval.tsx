/* Kết quả cân xuất của phiếu chuẩn bị hàng + Quản lý Duyệt / Từ chối (chỉ ở màn Chuẩn bị hàng; không qua sai lệch / kho ảo). */
import { App, Button, Input } from 'antd'
import { Check, Scale, X } from 'lucide-react'
import { useApproveWeighing, useRejectWeighing } from '@/api/hooks'
import type { Weighing } from '@/api/types'
import { StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtNum } from '@/lib/format'

export const canWeighAgain = (p: Weighing) => p.status === 'Chờ cân' || p.status === 'QL từ chối'

export function WeighResult({ p }: { p?: Weighing }) {
  if (!p) return <span className="text-ash">—</span>
  if (p.kgActual == null) return <StatusTag status="Chờ cân" />
  const dev = p.kgExpected ? ((p.kgActual - p.kgExpected) / p.kgExpected) * 100 : 0
  return (
    <div style={{ fontSize: 12 }}>
      <b className="num">{fmtNum(p.kgActual)} kg</b> <span style={{ color: p.status === 'Đã cân' ? 'var(--moss)' : 'var(--signal)' }}>({dev > 0 ? '+' : ''}{dev.toFixed(1)}%)</span>
      <div style={{ marginTop: 3 }}><StatusTag status={p.status === 'Đã cân' ? (p.approvedBy ? 'Đã duyệt' : 'Đạt') : p.status} /></div>
      {p.reason && p.status !== 'Đã cân' && <div className="sub-soft">Lý do: {p.reason}{p.reasonNote ? ` — ${p.reasonNote}` : ''}</div>}
      {p.status === 'QL từ chối' && <div className="sub-soft" style={{ color: 'var(--signal)' }}>QL từ chối: {p.rejectReason} — kho cân lại</div>}
      {p.status === 'Đã cân' && p.approvedBy && <div className="sub-soft">{p.approvedBy} duyệt · lý do {p.reason}</div>}
    </div>
  )
}

export function WeighActions({ p, onWeigh }: { p?: Weighing; onWeigh?: (p: Weighing) => void }) {
  const { can, hasRole } = useAuth()
  const { modal } = App.useApp()
  const approve = useApproveWeighing()
  const reject = useRejectWeighing()
  if (!p) return null
  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f() }
  const askReject = () => {
    let reason = ''
    modal.confirm({
      title: `Từ chối kết quả cân ${p.id}?`, okText: 'Từ chối', okButtonProps: { danger: true }, cancelText: 'Hủy',
      content: <Input.TextArea autoFocus rows={2} placeholder="Lý do (bắt buộc) — VD: cân lại, kiểm tra số xe" onChange={(e) => { reason = e.target.value }} />,
      onOk: () => (reason.trim() ? reject.mutateAsync({ id: p.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
      {canWeighAgain(p) && can('phieu-can', 'edit') && onWeigh && (
        <Button size="small" type="primary" icon={<Scale size={12} />} onClick={stop(() => onWeigh(p))}>{p.status === 'QL từ chối' ? 'Cân lại' : 'Cân'}</Button>
      )}
      {p.status === 'Chờ QL duyệt' && hasRole('admin') && <>
        <Button size="small" type="primary" icon={<Check size={12} />} loading={approve.isPending} onClick={stop(() => approve.mutate(p.id))}>Duyệt</Button>
        <Button size="small" danger icon={<X size={12} />} onClick={stop(askReject)}>Từ chối</Button>
      </>}
    </span>
  )
}
