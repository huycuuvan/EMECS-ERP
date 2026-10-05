/* Thành phần giao diện dùng chung — tương đương class có sẵn của bản demo (kpi, badge, chip hạn, pk-cell...). */
import { Progress, Tag, Tooltip } from 'antd'
import { AlarmClock, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { AdvanceInfo, CompleteInfo } from '@/api/types'
import { C } from '@/theme'
import { fmtDelta } from '@/lib/format'

export function PageHeader({ title, desc, extra }: { title: ReactNode; desc?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {extra && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  )
}

export type Tone = 'ink' | 'rust' | 'moss' | 'amber' | 'signal' | 'steel'
const toneColor: Record<Tone, string> = { ink: C.ink, rust: C.rust, moss: C.moss, amber: C.amber, signal: C.signal, steel: C.steel }

export function Kpi({ label, value, sub, tone = 'ink', onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void }) {
  return (
    <div className={'kpi' + (onClick ? ' clickable' : '')} style={{ '--kpi-color': toneColor[tone] } as CSSProperties} onClick={onClick}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
export const KpiGrid = ({ children }: { children: ReactNode }) => <div className="kpi-grid">{children}</div>

/* ---------- trạng thái: màu thống nhất toàn hệ thống ---------- */
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  // xanh = xong/ổn
  'Hoàn thành': { bg: C.mossSoft, fg: C.moss }, 'Đã cân': { bg: C.mossSoft, fg: C.moss }, 'Đã ký': { bg: C.mossSoft, fg: C.moss },
  'Đã ký xác nhận': { bg: C.mossSoft, fg: C.moss }, 'Đã xử lý': { bg: C.mossSoft, fg: C.moss }, 'Đã có hợp đồng': { bg: C.mossSoft, fg: C.moss },
  // vàng = đang chạy
  'Đang triển khai': { bg: C.amberSoft, fg: C.amber }, 'Đang SX': { bg: C.amberSoft, fg: C.amber }, 'Đang chạy': { bg: C.amberSoft, fg: C.amber },
  'Đã nhận': { bg: C.steelSoft, fg: C.steel }, 'Đã tiếp nhận': { bg: C.mossSoft, fg: C.moss }, 'Đã trả khách': { bg: C.steelSoft, fg: C.steel }, 'Đã chuyển kế toán': { bg: C.steelSoft, fg: C.steel },
  // cam = chờ người làm
  'Chờ nhận': { bg: C.rustSoft, fg: C.rustDeep }, 'Chờ xác nhận': { bg: C.rustSoft, fg: C.rustDeep }, 'Chờ cân': { bg: C.rustSoft, fg: C.rustDeep },
  'Soạn thảo': { bg: C.paper3, fg: C.ink3 }, 'Chốt đơn': { bg: C.rustSoft, fg: C.rustDeep }, 'Đang treo': { bg: C.amberSoft, fg: C.amber },
  // hợp đồng (4 bước kế toán) + tiền về chờ Quản lý duyệt
  'Chờ soạn thảo': { bg: C.rustSoft, fg: C.rustDeep }, 'Đã soạn thảo': { bg: C.paper3, fg: C.ink3 },
  'Đã gửi khách hàng': { bg: C.steelSoft, fg: C.steel }, 'Đã nhận về': { bg: C.amberSoft, fg: C.amber },
  'Chờ QL duyệt': { bg: C.amberSoft, fg: C.amber }, 'QL từ chối': { bg: C.signalSoft, fg: C.signal },
  'Đã hoàn thành': { bg: C.mossSoft, fg: C.moss }, 'Đã ghi nhận': { bg: C.steelSoft, fg: C.steel }, 'Chờ duyệt': { bg: C.amberSoft, fg: C.amber }, 'Đã duyệt': { bg: C.mossSoft, fg: C.moss },
  // đỏ = cần xử lý
  'Từ chối': { bg: C.signalSoft, fg: C.signal }, 'Đang chạy — quá hạn': { bg: C.signalSoft, fg: C.signal }, 'Quá hạn': { bg: C.signalSoft, fg: C.signal }, 'Lệch — chờ ký': { bg: C.signalSoft, fg: C.signal }, 'Chờ QL ký': { bg: C.signalSoft, fg: C.signal },
}
export function StatusTag({ status, style }: { status: string; style?: CSSProperties }) {
  const t = STATUS_TONE[status] ?? { bg: C.paper2, fg: C.ink3 }
  return (
    <Tag variant="filled" style={{ background: t.bg, color: t.fg, fontWeight: 700, fontSize: 11, letterSpacing: '.02em', textTransform: 'uppercase', borderRadius: 999, paddingInline: 10, margin: 0, ...style }}>
      {status}
    </Tag>
  )
}

/** Chip hạn hoàn thành đơn (completeInfo): đỏ quá hạn, vàng sắp tới hạn (≤ 7 ngày). */
export function CompleteChip({ info }: { info: CompleteInfo }) {
  if (info.state === 'none') return <span className="text-ash">—</span>
  const map = {
    ok: { bg: C.mossSoft, fg: C.moss, icon: <CheckCircle2 size={12} /> },
    fine: { bg: C.paper2, fg: C.ink3, icon: <AlarmClock size={12} /> },
    soon: { bg: C.amberSoft, fg: C.amber, icon: <AlarmClock size={12} /> },
    overdue: { bg: C.signalSoft, fg: C.signal, icon: <AlertTriangle size={12} /> },
  }[info.state]
  return (
    <Tag variant="filled" className={info.state === 'overdue' ? 'chip-overdue' : ''}
      style={{ background: map.bg, color: map.fg, fontWeight: 700, borderRadius: 999, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'normal' }}>
      {map.icon}{info.label}
    </Tag>
  )
}

export function AdvChip({ adv }: { adv: AdvanceInfo }) {
  const map = { ok: [C.mossSoft, C.moss], none: [C.paper2, C.ash], wait: [C.paper2, C.ink3], missing: [C.signalSoft, C.signal] }[adv.state]
  return <Tag variant="filled" style={{ background: map[0], color: map[1], fontWeight: 700, borderRadius: 999, margin: 0 }}>{adv.label}</Tag>
}

/** Ô thông tin trong drawer (pk-cell). */
export function Cell({ label, children, wide, alert, big, extra }: { label: ReactNode; children: ReactNode; wide?: boolean; alert?: boolean; big?: boolean; extra?: ReactNode }) {
  return (
    <div className={['pk-cell', wide && 'wide', alert && 'alert', big && 'big'].filter(Boolean).join(' ')}>
      <div className="pk-l">{label}</div>
      <div className="pk-v">{children}</div>
      {extra && <div style={{ marginTop: 6 }}>{extra}</div>}
    </div>
  )
}
export const CellGrid = ({ children }: { children: ReactNode }) => <div className="pk-grid">{children}</div>

/** Tiêu đề mục có gạch ngang (sec của demo). */
export function Sec({ icon, children, extra }: { icon?: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return <div className="sec-title">{icon}{children}{extra && <span style={{ order: 1, textTransform: 'none', letterSpacing: 0 }}>{extra}</span>}</div>
}

export function Bar({ percent, color = C.moss }: { percent: number; color?: string }) {
  return <Progress percent={Math.min(100, Math.max(0, percent))} showInfo={false} strokeColor={color} railColor={C.paper2} size="small" />
}

/** Số kg lệch: 0 = xanh "khớp", khác 0 = đỏ. */
export function DeltaKg({ delta, okText = 'khớp' }: { delta: number; okText?: string }) {
  if (Math.abs(delta) <= 0.5) return <span className="num text-moss" style={{ fontWeight: 700 }}>{okText}</span>
  return <span className="num text-signal" style={{ fontWeight: 700 }}>{fmtDelta(delta)}</span>
}

export function Hint({ title, children }: { title: string; children: ReactNode }) {
  return <Tooltip title={title}><span>{children}</span></Tooltip>
}
