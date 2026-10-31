/* Gia hạn soạn thảo hợp đồng (ghi chú khảo sát ý 10; 31/10 đổi từ gia hạn trả HĐ): hạn soạn thảo sắp tới / quá mà chưa soạn xong →
   kế toán nhập lý do xin gia hạn → Quản lý Duyệt và tự điền số ngày (tính từ hạn hiện tại) hoặc Từ chối (có lý do).
   Dùng trong drawer Hợp đồng, bảng Hợp đồng và Dashboard. Yêu cầu đang chờ hiện thành khung vàng ở ĐẦU Dashboard và
   trang Hợp đồng (PendingExtensionsPanel — anh Thắng 31/10: trước nằm giữa dashboard, Quản lý không thấy HĐ nào xin). */
import { App, Button, Input, InputNumber } from 'antd'
import dayjs from 'dayjs'
import { CalendarPlus, Check, ExternalLink, History, X } from 'lucide-react'
import { useState } from 'react'
import { useApproveExtension, useRejectExtension, useRequestExtension } from '@/api/hooks'
import type { CompleteInfo, Contract, ContractExtension, PendingExtension } from '@/api/types'
import { CompleteChip, Sec, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtDT } from '@/lib/format'
import { usePeek } from '@/peek/context'
import { MODAL_Z } from './utils'

/** Kế toán được xin khi: chưa soạn thảo, có hạn soạn thảo, hạn sắp tới / đã quá, chưa có yêu cầu đang chờ. */
export function canAskExtension(c: Contract, complete: CompleteInfo, pending: boolean) {
  return !pending && !!c.completeBy && c.status === 'Chờ soạn thảo'
    && (complete.state === 'soon' || complete.state === 'overdue')
}

export function useAskExtension() {
  const { modal } = App.useApp()
  const req = useRequestExtension()
  return (c: Contract) => {
    let reason = ''
    modal.confirm({
      title: `Xin gia hạn soạn thảo hợp đồng ${c.number || c.id}`, zIndex: MODAL_Z, icon: <CalendarPlus size={20} color="var(--amber)" />,
      okText: 'Gửi Quản lý duyệt', cancelText: 'Hủy',
      content: (
        <>
          <p style={{ margin: '0 0 8px' }}>Hạn soạn thảo hiện tại <b>{fmtD(c.completeBy)}</b>. Quản lý duyệt và điền số ngày gia hạn.</p>
          <Input.TextArea autoFocus rows={3} placeholder="Lý do (bắt buộc) — VD: chờ khách xác nhận khối lượng / đơn giá, thiếu thông tin bên mua…"
            onChange={(e) => { reason = e.target.value }} />
        </>
      ),
      onOk: () => (reason.trim() ? req.mutateAsync({ cid: c.id, reason: reason.trim() }) : Promise.reject(new Error('Nhập lý do'))),
    })
  }
}

/** Nút Duyệt / Từ chối của Quản lý (người khác thấy "Chờ Quản lý duyệt"). */
export function ExtensionDecision({ e, label }: { e: ContractExtension; label?: string }) {
  const { hasRole } = useAuth()
  const { modal } = App.useApp()
  const approve = useApproveExtension()
  const reject = useRejectExtension()
  if (!hasRole('admin')) return <span className="caption">Chờ Quản lý duyệt</span>
  const askApprove = () => {
    let days: number | null = e.days || 5
    modal.confirm({
      title: `Duyệt gia hạn soạn thảo hợp đồng ${label ?? e.contractId}`, zIndex: MODAL_Z, okText: 'Duyệt gia hạn', cancelText: 'Hủy', icon: <CalendarPlus size={20} color="var(--moss)" />,
      content: <ApproveForm e={e} days={days} onChange={(v) => { days = v }} />,
      onOk: () => (days && days >= 1 ? approve.mutateAsync({ eid: e.id, days }) : Promise.reject(new Error('Nhập số ngày'))),
    })
  }
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
      <Button size="small" type="primary" icon={<Check size={13} />} loading={approve.isPending} onClick={askApprove}>Duyệt…</Button>
      <Button size="small" danger icon={<X size={13} />} onClick={askReject}>Từ chối</Button>
    </span>
  )
}

