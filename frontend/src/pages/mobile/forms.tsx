/* Các form thao tác hiện trường — gọi API thật qua hooks (toast + invalidate đã có sẵn trong hook). */
import { App } from 'antd'
import { CalendarClock, PackageCheck, Save, SendHorizontal, XOctagon } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  useContract, useCreateReceipt, useFillWeighing, useLsxExtend, useLsxList, useLsxProgress, useLsxReject, useReceipts,
  useTaskFillDelivery, useTaskFillGalv, useTaskReject, useUpdateContract,
} from '@/api/hooks'
import type { Contract, Lsx, Task, Weighing } from '@/api/types'
import { fmtD, fmtKg } from '@/lib/format'
import { fmtN, num, signed, useMob } from './core'
import { Btn, NumInput, PhotoPicker, ReasonBox, ReasonSelect } from './kit'

const toIsoEndOfDay = (d: string) => new Date(d + 'T17:00:00').toISOString()
const dateVal = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* ---------------------------------------------------------------- từ chối (lái xe / xưởng) */
export function RejectForm({ kind, id }: { kind: 'task' | 'lsx'; id: string }) {
  const m = useMob()
  const { message } = App.useApp()
  const taskReject = useTaskReject()
  const lsxReject = useLsxReject()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const reasons = (kind === 'task' ? m.meta?.reasonsTuChoiLx : m.meta?.reasonsTuChoiSx) ?? []
  const busy = taskReject.isPending || lsxReject.isPending
  const submit = async () => {
    if (!reason) { message.error('Vui lòng chọn lý do trước khi gửi.'); return }
    const full = note.trim() ? `${reason} — ${note.trim()}` : reason
    try {
      if (kind === 'task') await taskReject.mutateAsync({ id, reason: full })
      else await lsxReject.mutateAsync({ id, reason: full })
      m.pop()
    } catch { /* hook đã báo lỗi */ }
  }
  return (
    <div className="m-form flat">
      <label className="f-lbl">Lý do từ chối (bắt buộc)</label>
      <ReasonSelect reasons={reasons} value={reason} onChange={setReason} />
      <label className="f-lbl">Diễn giải thêm</label>
      <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={kind === 'task' ? 'Ví dụ: xe vào xưởng bảo dưỡng tới thứ 5…' : 'Ví dụ: máy cắt CNC bảo trì tới thứ 4…'} />
      <div className="f-hint">{kind === 'task' ? 'Quản lý sẽ nhận cảnh báo và giao lại thẻ cho tài xế khác.' : 'Quản lý sẽ nhận cảnh báo và điều phối lại lệnh.'}</div>
      <div className="btn-row"><Btn variant="danger" icon={XOctagon} loading={busy} onClick={submit}>Xác nhận từ chối</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- tiến độ lệnh SX */
export function LsxProgressForm({ x }: { x: Lsx }) {
  const m = useMob()
  const { message } = App.useApp()
  const progress = useLsxProgress()
  const [qty, setQty] = useState(String(x.qtyDone))
  const [kg, setKg] = useState(String(x.kgDone))
  const submit = async () => {
    const q = num(qty), k = num(kg)
    if (qty.trim() === '' || kg.trim() === '' || q < 0 || k < 0) { message.error('Nhập số hợp lệ.'); return }
    if (q > x.qtyPlan || k > x.kgPlan) { message.error(`Tiến độ vượt kế hoạch (${fmtN(x.qtyPlan)} SP · ${fmtN(x.kgPlan)} kg) — kiểm tra lại.`); return }
    if (q < x.qtyDone || k < x.kgDone) { message.error(`Tiến độ mới thấp hơn số đã báo (${fmtN(x.qtyDone)} SP · ${fmtN(x.kgDone)} kg) — kiểm tra lại.`); return }
    try { await progress.mutateAsync({ id: x.id, qtyDone: q, kgDone: k }); m.pop() } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <div className="f-hint" style={{ marginTop: 0, marginBottom: 8 }}>{x.name} — kế hoạch <b>{fmtN(x.qtyPlan)} SP · {fmtN(x.kgPlan)} kg</b>.</div>
      <label className="f-lbl">Số lượng đã hoàn thành (SP)</label>
      <NumInput big inputMode="numeric" value={qty} onChange={setQty} bad={num(qty) > x.qtyPlan} />
      <label className="f-lbl">Khối lượng đã hoàn thành (kg)</label>
      <NumInput big value={kg} onChange={setKg} bad={num(kg) > x.kgPlan} />
      <div className="f-hint">Đạt đủ số lượng kế hoạch → lệnh tự chuyển <b>Hoàn thành</b>.</div>
      <div className="btn-row"><Btn variant="primary" icon={Save} loading={progress.isPending} onClick={submit}>Lưu tiến độ</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- gia hạn lệnh SX (Quản lý) */
export function LsxExtendForm({ x }: { x: Lsx }) {
  const m = useMob()
  const { message } = App.useApp()
  const extend = useLsxExtend()
  const [to, setTo] = useState(dateVal(x.extension?.to ?? x.deadline))
  const [reason, setReason] = useState('')
  const submit = async () => {
    if (!to) { message.error('Chọn hạn hoàn thành mới.'); return }
    if (!reason.trim()) { message.error('Nhập lý do gia hạn.'); return }
    try { await extend.mutateAsync({ id: x.id, to: toIsoEndOfDay(to), reason: reason.trim() }); m.pop() } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <div className="f-hint" style={{ marginTop: 0, marginBottom: 8 }}>Hạn hiện tại <b>{fmtD(x.extension?.to ?? x.deadline)}</b>{x.extension ? ' (đã gia hạn)' : ''}.</div>
      <label className="f-lbl">Hạn hoàn thành mới</label>
      <input type="date" className="inp" value={to} onChange={(e) => setTo(e.target.value)} />
      <label className="f-lbl">Lý do gia hạn (bắt buộc)</label>
      <textarea className="inp" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: khách đổi bản vẽ chi tiết liên kết…" />
      <div className="btn-row"><Btn variant="primary" icon={CalendarClock} loading={extend.isPending} onClick={submit}>Duyệt gia hạn</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- nhập kết quả cân (Thủ kho) */
export function PcFillForm({ p }: { p: Weighing }) {
  const m = useMob()
  const { message } = App.useApp()
  const fill = useFillWeighing()
  const [kg, setKg] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [laiXe, setLaiXe] = useState(p.signers.laiXe || '')
  const v = num(kg)
  const d = v - p.kgExpected
  const lech = v > 0 && Math.abs(d) > m.tol
  const submit = async () => {
    if (!(v > 0)) { message.error('Nhập số kg cân thực tế.'); return }
    if (!photo) { message.error('Bắt buộc ảnh phiếu cân ký 3 bên.'); return }
    if (lech && !reason) { message.error(`Lệch quá ${m.tol} kg — bắt buộc chọn lý do.`); return }
    try {
      await fill.mutateAsync({ id: p.id, kgActual: v, photo, reason: lech ? reason : undefined, reasonNote: lech ? note.trim() : undefined, signerLaiXe: laiXe || undefined })
      m.pop()
    } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <div className="f-hint" style={{ marginTop: 0, marginBottom: 8 }}>HĐ {p.contractId} · {p.lsxId} — lệnh xuất <b>{fmtKg(p.kgExpected)}</b> (dung sai ±{m.tol} kg).</div>
      <label className="f-lbl">Số kg cân thực tế</label>
      <NumInput big value={kg} onChange={setKg} bad={lech} />
      {v > 0 && !lech && <div className="f-hint moss-txt">Khớp lệnh xuất {Math.abs(d) > 0.5 ? `(${signed(d)} kg, trong dung sai)` : '✓'}</div>}
      <label className="f-lbl">Lái xe ký phiếu</label>
      <select className="inp" value={laiXe} onChange={(e) => setLaiXe(e.target.value)}>
        <option value="">— Chọn lái xe —</option>
        {(m.meta?.drivers ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <PhotoPicker label="Ảnh phiếu cân ký 3 bên (bắt buộc)" value={photo} onChange={setPhoto} demo={{ label: `${p.id} · phiếu cân trạm`, kg: v || p.kgExpected }} />
      <ReasonBox show={lech} msg={`Lệch ${signed(d)} kg so với lệnh xuất — bắt buộc chọn lý do`} reasons={m.meta?.reasonsCan ?? []}
        reason={reason} setReason={setReason} note={note} setNote={setNote} />
      <div className="btn-row"><Btn variant="primary" icon={SendHorizontal} loading={fill.isPending} onClick={submit}>Lưu kết quả cân</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- lập phiếu tiếp nhận (Thủ kho) */
export function ReceiptForm({ lsxId: initial }: { lsxId?: string }) {
  const m = useMob()
  const { message } = App.useApp()
  const create = useCreateReceipt()
  const { data: lsxs = [] } = useLsxList()
  const { data: rcs = [] } = useReceipts()
  const options = lsxs.filter((x) => x.status === 'Đang SX' || x.status === 'Hoàn thành')
  const [lsxId, setLsxId] = useState(initial ?? '')
  const [qty, setQty] = useState('')
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const x = options.find((o) => o.id === lsxId)
  const recv = useMemo(() => rcs.filter((r) => r.lsxId === lsxId).reduce((s, r) => ({ qty: s.qty + r.qty, kg: s.kg + r.kg }), { qty: 0, kg: 0 }), [rcs, lsxId])
  const remainKg = x ? x.kgDone - recv.kg : 0
  const over = !!x && num(kg) > remainKg + 0.5
  const submit = async () => {
    if (!lsxId) { message.error('Chọn lệnh sản xuất bàn giao.'); return }
    if (!(num(qty) > 0) || !(num(kg) > 0)) { message.error('SL và kg phải lớn hơn 0.'); return }
    try { await create.mutateAsync({ lsxId, qty: num(qty), kg: num(kg), note: note.trim() }); m.pop() } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <label className="f-lbl">Lệnh sản xuất bàn giao</label>
      <select className="inp" value={lsxId} onChange={(e) => setLsxId(e.target.value)}>
        <option value="">— Chọn lệnh SX —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.contractId} · {o.name}</option>)}
      </select>
      {x && (
        <div className="f-hint">
          SX báo xong <b>{fmtN(x.qtyDone)} SP · {fmtN(x.kgDone)} kg</b> · kho đã nhận {fmtN(recv.qty)} SP · {fmtN(recv.kg)} kg
          → còn <b className={remainKg > 0.5 ? '' : 'moss-txt'}>{fmtN(Math.max(0, remainKg))} kg</b> chưa bàn giao.
        </div>
      )}
      <label className="f-lbl">Số lượng (SP)</label>
      <NumInput big inputMode="numeric" value={qty} onChange={setQty} />
      <label className="f-lbl">Khối lượng (kg)</label>
      <NumInput big value={kg} onChange={setKg} bad={over} />
      {over && <div className="f-hint red-txt">Vượt số SX báo xong chưa bàn giao ({fmtN(remainKg)} kg) — kiểm tra lại.</div>}
      <label className="f-lbl">Ghi chú</label>
      <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đợt 2 — 30 cấu kiện dầm chính" />
      <div className="btn-row"><Btn variant="primary" icon={PackageCheck} loading={create.isPending} onClick={submit}>Lập phiếu tiếp nhận</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- lái xe: điền phiếu đi mạ (ngay trong card) */
export function GalvForm({ t }: { t: Task }) {
  const m = useMob()
  const { message } = App.useApp()
  const fill = useTaskFillGalv()
  const [kg, setKg] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const v = num(kg)
  const d = v - t.kgRequired
  const lech = v > 0 && Math.abs(d) > m.tol
  const submit = async () => {
    if (!(v > 0)) { message.error('Nhập số kg bên mạ cân trước khi gửi.'); return }
    if (!photo) { message.error('Bắt buộc ảnh phiếu cân xưởng mạ — chụp hoặc dùng ảnh demo.'); return }
    if (lech && !reason) { message.error(`Lệch quá ${m.tol} kg — bắt buộc chọn lý do.`); return }
    try { await fill.mutateAsync({ id: t.id, kg: v, photo, reason: lech ? reason : undefined, reasonNote: lech ? note.trim() : undefined }) } catch { /* đã báo */ }
  }
  return (
    <div className="m-form no-open">
      <label className="f-lbl">Số kg bên mạ cân (phiếu mạ in)</label>
      <NumInput big value={kg} onChange={setKg} bad={lech} />
      <div className="f-hint">Cân xuất công ty: <b>{fmtKg(t.kgRequired)}</b> — hai đầu cân phải khớp (dung sai ±{m.tol} kg).</div>
      <PhotoPicker label="Ảnh phiếu cân xưởng mạ (bắt buộc)" value={photo} onChange={setPhoto} demo={{ label: `Phiếu cân xưởng mạ · ${t.id}`, kg: v || t.kgRequired }} />
      <ReasonBox show={lech} msg={`Lệch ${signed(d)} kg so với cân xuất công ty — bắt buộc chọn lý do`} reasons={m.meta?.reasonsCan ?? []}
        reason={reason} setReason={setReason} note={note} setNote={setNote} />
      <div className="btn-row"><Btn variant="primary" icon={SendHorizontal} loading={fill.isPending} onClick={submit}>GỬI PHIẾU</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- lái xe: điền phiếu giao khách */
export function DelivForm({ t }: { t: Task }) {
  const m = useMob()
  const { message } = App.useApp()
  const fill = useTaskFillDelivery()
  const { data: agg } = useContract(t.contractId)
  const [kgp, setKgp] = useState('')
  const [kgd, setKgd] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const p = num(kgp), d = num(kgd)
  const d1 = p - t.kgRequired, d2 = d - p
  const bad1 = p > 0 && Math.abs(d1) > m.tol
  const bad2 = p > 0 && d > 0 && Math.abs(d2) > 0.5
  const lech = bad1 || bad2
  const msg = bad2 ? `Khách ký lệch ${signed(d2)} kg so với số ký với mạ — bắt buộc chọn lý do`
    : `Ký với mạ lệch ${signed(d1)} kg so với yêu cầu — bắt buộc chọn lý do`
  const submit = async () => {
    if (!(p > 0)) { message.error('Nhập kg ký nhận với xưởng mạ.'); return }
    if (!(d > 0)) { message.error('Nhập kg khách ký nhận.'); return }
    if (!photo) { message.error('Bắt buộc ảnh phiếu giao nhận — chụp hoặc dùng ảnh demo.'); return }
    if (lech && !reason) { message.error('Có sai lệch — bắt buộc chọn lý do.'); return }
    try { await fill.mutateAsync({ id: t.id, kgPicked: p, kgDelivered: d, photo, reason: lech ? reason : undefined, reasonNote: lech ? note.trim() : undefined }) } catch { /* đã báo */ }
  }
  return (
    <div className="m-form no-open">
      <label className="f-lbl">Kg ký nhận với xưởng mạ</label>
      <NumInput big value={kgp} onChange={setKgp} bad={bad1} />
      <div className="f-hint">Gợi ý: còn tại mạ <b>{agg ? fmtKg(agg.atGalvKg) : '…'}</b> · thẻ yêu cầu {fmtKg(t.kgRequired)}.</div>
      <label className="f-lbl">Kg khách ký nhận</label>
      <NumInput big value={kgd} onChange={setKgd} bad={bad2} />
      <PhotoPicker label="Ảnh phiếu giao nhận (ký mạ + ký khách)" value={photo} onChange={setPhoto} demo={{ label: `Phiếu giao nhận · ${t.id}`, kg: d || t.kgRequired }} />
      <ReasonBox show={lech} msg={msg} reasons={m.meta?.reasonsCan ?? []} reason={reason} setReason={setReason} note={note} setNote={setNote} />
      <div className="btn-row"><Btn variant="primary" icon={SendHorizontal} loading={fill.isPending} onClick={submit}>GỬI PHIẾU</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- Quản lý: sửa đơn giá / tạm ứng / hạn trả HĐ */
export function ContractEditForm({ c, onDone }: { c: Contract; onDone: () => void }) {
  const { message } = App.useApp()
  const update = useUpdateContract()
  const [price, setPrice] = useState(String(c.unitPrice))
  const [pct, setPct] = useState(String(c.advance?.pct ?? 0))
  const [due, setDue] = useState(dateVal(c.dueAt))
  const submit = async () => {
    const up = num(price), ap = num(pct)
    if (!(up > 0)) { message.error('Đơn giá phải lớn hơn 0.'); return }
    if (ap < 0 || ap > 100) { message.error('% tạm ứng phải trong khoảng 0–100.'); return }
    try {
      await update.mutateAsync({ id: c.id, unitPrice: up, advancePct: ap, dueAt: due ? toIsoEndOfDay(due) : undefined })
      onDone()
    } catch { /* đã báo */ }
  }
  return (
    <div className="m-form">
      <label className="f-lbl">Đơn giá (₫/kg) — giá trị HĐ tự tính lại theo tổng kg</label>
      <NumInput big value={price} onChange={setPrice} />
      <label className="f-lbl">Tạm ứng theo HĐ (%)</label>
      <NumInput big value={pct} onChange={setPct} bad={num(pct) > 100} />
      <label className="f-lbl">Hạn kế toán trả hợp đồng</label>
      <input type="date" className="inp" value={due} onChange={(e) => setDue(e.target.value)} />
      <div className="btn-row">
        <Btn variant="primary" icon={Save} loading={update.isPending} onClick={submit}>Lưu thay đổi</Btn>
        <Btn flex={0.55} onClick={onDone}>Hủy</Btn>
      </div>
    </div>
  )
}
