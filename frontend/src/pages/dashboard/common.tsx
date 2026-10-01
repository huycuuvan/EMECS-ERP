/* Thành phần nhỏ dùng chung cho Dashboard / Báo cáo / Sai lệch (card, nhãn mục, badge loại phiếu, khối cảnh báo...). */
import { CheckCircle2 } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

export function Panel({ title, sub, extra, children, style }: { title?: ReactNode; sub?: ReactNode; extra?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--canvas)', border: '1px solid var(--rule-soft)', borderRadius: 14, padding: 20, minWidth: 0, ...style }}>
      {(title || extra) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: sub ? 2 : 10, flexWrap: 'wrap' }}>
          {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>{title}</h3>}
          {extra}
        </div>
      )}
      {sub && <p className="caption" style={{ margin: '0 0 12px' }}>{sub}</p>}
      {children}
    </div>
  )
}

export const SectionLabel = ({ children }: { children: ReactNode }) => <div className="micro-u" style={{ marginBottom: 8 }}>{children}</div>

export const Grid = ({ min = 420, gap = 14, children, style }: { min?: number; gap?: number; children: ReactNode; style?: CSSProperties }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap, marginBottom: 24, ...style }}>{children}</div>
)

/* ---------- badge loại phiếu (nhật ký chứng từ) ---------- */
const KIND_TONE: Record<string, [string, string]> = {
  'Tiếp nhận TP': ['var(--steel-soft)', 'var(--steel)'],
  'Cân xuất đi mạ': ['var(--steel-soft)', 'var(--ink)'],
  'Nhập xưởng mạ': ['var(--amber-soft)', 'var(--amber)'],
  'Giao khách': ['var(--moss-soft)', 'var(--moss)'],
}
export function KindBadge({ kind }: { kind: string }) {
  const [bg, fg] = KIND_TONE[kind] ?? ['var(--paper-2)', 'var(--ink)']
  return <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 6, background: bg, color: fg, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{kind}</span>
}

/* ---------- chip nhỏ (due-chip của demo) ---------- */
export type ChipTone = 'over' | 'soon' | 'ok' | 'fine'
const CHIP: Record<ChipTone, [string, string]> = {
  over: ['var(--signal-soft)', 'var(--signal)'], soon: ['var(--amber-soft)', 'var(--amber)'],
  ok: ['var(--moss-soft)', 'var(--moss)'], fine: ['var(--paper-2)', 'var(--ash)'],
}
export function Chip({ tone, icon, children, blink }: { tone: ChipTone; icon?: ReactNode; children: ReactNode; blink?: boolean }) {
  const [bg, fg] = CHIP[tone]
  return (
    <span className={blink ? 'chip-overdue' : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: fg, whiteSpace: 'nowrap', flex: 'none' }}>
      {icon}{children}
    </span>
  )
}

/* ---------- khối cảnh báo (alert-card) ---------- */
export function AlertCard({ icon, title, count, bad, children }: { icon: ReactNode; title: ReactNode; count: number; bad?: boolean; children: ReactNode }) {
  const red = bad && count > 0
  return (
    <div style={{ background: 'var(--canvas)', border: '1px solid var(--rule-soft)', borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '0 0 4px', fontWeight: 700 }}>
        {icon}{title}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: red ? 'var(--signal-soft)' : 'var(--paper-2)', color: red ? 'var(--signal)' : 'var(--ash)' }}>{count}</span>
      </h3>
      {children}
    </div>
  )
}

export function AlertItem({ t1, t2, right, onClick }: { t1: ReactNode; t2: ReactNode; right?: ReactNode; onClick?: () => void }) {
  return (
    <div className="al-item" onClick={onClick} role={onClick ? 'button' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px dashed var(--rule)', cursor: onClick ? 'pointer' : undefined }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{t1}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ash)', marginTop: 2 }}>{t2}</div>
      </div>
      {right}
    </div>
  )
}

export function AlertEmpty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '18px 4px', fontSize: 12.5, color: 'var(--moss)', display: 'flex', alignItems: 'center', gap: 7 }}>
      <CheckCircle2 size={14} />{children}
    </div>
  )
}

/* ---------- ô tổng (sum-cell / stat5) ---------- */
export function StatCell({ label, value, cap, color = 'var(--ink)', danger, onClick, dashed, title }: {
  label: ReactNode; value: ReactNode; cap?: ReactNode; color?: string; danger?: boolean; onClick?: () => void; dashed?: boolean; title?: string
}) {
  return (
    <div onClick={onClick} title={title}
      style={{
        background: danger ? 'var(--signal-soft)' : 'var(--canvas)', border: `1px ${dashed ? 'dashed' : 'solid'} ${danger ? 'var(--signal)' : 'var(--rule-soft)'}`,
        borderRadius: 12, padding: '12px 14px', cursor: onClick ? 'pointer' : undefined, minWidth: 0,
      }}>
      <div className="micro-u" style={{ color, fontWeight: 700 }}>{label}</div>
      <div className="num" style={{ fontSize: 19, fontWeight: 700, marginTop: 2, color }}>{value}</div>
      {cap && <div style={{ fontSize: 11, color: 'var(--ash)', marginTop: 3 }}>{cap}</div>}
    </div>
  )
}

/** Mini progress (nhãn trên + thanh 7px) — dùng ở bảng sức khỏe hợp đồng. */
export function MiniProg({ pct, top, color }: { pct: number; top: ReactNode; color: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, color: 'var(--ash)', marginBottom: 3 }}>
        <span>{top}</span><span>{pct}%</span>
      </div>
      <div style={{ height: 7, background: 'var(--paper-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
