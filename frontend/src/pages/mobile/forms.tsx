/* Các form thao tác hiện trường — gọi API thật qua hooks (toast + invalidate đã có sẵn trong hook). */
import { App } from 'antd'
import { CalendarClock, PackageCheck, Save, SendHorizontal, XOctagon } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  useContract, useCreateReceipt, useFillWeighing, useLsxExtend, useLsxList, useLsxDaily, useLsxReject, useReceipts,
  useTaskFillDelivery, useTaskFillGalv, useTaskReject, useUpdateContract,
} from '@/api/hooks'
import type { Contract, Lsx, Task, Weighing } from '@/api/types'
import { fmtD, fmtDT, fmtKg } from '@/lib/format'
import { fmtN, num, signed, useMob } from './core'
import { perUnit, useContractGoods } from '../receipts/ContractGoods'
import AssignedGoods from '../weighings/AssignedGoods'
import { useCreateMaterial } from '@/api/hooksMaster'
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

/* ---------------------------------------------------------------- sản lượng theo ngày (xưởng) */
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function LsxProgressForm({ x }: { x: Lsx }) {
  const m = useMob()
  const { message } = App.useApp()
  const daily = useLsxDaily()
  const [day, setDay] = useState(localDay())
  const cur = x.daily.find((d) => d.day === day)
  const [kg, setKg] = useState(cur ? String(cur.kg) : '')
  const [note, setNote] = useState(cur?.note ?? '')
  const pick = (d: string) => { setDay(d); const e = x.daily.find((z) => z.day === d); setKg(e ? String(e.kg) : ''); setNote(e?.note ?? '') }
  const after = x.kgDone - (cur?.kg ?? 0) + num(kg)
  const submit = async () => {
    if (kg.trim() === '' || num(kg) < 0) { message.error('Nhập số kg làm được trong ngày (không làm thì nhập 0).'); return }
    try { await daily.mutateAsync({ id: x.id, day, kg: num(kg), note: note.trim() }); m.pop() } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <div className="f-hint" style={{ marginTop: 0, marginBottom: 8 }}>{x.name} — kế hoạch <b>{fmtN(x.kgPlan)} kg</b> · đã làm <b>{fmtN(x.kgDone)} kg</b>.</div>
      <label className="f-lbl">Ngày</label>
      <input type="date" className="inp" value={day} max={localDay()} onChange={(e) => pick(e.target.value)} />
      <label className="f-lbl">Khối lượng làm được trong ngày (kg)</label>
      <NumInput big value={kg} onChange={setKg} />
      <div className="f-hint">Hôm nào không làm thì nhập <b>0</b>. Hạn nhập trước <b>20h</b> mỗi ngày.</div>
      {cur && <div className="f-hint" style={{ color: 'var(--amber)' }}>Ngày này đã nhập <b>{fmtN(cur.kg)} kg</b> lúc {fmtDT(cur.updatedAt ?? cur.createdAt)} — lưu lại sẽ sửa số (Quản lý được báo).</div>}
      <label className="f-lbl">Ghi chú (tùy chọn)</label>
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: nghỉ chờ vật tư" />
      <div className="f-hint">Sau khi lưu: lũy kế <b>{fmtN(after)} / {fmtN(x.kgPlan)} kg</b>{after >= x.kgPlan && x.kgPlan > 0 ? ' — lệnh chuyển Hoàn thành' : ''}.</div>
      <div className="btn-row"><Btn variant="primary" icon={Save} loading={daily.isPending} onClick={submit}>Lưu sản lượng</Btn></div>
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
  const pct = m.meta?.pcTolerancePct ?? 5
  const nowLocal = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const [gross, setGross] = useState('')
  const [tare, setTare] = useState('')
  const [inAt, setInAt] = useState(nowLocal(new Date(Date.now() - 30 * 60000)))
  const [outAt, setOutAt] = useState(nowLocal())
  const [plate, setPlate] = useState(p.vehiclePlate ?? '')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const v = gross !== '' && tare !== '' ? Math.round((num(gross) - num(tare)) * 1000) / 1000 : 0
  const dev = v > 0 && p.kgExpected ? ((v - p.kgExpected) / p.kgExpected) * 100 : 0
  const lech = v > 0 && p.kgExpected > 0 && (v > p.kgExpected || -dev > pct)  // thiếu quá pct% hoặc dư → lý do + duyệt
  const submit = async () => {
    if (!(num(gross) > 0) || tare === '') { message.error('Nhập trọng lượng xe + hàng và trọng lượng xe.'); return }
    if (num(tare) > num(gross)) { message.error('Trọng lượng xe lớn hơn tổng xe + hàng — kiểm tra lại.'); return }
    if (!inAt || !outAt || outAt < inAt) { message.error('Giờ cân ra phải sau giờ cân vào.'); return }
    if (!photo) { message.error('Bắt buộc chụp ảnh phiếu cân.'); return }
    if (lech && !reason) { message.error(v > p.kgExpected ? 'Cân lớn hơn số giao — bắt buộc chọn lý do.' : `Cân thiếu quá ${pct}% — bắt buộc chọn lý do.`); return }
    try {
      await fill.mutateAsync({
        id: p.id, grossKg: num(gross), tareKg: num(tare), weighInAt: new Date(inAt).toISOString(), weighOutAt: new Date(outAt).toISOString(),
        vehiclePlate: plate || undefined, photo, reason: lech ? reason : undefined, reasonNote: lech ? note.trim() : undefined,
      })
      m.pop()
    } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <div className="f-hint" style={{ marginTop: 0, marginBottom: 8 }}>HĐ {p.contractId} · {p.lsxId} — Quản lý giao <b>{fmtKg(p.kgExpected)}</b> (thiếu quá {pct}% hoặc dư → nhập lý do, chờ duyệt).</div>
      <AssignedGoods receiptId={p.receiptId} compact />
      <label className="f-lbl">Trọng lượng xe + hàng (kg)</label>
      <NumInput big value={gross} onChange={setGross} />
      <label className="f-lbl">Trọng lượng xe (kg)</label>
      <NumInput big value={tare} onChange={setTare} bad={tare !== '' && num(tare) > num(gross)} />
      <div className="f-hint" style={{ fontSize: 15 }}>Trọng lượng hàng: <b className={lech ? 'red-txt' : 'moss-txt'}>{v > 0 ? `${fmtN(v)} kg` : '—'}</b>
        {v > 0 && p.kgExpected > 0 && <> ({dev > 0 ? '+' : ''}{dev.toFixed(1)}% so với giao)</>}</div>
      <label className="f-lbl">Giờ cân vào</label>
      <input type="datetime-local" className="inp" value={inAt} onChange={(e) => setInAt(e.target.value)} />
      <label className="f-lbl">Giờ cân ra</label>
      <input type="datetime-local" className="inp" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
      <label className="f-lbl">Biển số xe</label>
      <input className="inp" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="VD: 29C-123.45" />
      {p.signers.laiXe && <div className="f-hint">Tài xế (Quản lý chỉ định): <b>{p.signers.laiXe}</b></div>}
      {p.status === 'QL từ chối' && <div className="f-hint red-txt">Quản lý từ chối lần cân trước: {p.rejectReason} — cân lại.</div>}
      <PhotoPicker label="Ảnh phiếu cân (bắt buộc)" value={photo} onChange={setPhoto} demo={{ label: `${p.id} · phiếu cân`, kg: v || p.kgExpected }} />
      <ReasonBox show={lech} msg={`${dev > 0 ? 'Dư' : 'Thiếu'} ${dev > 0 ? '+' : ''}${dev.toFixed(1)}% (${signed(v - p.kgExpected)} kg) so với Quản lý giao — chọn lý do, chờ Quản lý duyệt`} reasons={m.meta?.reasonsCan ?? []}
        reason={reason} setReason={setReason} note={note} setNote={setNote} />
      <div className="btn-row"><Btn variant="primary" icon={SendHorizontal} loading={fill.isPending} onClick={submit}>Lưu kết quả cân</Btn></div>
    </div>
  )
}

/* ---------------------------------------------------------------- lập phiếu chuẩn bị hàng (Thủ kho) */
export function ReceiptForm({ lsxId: initial }: { lsxId?: string }) {
  const m = useMob()
  const { message } = App.useApp()
  const create = useCreateReceipt()
  const { data: lsxs = [] } = useLsxList()
  const { data: rcs = [] } = useReceipts()
  const options = lsxs.filter((x) => x.status === 'Đang SX' || x.status === 'Hoàn thành')
  const [lsxId, setLsxId] = useState(initial ?? '')
  const [cid, setCid] = useState(options.find((o) => o.id === initial)?.contractId ?? '')
  const cids = [...new Set(options.map((o) => o.contractId))]
  const ofC = options.filter((o) => o.contractId === cid)
  const goods = useContractGoods(cid || undefined)
  const [qtys, setQtys] = useState<Record<number, string>>({})
  const qLines = (goods.order?.items ?? []).filter((i) => num(qtys[i.id!] ?? '') > 0)
  const autoKg = Math.round(qLines.reduce((s, i) => s + num(qtys[i.id!]) * perUnit(i), 0) * 1000) / 1000
  const pickC = (c: string) => { setCid(c); const l = options.filter((o) => o.contractId === c); setLsxId(l.length === 1 ? l[0].id : '') }
  const [kg, setKg] = useState('')
  const [note, setNote] = useState('')
  const x = options.find((o) => o.id === lsxId)
  const recv = useMemo(() => rcs.filter((r) => r.lsxId === lsxId).reduce((s, r) => ({ qty: s.qty + r.qty, kg: s.kg + r.kg }), { qty: 0, kg: 0 }), [rcs, lsxId])
  const remainKg = x ? x.kgDone - recv.kg : 0
  const over = !!x && (autoKg || num(kg)) > remainKg + 0.5
  const submit = async () => {
    if (!lsxId) { message.error('Chọn lệnh sản xuất bàn giao.'); return }
    const items = qLines.map((i) => ({ itemId: i.id!, qty: num(qtys[i.id!]) }))
    if (!items.length && !(num(kg) > 0)) { message.error('Nhập số lượng từng mặt hàng (hoặc khối lượng).'); return }
    try { await create.mutateAsync({ lsxId, note: note.trim(), ...(items.length ? { items } : { kg: num(kg) }) }); m.pop() } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <label className="f-lbl">Hợp đồng</label>
      <select className="inp" value={cid} onChange={(e) => pickC(e.target.value)}>
        <option value="">— Chọn hợp đồng —</option>
        {cids.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="f-lbl">Lệnh sản xuất bàn giao</label>
      <select className="inp" value={lsxId} onChange={(e) => setLsxId(e.target.value)} disabled={!cid}>
        <option value="">— Chọn lệnh SX —</option>
        {ofC.map((o) => <option key={o.id} value={o.id}>{o.id} · {o.name}</option>)}
      </select>
      {x && (
        <div className="f-hint">
          SX báo xong <b>{fmtN(x.kgDone)} kg</b> · kho đã nhận {fmtN(recv.kg)} kg
          → còn <b className={remainKg > 0.5 ? '' : 'moss-txt'}>{fmtN(Math.max(0, remainKg))} kg</b> chưa bàn giao.
        </div>
      )}
      {goods.order && <>
        <label className="f-lbl">Số lượng chuẩn bị từng mặt hàng</label>
        {goods.order.items.map((i, k) => (
          <div key={i.id ?? k} style={{ marginBottom: 8 }}>
            <div className="f-hint" style={{ margin: '0 0 3px' }}><b>{i.name}</b> — đơn {fmtN(i.qty)} {i.unit} · đã chuẩn bị {fmtN(goods.doneQty[i.id!] ?? 0)} · {fmtN(perUnit(i))} kg/{i.unit}</div>
            <NumInput value={qtys[i.id!] ?? ''} onChange={(v) => setQtys((p) => ({ ...p, [i.id!]: v }))} />
          </div>
        ))}
        <div className="f-hint">Đã chuẩn bị lũy kế <b>{fmtN(goods.received)}</b> / {fmtN(goods.order.totalKg)} kg</div>
      </>}
      <label className="f-lbl">{autoKg ? 'Tổng khối lượng (tự cộng)' : 'Khối lượng (kg)'}</label>
      {autoKg ? <div className="mc-kg" style={{ fontSize: 22 }}>{fmtN(autoKg)} <small>kg</small></div> : <NumInput big value={kg} onChange={setKg} bad={over} />}
      {over && <div className="f-hint red-txt">Vượt số SX báo xong chưa bàn giao ({fmtN(remainKg)} kg) — kiểm tra lại.</div>}
      <label className="f-lbl">Ghi chú</label>
      <textarea className="inp" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: đợt 2 — 30 cấu kiện dầm chính" />
      <div className="btn-row"><Btn variant="primary" icon={PackageCheck} loading={create.isPending} onClick={submit}>Lập phiếu chuẩn bị hàng</Btn></div>
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

/* ---------------------------------------------------------------- Quản lý: sửa đơn giá / tạm ứng / ngày hoàn thành */
export function ContractEditForm({ c, onDone }: { c: Contract; onDone: () => void }) {
  const { message } = App.useApp()
  const update = useUpdateContract()
  const [price, setPrice] = useState(String(c.unitPrice))
  const [pct, setPct] = useState(String(c.advance?.pct ?? 0))
  const [due, setDue] = useState(dateVal(c.completeBy ?? c.dueAt))
  const submit = async () => {
    const up = num(price), ap = num(pct)
    if (!(up > 0)) { message.error('Đơn giá phải lớn hơn 0.'); return }
    if (ap < 0 || ap > 100) { message.error('% tạm ứng phải trong khoảng 0–100.'); return }
    try {
      await update.mutateAsync({ id: c.id, unitPrice: up, advancePct: ap, completeBy: due ? toIsoEndOfDay(due) : undefined })
      onDone()
    } catch { /* đã báo */ }
  }
  return (
    <div className="m-form">
      <label className="f-lbl">Đơn giá (₫/kg) — giá trị HĐ tự tính lại theo tổng kg</label>
      <NumInput big value={price} onChange={setPrice} />
      <label className="f-lbl">Tạm ứng theo HĐ (%)</label>
      <NumInput big value={pct} onChange={setPct} bad={num(pct) > 100} />
      <label className="f-lbl">Ngày hoàn thành (hạn hợp đồng)</label>
      <input type="date" className="inp" value={due} onChange={(e) => setDue(e.target.value)} />
      <div className="btn-row">
        <Btn variant="primary" icon={Save} loading={update.isPending} onClick={submit}>Lưu thay đổi</Btn>
        <Btn flex={0.55} onClick={onDone}>Hủy</Btn>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- nhập nguyên liệu (Thủ kho) */
export function MaterialForm() {
  const m = useMob()
  const { message } = App.useApp()
  const create = useCreateMaterial()
  const [supplier, setSupplier] = useState('')
  const [spec, setSpec] = useState('')
  const [kgSup, setKgSup] = useState('')
  const [kg, setKg] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const d = kgSup !== '' && kg !== '' ? num(kg) - num(kgSup) : null
  const submit = async () => {
    if (!supplier.trim()) { message.error('Nhập bên cung cấp.'); return }
    if (!(num(kgSup) > 0) || !(num(kg) > 0)) { message.error('Nhập số kg theo bên cung cấp và số kg cân thực tế.'); return }
    if (!photo) { message.error('Bắt buộc chụp ảnh chứng từ.'); return }
    try {
      await create.mutateAsync({ supplier: supplier.trim(), spec: spec.trim(), kgSupplier: num(kgSup), kg: num(kg), photo, note: note.trim() })
      m.pop()
    } catch { /* đã báo */ }
  }
  return (
    <div className="m-form flat">
      <label className="f-lbl">Bên cung cấp</label>
      <input className="inp" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="VD: Thép Minh Khang" />
      <label className="f-lbl">Loại hàng (nếu có)</label>
      <input className="inp" value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="VD: Thép tấm 12 ly" />
      <label className="f-lbl">KG theo bên cung cấp</label>
      <NumInput big value={kgSup} onChange={setKgSup} />
      <label className="f-lbl">KG cân thực tế tại xưởng</label>
      <NumInput big value={kg} onChange={setKg} bad={d != null && Math.abs(d) > 0.5} />
      {d != null && <div className={'f-hint ' + (Math.abs(d) > 0.5 ? 'red-txt' : 'moss-txt')} style={{ fontSize: 15 }}>
        {Math.abs(d) <= 0.5 ? 'Khớp với bên cung cấp ✓' : `Chênh ${signed(d)} kg (thực tế − NCC) — sẽ báo Quản lý`}</div>}
      <PhotoPicker label="Ảnh chứng từ (bắt buộc)" value={photo} onChange={setPhoto} demo={{ label: 'Phiếu nhập NVL', kg: num(kg) || num(kgSup) }} />
      <label className="f-lbl">Ghi chú</label>
      <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: số phiếu NCC, xe giao" />
      <div className="btn-row"><Btn variant="primary" icon={SendHorizontal} loading={create.isPending} onClick={submit}>Lưu & gửi Quản lý</Btn></div>
    </div>
  )
}
