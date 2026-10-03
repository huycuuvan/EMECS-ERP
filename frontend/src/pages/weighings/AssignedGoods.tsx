/* Số lượng Quản lý giao xuống kho (phiếu chuẩn bị hàng gốc của phiếu cân): từng mặt hàng + tổng kg dự kiến. */
import { useReceipts } from '@/api/hooks'
import type { ID } from '@/api/types'
import { fmtKg, fmtNum } from '@/lib/format'

export function useAssigned(receiptId?: ID | null) {
  const { data: rcs = [] } = useReceipts()
  return receiptId ? rcs.find((r) => r.id === receiptId) : undefined
}

export default function AssignedGoods({ receiptId, compact }: { receiptId?: ID | null; compact?: boolean }) {
  const r = useAssigned(receiptId)
  if (!r) return null
  return (
    <div style={{ background: 'var(--paper-2)', borderRadius: 10, padding: '8px 12px', margin: '8px 0', fontSize: compact ? 12.5 : 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Quản lý giao xuống kho ({r.id}) — chuẩn bị:</div>
      {r.items?.length
        ? r.items.map((l) => <div key={l.itemId}>• {l.name}: <b>{fmtNum(l.qty)} {l.unit}</b> × {fmtNum(l.kgPerUnit)} kg = {fmtKg(l.kg)}</div>)
        : <div>Khối lượng {fmtKg(r.kg)}</div>}
      <div style={{ marginTop: 4 }}>Tổng dự kiến <b>{fmtKg(r.kg)}</b>{r.note && <> · {r.note}</>}</div>
    </div>
  )
}
