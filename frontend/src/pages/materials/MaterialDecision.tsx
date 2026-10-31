/* Quản lý Duyệt / Từ chối phiếu nhập NVL (anh Thắng 31/10: kho nhập → Quản lý duyệt mới tính thống kê / kho ảo;
   đã duyệt thì không sửa, không xóa). Dùng ở trang Nguyên liệu và Dashboard. Người khác thấy "Chờ Quản lý duyệt". */
import { App, Button, Input } from 'antd'
import { Check, X } from 'lucide-react'
import { useApproveMaterial, useRejectMaterial } from '@/api/hooksMaster'
import { useAuth } from '@/lib/auth'
import { fmtKg } from '@/lib/format'

export default function MaterialDecision({ m }: { m: { id: string; supplier: string; kg: number; kgSupplier: number | null } }) {
  const { hasRole } = useAuth()
  const { modal } = App.useApp()
  const approve = useApproveMaterial()
  const reject = useRejectMaterial()
  if (!hasRole('admin')) return <span className="caption">Chờ Quản lý duyệt</span>
  const d = m.kgSupplier != null ? m.kg - m.kgSupplier : 0
  const askApprove = () => modal.confirm({
    title: `Duyệt phiếu nhập ${m.id}?`, okText: 'Duyệt', cancelText: 'Hủy',
    content: <p style={{ margin: 0 }}>{m.supplier} · cân thực tế <b>{fmtKg(m.kg)}</b>
      {m.kgSupplier != null && <> · NCC {fmtKg(m.kgSupplier)}{Math.abs(d) > 0.5 && <> — <b className="text-signal">{d > 0 ? 'thừa' : 'thiếu'} {fmtKg(Math.abs(d))}</b> (ghi vào kho ảo)</>}</>}.
      <br />Đã duyệt thì phiếu <b>không sửa, không xóa</b> được nữa.</p>,
    onOk: () => approve.mutateAsync(m.id),
  })
  const askReject = () => {
    let reason = ''
    modal.confirm({
      title: `Từ chối phiếu nhập ${m.id}?`, okText: 'Từ chối', okButtonProps: { danger: true }, cancelText: 'Hủy',
      content: <Input.TextArea autoFocus rows={2} placeholder="Lý do (bắt buộc) — VD: thiếu ảnh hóa đơn NCC, cân lại" onChange={(e) => { reason = e.target.value }} />,
      onOk: () => (reason.trim() ? reject.mutateAsync({ id: m.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <Button size="small" type="primary" icon={<Check size={13} />} loading={approve.isPending} onClick={askApprove}>Duyệt</Button>
      <Button size="small" danger icon={<X size={13} />} onClick={askReject}>Từ chối</Button>
    </span>
  )
}