function ApproveForm({ e, days: init, onChange }: { e: ContractExtension; days: number; onChange: (v: number | null) => void }) {
  const [days, setDays] = useState<number | null>(init)
  return (
    <>
      <p style={{ margin: '0 0 4px' }}>{e.requestedBy} xin lúc {fmtDT(e.requestedAt)} · lý do: <b>{e.reason}</b></p>
      <p style={{ margin: '0 0 8px' }}>Hạn soạn thảo hiện tại <b>{fmtD(e.oldBy)}</b></p>
      <InputNumber autoFocus min={1} max={365} precision={0} value={days} addonBefore="Gia hạn thêm" addonAfter="ngày"
        style={{ width: '100%' }} onChange={(v) => { setDays(v); onChange(v) }} />
      {e.oldBy && days ? <p style={{ margin: '8px 0 0' }}>Hạn mới: <b>{fmtD(dayjs(e.oldBy).add(days, 'day').toISOString())}</b></p> : null}
    </>
  )
}

/** Khung vàng ở đầu Dashboard / trang Hợp đồng: từng hợp đồng đang xin gia hạn — số HĐ, khách, hạn hiện tại, ai xin,
    lý do; Quản lý Duyệt / Từ chối ngay tại đây, bấm "Mở hợp đồng" để xem chi tiết. */
export function PendingExtensionsPanel({ list }: { list: PendingExtension[] }) {
  const { open } = usePeek()
  const { hasRole } = useAuth()
  if (!list.length) return null
  return (
    <div className="ext-panel">
      <div className="ext-panel-title">
        <CalendarPlus size={17} />
        {hasRole('admin') ? 'Kế toán xin gia hạn soạn thảo hợp đồng — chờ Quản lý duyệt' : 'Đang chờ Quản lý duyệt gia hạn soạn thảo hợp đồng'}
        <span className="ext-panel-count">{list.length}</span>
      </div>
      {list.map((e) => (
        <div key={e.id} className="ext-row">
          <div className="ext-row-main">
            <div>
              <a className="mono ext-row-id" onClick={() => open('hd', e.contractId)}>{e.contractId}</a>
              {e.number && <span className="mono caption"> · Số HĐ {e.number}</span>}
              <span> · <b>{e.customer}</b></span>
            </div>
            <div className="ext-row-meta">
              Hạn soạn thảo {fmtD(e.completeBy ?? e.oldBy)} {e.complete && <CompleteChip info={e.complete} />}
            </div>
            <div><b>{e.requestedBy}</b> xin lúc {fmtDT(e.requestedAt)} · Lý do: {e.reason}</div>
          </div>
          <div className="ext-row-actions">
            <Button size="small" icon={<ExternalLink size={13} />} onClick={() => open('hd', e.contractId)}>Mở hợp đồng</Button>
            <ExtensionDecision e={e} label={e.number || e.contractId} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Mục trong drawer: yêu cầu đang chờ + lịch sử các lần gia hạn. */
export default function ExtensionsBlock({ list }: { list: ContractExtension[] }) {
  if (!list.length) return null
  return (
    <>
      <Sec icon={<History />}>Gia hạn soạn thảo hợp đồng</Sec>
      <div style={{ display: 'grid', gap: 8 }}>
        {[...list].reverse().map((e) => (
          <div key={e.id} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '10px 12px', background: e.status === 'Chờ duyệt' ? 'var(--amber-soft)' : 'var(--canvas)', display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span><StatusTag status={e.status} />{e.status === 'Đã duyệt' && <> <b>+{e.days} ngày</b></>} · {e.requestedBy} xin lúc {fmtDT(e.requestedAt)}</span>
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
