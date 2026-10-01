/* Bộ thành phần dùng chung của bản mobile hiện trường (port các hàm dựng HTML trong pages/mobile.html). */
import { App } from 'antd'
import {
  AlarmClock, AlertTriangle, Camera, Check, ChevronRight, Circle, Hourglass, Image as ImageIcon, ImageOff, Loader,
  LoaderCircle, ThumbsUp, Trash2, type LucideIcon,
} from 'lucide-react'
import { useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { demoTicket, errorMessage, uploadImage } from '@/api/client'
import type { Task } from '@/api/types'
import { fmtN, KIND_META, type Kind, type MAlert, refKindOf, useMob } from './core'

/** Bấm vào vùng tương tác bên trong card thì không mở chi tiết. */
const isInteractive = (e: MouseEvent) => !!(e.target as HTMLElement).closest('button, a, input, select, textarea, label, .no-open')

/* ---------------------------------------------------------------- khối hiển thị */
export function SecTitle({ icon: Icon, children, count, red }: { icon: LucideIcon; children: ReactNode; count?: number; red?: boolean }) {
  return (
    <div className="m-sec-title">
      <Icon />{children}
      {count != null && <span className={'cnt' + (red ? ' red' : '')}>{count}</span>}
    </div>
  )
}

export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return <div className="empty-note"><Icon />{children}</div>
}

export function StatusChip({ status, overdue }: { status: string; overdue?: boolean }) {
  let cls = 'neutral'
  let Icon: LucideIcon = Circle
  let st = status
  if (overdue) { cls = 'bad'; Icon = AlarmClock; st = 'QUÁ HẠN ĐIỀN' }
  else if (status === 'Hoàn thành' || status === 'Đã cân') { cls = 'ok'; Icon = Check }
  else if (status === 'Chờ xác nhận' || status === 'Chờ nhận' || status === 'Chờ cân') { cls = 'warn'; Icon = Hourglass }
  else if (status === 'Đang chạy' || status === 'Đang SX' || status === 'Đang triển khai') { cls = 'neutral'; Icon = Loader }
  else if (status === 'Đã nhận' || status === 'Đã ký xác nhận' || status === 'Đã ký') { cls = 'ok'; Icon = ThumbsUp }
  else if (status === 'Từ chối' || status === 'Lệch — chờ ký' || status === 'Chờ QL ký') { cls = 'bad'; Icon = AlertTriangle }
  return <span className={'m-chip ' + cls}><Icon />{st}</span>
}

export function TypeChip({ type }: { type: Task['type'] }) {
  return type === 'di_ma' ? <span className="chip-type ma">ĐI MẠ</span> : <span className="chip-type giao">GIAO KHÁCH</span>
}

export function PgRow({ label, done, plan, unit, tone }: { label: string; done: number; plan: number; unit: string; tone?: 'success' | 'warn' }) {
  const pct = plan ? Math.min(100, Math.round((done / plan) * 100)) : 0
  const cls = tone ?? (pct >= 100 ? 'success' : pct >= 50 ? '' : 'warn')
  return (
    <div className="pg-row">
      <div className="pg-lbl"><span>{label}</span><b>{fmtN(done)} / {fmtN(plan)} {unit} · {pct}%</b></div>
      <div className={'pg-bar ' + cls}><div style={{ width: pct + '%' }} /></div>
    </div>
  )
}

/** Dòng nhãn — giá trị trong card (mc-line). */
export function Line({ k, children, vClass = '', kFix, style }: { k?: ReactNode; children?: ReactNode; vClass?: string; kFix?: boolean; style?: CSSProperties }) {
  return (
    <div className="mc-line" style={style}>
      {k != null && <span className={'k' + (kFix ? ' fn' : '')}>{k}</span>}
      {children != null && <span className={'v ' + vClass}>{children}</span>}
    </div>
  )
}

export function Kg({ value }: { value: number }) {
  return <span className="mc-kg">{fmtN(value)} <small>kg</small></span>
}

