/* Thanh tiến độ nhỏ trong bảng hợp đồng (mini-prog của demo): nhãn trên · thanh · nhãn dưới. */
import type { ReactNode } from 'react'

export type ProgTone = 'success' | 'warn' | 'danger'
const COLOR: Record<ProgTone, string> = { success: 'var(--moss)', warn: 'var(--amber)', danger: 'var(--signal)' }

export default function MiniProg({ pct, tone, top, bottom }: { pct: number; tone: ProgTone; top: ReactNode; bottom: ReactNode }) {
  return (
    <div className="mini-prog">
      <div className="lbl"><span>{top}</span><span>{pct}%</span></div>
      <div className="track"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: COLOR[tone] }} /></div>
      <div className="lbl"><span style={tone === 'danger' ? { color: 'var(--signal)', fontWeight: 600 } : undefined}>{bottom}</span></div>
    </div>
  )
}
