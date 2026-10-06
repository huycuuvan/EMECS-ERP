/* Gia hạn trả hợp đồng (ghi chú khảo sát ý 10): hạn trả HĐ sắp tới / quá mà khách chưa ký trả về →
   kế toán nhập lý do xin gia hạn → Quản lý Duyệt (+5 ngày, tính từ hạn hiện tại) hoặc Từ chối (có lý do).
   Dùng trong drawer Hợp đồng, bảng Hợp đồng và Dashboard. */
import { App, Button, Input } from 'antd'
import { CalendarPlus, Check, History, X } from 'lucide-react'
import { useApproveExtension, useRejectExtension, useRequestExtension } from '@/api/hooks'
import type { CompleteInfo, Contract, ContractExtension } from '@/api/types'
import { Sec, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtDT } from '@/lib/format'
import { MODAL_Z } from './utils'

/** Kế toán được xin khi: chưa nhận về, có hạn trả, hạn sắp tới / đã quá, chưa có yêu cầu đang chờ. */
export function canAskExtension(c: Contract, complete: CompleteInfo, pending: boolean) {
  return !pending && !!c.completeBy && !['Đã nhận về', 'Đã hoàn thành'].includes(c.status)
    && (complete.state === 'soon' || complete.state === 'overdue')
}

export function useAskExtension() {
  const { modal } = App.useApp()
  const req = useRequestExtension()
  return (c: Contract, days = 5) => {
    let reason = ''
    modal.confirm({
      title: `Xin gia hạn trả hợp đồng ${c.number || c.id} thêm ${days} ngày`, zIndex: MODAL_Z, icon: <CalendarPlus size={20} color="var(--amber)" />,
      okText: 'Gửi Quản lý duyệt', cancelText: 'Hủy',
      content: (
        <>
          <p style={{ margin: '0 0 8px' }}>Hạn trả hiện tại <b>{fmtD(c.completeBy)}</b>. Quản lý duyệt thì hạn mới tự cộng thêm {days} ngày.</p>
          <Input.TextArea autoFocus rows={3} placeholder="Lý do (bắt buộc) — VD: khách đi công tác chưa ký, chờ khách xác nhận khối lượng…"
            onChange={(e) => { reason = e.target.value }} />
        </>
      ),
      onOk: () => (reason.trim() ? req.mutateAsync({ cid: c.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
}

/** Nút Duyệt / Từ chối của Quản lý (người khác thấy "Chờ Quản lý duyệt"). */
export function ExtensionDecision({ e }: { e: ContractExtension }) {
  const { hasRole } = useAuth()
  const { modal } = App.useApp()
  const approve = useApproveExtension()
  const reject = useRejectExtension()
  if (!hasRole('admin')) return <span className="caption">Chờ Quản lý duyệt</span>
  const askReject = () => {
    let reason = ''
    modal.confirm({
      title: 'Không duyệt gia hạn?', zIndex: MODAL_Z, okText: 'Từ chối', okButtonProps: { danger: true }, cancelText: 'Hủy',
      content: <Input.TextArea autoFocus rows={2} placeholder="Lý do (bắt buộc) — VD: đã gia hạn 1 lần, yêu cầu gửi khách ngay"
        onChange={(ev) => { reason = ev.target.value }} />,
      onOk: () => (reason.trim() ? reject.mutateAsync({ eid: e.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }} onClick={(ev) => ev.stopPropagation()}>
      <Button size="small" type="primary" icon={<Check size={13} />} loading={approve.isPending} onClick={() => approve.mutate(e.id)}>Duyệt +{e.days} ngày</Button>
      <Button size="small" danger icon={<X size={13} />} onClick={askReject}>Từ chối</Button>
    </span>
  )
}

/** Mục trong drawer: yêu cầu đang chờ + lịch sử các lần gia hạn. */
export default function ExtensionsBlock({ list }: { list: ContractExtension[] }) {
  if (!list.length) return null
  return (
    <>
      <Sec icon={<History />}>Gia hạn trả hợp đồng</Sec>
      <div style={{ display: 'grid', gap: 8 }}>
        {[...list].reverse().map((e) => (
          <div key={e.id} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '10px 12px', background: e.status === 'Chờ duyệt' ? 'var(--amber-soft)' : 'var(--canvas)', display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><StatusTag status={e.status} /> <b>+{e.days} ngày</b> · {e.requestedBy} xin lúc {fmtDT(e.requestedAt)}</span>
              {e.status === 'Chờ duyệt' && <ExtensionDecision e={e} />}
            </div>
            <div>Lý do: {e.reason}</div>
            {e.status === 'Đã duyệt' && <div className="caption">Hạn {fmtD(e.oldBy)} → <b>{fmtD(e.newBy)}</b> · {e.decidedBy} duyệt {fmtDT(e.decidedAt)}</div>}
            {e.status === 'Từ chối' && <div className="caption" style={{ color: 'var(--signal)' }}>{e.decidedBy} không duyệt: {e.rejectReason}</div>}
          </div>
        ))}
      </div>
    </>
  )
}