/** Card bản ghi — bấm (ngoài nút/ô nhập) để mở sheet chi tiết. */
export function Card({ open, overdue, children, style }: { open?: [Kind, string]; overdue?: boolean; children: ReactNode; style?: CSSProperties }) {
  const m = useMob()
  return (
    <div className={'m-card' + (overdue ? ' overdue' : '') + (open ? ' clickable' : '')} style={style}
      onClick={open ? (e) => { if (!isInteractive(e)) m.open(open[0], open[1]) } : undefined}>
      {children}
    </div>
  )
}

export type BtnVariant = 'primary' | 'accept' | 'rust' | 'danger-line' | 'danger' | 'default'
export function Btn({ variant = 'default', icon: Icon, children, onClick, loading, disabled, flex, sm, type = 'button' }: {
  variant?: BtnVariant; icon?: LucideIcon; children: ReactNode; onClick?: () => void; loading?: boolean; disabled?: boolean
  flex?: number; sm?: boolean; type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={['btn-m', variant !== 'default' && variant, sm && 'sm'].filter(Boolean).join(' ')}
      style={flex != null ? { flex } : undefined} disabled={disabled || loading} onClick={onClick}>
      {loading ? <LoaderCircle className="spin" /> : Icon ? <Icon /> : null}{children}
    </button>
  )
}

/* ---------------------------------------------------------------- cảnh báo */
export function AlertRow({ a }: { a: MAlert }) {
  const m = useMob()
  const cls = 'alert-row' + (a.red ? '' : ' amber')
  const inner = (
    <>
      <a.ic />
      <div className="ar-body"><div className="ar-t">{a.t}</div><div className="ar-s">{a.s}</div></div>
      {a.open && <ChevronRight className="ar-go" />}
    </>
  )
  if (!a.open) return <div className={cls}>{inner}</div>
  const [k, id] = a.open
  return <button type="button" className={cls} onClick={() => m.open(k, id)}>{inner}</button>
}

/* ---------------------------------------------------------------- chi tiết */
export function DItem({ k, children, full, small, sub }: { k: ReactNode; children: ReactNode; full?: boolean; small?: boolean; sub?: ReactNode }) {
  return (
    <div className={'d-item' + (full ? ' full' : '')}>
      <span className="dk">{k}</span>
      <span className={'dv' + (small ? ' small' : '')}>{children}</span>
      {sub && <span className="dsub">{sub}</span>}
    </div>
  )
}
export const DGrid = ({ children }: { children: ReactNode }) => <div className="dgrid">{children}</div>

export function DLink({ id, kind, txt, warn }: { id: string; kind?: Kind; txt?: ReactNode; warn?: boolean }) {
  const m = useMob()
  const k = kind ?? refKindOf(id)
  const Icon = warn ? AlertTriangle : KIND_META[k].icon
  return (
    <button type="button" className={'dlink' + (warn ? ' warn' : '')} onClick={(e) => { e.stopPropagation(); m.open(k, id) }}>
      <Icon />{txt ?? id}
    </button>
  )
}

/* ---------------------------------------------------------------- nhập liệu */
export function NumInput({ value, onChange, big, bad, placeholder = '0', inputMode = 'decimal' }: {
  value: string; onChange: (v: string) => void; big?: boolean; bad?: boolean; placeholder?: string; inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <input type="number" inputMode={inputMode} min={0} step="any" className={'inp' + (big ? ' big' : '') + (bad ? ' bad' : '')}
      value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  )
}

export function ReasonSelect({ reasons, value, onChange, placeholder = '— Chọn lý do —' }: { reasons: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  )
}

/** Khung đỏ bắt chọn lý do khi lệch quá dung sai (reasonBlock của demo). */
export function ReasonBox({ show, msg, reasons, reason, setReason, note, setNote }: {
  show: boolean; msg: string; reasons: string[]; reason: string; setReason: (v: string) => void; note: string; setNote: (v: string) => void
}) {
  if (!show) return null
  return (
    <div className="mm-box">
      <div className="mm-head"><AlertTriangle /><span>{msg}</span></div>
      <ReasonSelect reasons={reasons} value={reason} onChange={setReason} placeholder="— Chọn lý do sai lệch —" />
      <input className="inp" value={note} placeholder="Diễn giải thêm…" onChange={(e) => setNote(e.target.value)} />
    </div>
  )
}

