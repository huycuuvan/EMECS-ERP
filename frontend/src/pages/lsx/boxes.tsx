/* Hộp thông tin / cảnh báo / lỗi trong modal (tương đương .w-info / .w-warn / .m-err của bản demo). */
import type { ReactNode } from 'react'
import { C } from '@/theme'

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: C.ash, lineHeight: 1.6, marginBottom: 12 }}>
      {children}
    </div>
  )
}

export function WarnBox({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ background: C.signalSoft, border: `1.5px solid ${C.signal}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
      {title && <div style={{ color: C.signal, fontWeight: 800, fontSize: 13, marginBottom: children ? 8 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>{title}</div>}
      {children}
    </div>
  )
}

export function ErrBox({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <div style={{ background: C.signalSoft, color: C.signal, border: `1px solid ${C.signal}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
      {children}
    </div>
  )
}
