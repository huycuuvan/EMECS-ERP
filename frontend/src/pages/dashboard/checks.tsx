/* Trạng thái 3 điểm cân của một hợp đồng: cân xuất công ty = cân đến xưởng mạ = lấy từ mạ đi giao khách. */
import { Tooltip } from 'antd'
import type { ContractAggLite } from '@/api/types'
import { fmtDelta, fmtKg } from '@/lib/format'

export function threePoint(g: ContractAggLite) {
  const keys = g.checks.filter((k) => k.key)
  const hasMove = g.weighedKg + g.producedKg > 0
  const badDelta = keys.filter((k) => !k.ok).reduce((s, k) => s + Math.abs(k.delta), 0)
  const allOk = hasMove && keys.every((k) => k.ok)
  const pendingSl = g.mismatches.filter((m) => m.status === 'Chờ QL ký').length
  return { keys, hasMove, badDelta, allOk, pendingSl }
}

export function ThreePointChecks({ g }: { g: ContractAggLite }) {
  const { keys, hasMove, badDelta } = threePoint(g)
  if (!hasMove) return <span style={{ color: 'var(--ash)', fontSize: 11.5 }}>— chưa phát sinh cân</span>
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
      {keys.map((k) => (
        <Tooltip key={k.label} title={<>
          <b>{k.label}</b><br />
          {k.aLbl}: {fmtKg(k.a)}<br />{k.bLbl}: {fmtKg(k.b)}<br />
          {k.ok ? 'khớp' : `lệch ${fmtDelta(k.delta)} — ${k.note}`}
        </>}>
          <span style={{ color: k.ok ? 'var(--moss)' : 'var(--signal)', fontWeight: 800, cursor: 'help' }}>{k.ok ? '✓' : '✗'}</span>
        </Tooltip>
      ))}
      {badDelta > 0
        ? <span style={{ color: 'var(--signal)', fontWeight: 800 }}>lệch {fmtKg(badDelta)}</span>
        : <span style={{ color: 'var(--moss)', fontWeight: 700 }}>khớp</span>}
    </div>
  )
}