/** Chụp ảnh phiếu bằng camera điện thoại (hoặc chọn ảnh có sẵn / ảnh demo) → upload → URL. */
export function PhotoPicker({ value, onChange, label, demo }: {
  value: string | null; onChange: (v: string | null) => void; label: string; demo: { label: string; kg: number }
}) {
  const { message } = App.useApp()
  const m = useMob()
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<string>) => {
    setBusy(true)
    try { onChange(await f()) } catch (e) { message.error(errorMessage(e)) } finally { setBusy(false) }
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) run(() => uploadImage(f))
  }
  return (
    <>
      <label className="f-lbl">{label}</label>
      <div className="photo-row">
        <button type="button" className={'btn-photo' + (value ? ' done' : '')} disabled={busy} onClick={() => camRef.current?.click()}>
          {busy ? <LoaderCircle className="spin" /> : <Camera />}{busy ? 'Đang tải ảnh…' : value ? 'Chụp lại' : 'Chụp ảnh phiếu'}
        </button>
        <Btn sm icon={ImageIcon} disabled={busy} flex={0} onClick={() => run(() => demoTicket(demo.label, demo.kg))}>Ảnh demo</Btn>
        {value && (
          <button type="button" className="thumb-wrap" onClick={() => m.zoom(value)} aria-label="Phóng to ảnh">
            <img className="thumb" src={value} alt="phiếu" />
            <span className="thumb-ok"><Check /></span>
          </button>
        )}
      </div>
      <button type="button" className="link-btn" disabled={busy} onClick={() => libRef.current?.click()}>Hoặc chọn ảnh có sẵn trong máy</button>
      <input ref={camRef} className="hidden-file" type="file" accept="image/*" capture="environment" onChange={onFile} tabIndex={-1} />
      <input ref={libRef} className="hidden-file" type="file" accept="image/*" onChange={onFile} tabIndex={-1} />
    </>
  )
}

/** Quản lý ảnh đính kèm trong sheet chi tiết: xem/phóng to, thay/chụp, ảnh demo, xóa. */
export function PhotoManage({ photo, loading, onChange, demo }: {
  photo: string | null; loading?: boolean; onChange: (p: string | null) => Promise<unknown>; demo: { label: string; kg: number }
}) {
  const { message, modal } = App.useApp()
  const m = useMob()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    try { await onChange(await f()) } catch (e) { message.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <SecTitle icon={ImageIcon}>Ảnh phiếu đính kèm</SecTitle>
      {loading ? <div className="m-loading"><LoaderCircle className="spin" /></div>
        : photo ? <img className="dphoto" src={photo} alt="Ảnh phiếu" role="button" onClick={() => m.zoom(photo)} />
          : <div className="empty-note" style={{ padding: '14px 12px' }}><ImageOff />Chưa có ảnh phiếu đính kèm.</div>}
      <div className="btn-row" style={{ marginTop: 9 }}>
        <Btn sm icon={Camera} loading={busy} onClick={() => ref.current?.click()}>{photo ? 'Thay ảnh' : 'Chụp / tải ảnh'}</Btn>
        <Btn sm icon={ImageIcon} disabled={busy} onClick={() => run(() => demoTicket(demo.label, demo.kg))}>Ảnh demo</Btn>
        {photo && (
          <Btn sm variant="danger-line" icon={Trash2} disabled={busy} onClick={() => modal.confirm({
            title: 'Xóa ảnh phiếu?', content: 'Ảnh phiếu đính kèm sẽ bị gỡ khỏi bản ghi. Chứng từ thiếu ảnh sẽ bị hệ thống nhắc bổ sung. Xóa chứ?',
            okText: 'Xóa ảnh', okButtonProps: { danger: true }, cancelText: 'Giữ lại', onOk: () => run(async () => null),
          })}>Xóa ảnh</Btn>
        )}
      </div>
      <input ref={ref} className="hidden-file" type="file" accept="image/*" capture="environment" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => uploadImage(f)) }} />
    </>
  )
}

export const Loading = () => <div className="m-loading"><LoaderCircle className="spin" /></div>
