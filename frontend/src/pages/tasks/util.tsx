/* Tiện ích dùng chung cho trang Thẻ công việc lái xe + drawer thẻ VC + trang đối ứng mạ. */
import { Tag } from 'antd'
import { AlarmClock, Factory, ImageIcon, ImageOff, PackageCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Task } from '@/api/types'
import { StatusTag } from '@/components/ui'
import { fmtDT, fmtKg, fmtDelta } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { countdown, hoursOverAt, isIdle, isOverdue } from './logic'

const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, fontWeight: 700, fontSize: 11, margin: 0, paddingInline: 9 }

export function TypeChip({ type }: { type: Task['type'] }) {
  return type === 'di_ma'
    ? <Tag variant="filled" style={{ ...chip, background: 'var(--rust-soft)', color: 'var(--rust-deep)' }}><Factory size={11} />Đi mạ</Tag>
    : <Tag variant="filled" style={{ ...chip, background: 'var(--moss-soft)', color: 'var(--moss)' }}><PackageCheck size={11} />Giao khách</Tag>
}

/** Badge trạng thái: quá hạn điền → đỏ "Đang chạy — quá hạn". */
export function TaskStatusTag({ t, now, withReason }: { t: Task; now?: number; withReason?: boolean }) {
  const over = isOverdue(t, now)
  return (
    <div>
      {over
        ? <StatusTag status="Đang chạy — quá hạn" style={{ background: 'var(--signal-soft)', color: 'var(--signal)' }} />
        : <StatusTag status={t.status} />}
      {withReason && t.rejectReason && <div className="caption" style={{ color: 'var(--signal)', marginTop: 3, fontSize: 11 }}>{t.rejectReason}</div>}
      {withReason && t.status === 'Chờ QL duyệt' && t.reason && <div className="caption" style={{ marginTop: 3, fontSize: 11 }}>Lý do: {t.reason}{t.reasonNote ? ` — ${t.reasonNote}` : ''}</div>}
      {withReason && t.status === 'Đang chạy' && t.qlRejectReason && <div className="caption" style={{ color: 'var(--signal)', marginTop: 3, fontSize: 11 }}>QL không chấp nhận: {t.qlRejectReason} — điền lại</div>}
    </div>
  )
}

/** Hạn điền 24h: "—" | đỏ nhấp nháy "QUÁ HẠN 5h" | countdown. Bấm chip quá hạn → mở thẻ. */
export function DueCell({ t, now, onOpen }: { t: Task; now: number; onOpen?: () => void }) {
  if (!t.fillDeadline) return <span className="text-ash">—</span>
  if (t.filledAt) return <span className="caption num">Đã điền {fmtDT(t.filledAt)}</span>
  if (isOverdue(t, now)) {
    return (
      <Tag variant="filled" className="chip-overdue" onClick={onOpen}
        style={{ ...chip, background: 'var(--signal-soft)', color: 'var(--signal)', cursor: onOpen ? 'pointer' : undefined }}>
        <AlarmClock size={11} />QUÁ HẠN {hoursOverAt(t.fillDeadline, now)}h
      </Tag>
    )
  }
  const cd = countdown(t.fillDeadline, now)
  const soon = new Date(t.fillDeadline).getTime() - now < 4 * 3600000
  return (
    <div>
      <Tag variant="filled" style={{ ...chip, background: soon ? 'var(--amber-soft)' : 'var(--paper-2)', color: soon ? 'var(--amber)' : 'var(--ash)' }}>
        <AlarmClock size={11} />{cd}
      </Tag>
      <div className="caption num" style={{ fontSize: 11, marginTop: 2 }}>hạn {fmtDT(t.fillDeadline)}</div>
    </div>
  )
}

const miss = <span style={{ color: 'var(--signal)', fontWeight: 800, fontSize: 12, letterSpacing: '.02em' }}>CHƯA ĐIỀN</span>

/** Ô "Số cân điền" — đỏ + link biên bản sai lệch khi lệch. */
export function KgCell({ t, tol }: { t: Task; tol: number }) {
  const idle = isIdle(t)
  const sl = t.mismatchId ? <> <RecordLink id={t.mismatchId} danger style={{ fontSize: 11 }} /></> : null
  if (t.type === 'di_ma') {
    if (t.kgAtGalv == null) return idle ? <span className="text-ash">—</span> : miss
    const d = t.kgAtGalv - t.kgRequired
    const bad = Math.abs(d) > tol
    return (
      <div>
        <span className="num" style={{ fontWeight: 700, color: bad ? 'var(--signal)' : undefined }}>{fmtKg(t.kgAtGalv)}</span>{bad && sl}
        {bad && <div className="caption" style={{ color: 'var(--signal)', fontSize: 11 }}>lệch {fmtDelta(d)} vs yêu cầu</div>}
      </div>
    )
  }
  if (t.kgDelivered == null && t.kgPicked == null) return idle ? <span className="text-ash">—</span> : miss
  const badP = Math.abs((t.kgPicked ?? 0) - t.kgRequired) > tol
  const badD = Math.abs((t.kgDelivered ?? 0) - (t.kgPicked ?? 0)) > 0.5
  const bad = badP || badD
  return (
    <div>
      <span className="num" style={{ fontWeight: 700, color: bad ? 'var(--signal)' : undefined }}>
        mạ ký {fmtKg(t.kgPicked)} / khách ký {fmtKg(t.kgDelivered)}
      </span>{bad && sl}
      {badD && <div className="caption" style={{ color: 'var(--signal)', fontSize: 11 }}>khách ký thiếu {fmtKg((t.kgPicked ?? 0) - (t.kgDelivered ?? 0))}</div>}
    </div>
  )
}

/** Ô ảnh phiếu (danh sách không kèm ảnh → dùng hasPhoto). */
export function PhotoCell({ t }: { t: Task }) {
  if (t.hasPhoto) return <span className="text-moss" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 11.5 }}><ImageIcon size={13} />Có ảnh</span>
  if (isIdle(t)) return <span className="text-ash">—</span>
  return <span style={{ color: 'var(--signal)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 11.5 }}><ImageOff size={12} />Thiếu</span>
}

/** Chứng từ gốc: PC (phiếu cân xuất) cho thẻ đi mạ, VC (thẻ gửi mạ) cho thẻ giao khách. */
export function RefCell({ t }: { t: Task }) {
  if (!t.refId) return <span className="text-ash">—</span>
  return (
    <div>
      <RecordLink id={t.refId} style={{ color: 'var(--rust)', fontSize: 12 }} />
      <div className="caption" style={{ fontSize: 11 }}>{t.refId.startsWith('PC') ? 'Phiếu cân xuất' : 'Thẻ gửi mạ'}</div>
    </div>
  )
}
