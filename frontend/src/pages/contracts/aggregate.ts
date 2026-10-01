/* Lũy kế hàng — tiền cho từng hợp đồng trong danh sách (cùng công thức contract_agg ở backend),
   tính từ GET /contracts + thẻ giao khách để không phải gọi chi tiết từng hợp đồng. */
import type { ContractRow, Task } from '@/api/types'

export interface RowAgg {
  deliveredKg: number; trips: number; deliveredValue: number; paidTotal: number; debt: number
  pctDelivered: number; pctPaid: number
}

export function aggregateRows(contracts: ContractRow[], giao: Task[]): Record<string, RowAgg> {
  const out: Record<string, RowAgg> = {}
  for (const c of contracts) {
    const done = giao.filter((t) => t.contractId === c.id && t.kgDelivered != null)
    const deliveredKg = done.reduce((s, t) => s + (t.kgDelivered || 0), 0)
    const paidTotal = (c.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
    const deliveredValue = Math.round(deliveredKg * (c.unitPrice || 0))
    out[c.id] = {
      deliveredKg, trips: done.length, deliveredValue, paidTotal, debt: deliveredValue - paidTotal,
      pctDelivered: c.totalKg ? Math.round((deliveredKg / c.totalKg) * 100) : 0,
      pctPaid: c.value ? Math.round((paidTotal / c.value) * 100) : 0,
    }
  }
  return out
}
