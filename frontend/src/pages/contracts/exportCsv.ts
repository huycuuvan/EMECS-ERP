/* Xuất Excel (CSV UTF-8 có BOM để Excel đọc đúng tiếng Việt) danh sách hợp đồng đang lọc. */
import type { ContractRow } from '@/api/types'
import { fmtD } from '@/lib/format'
import type { RowAgg } from './aggregate'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportContractsCsv(rows: ContractRow[], agg: Record<string, RowAgg>) {
  const head = ['Mã HĐ', 'Mã đơn', 'Mã nội bộ', 'Khách hàng', 'Số lượng', 'Đơn vị', 'Khối lượng (kg)', 'Đơn giá (đ/kg)',
    'Giá trị HĐ (đ)', 'Chuyển kế toán', 'Hạn trả HĐ', 'Tình trạng hạn', 'Ngày ký', 'Tạm ứng %', 'Tạm ứng yêu cầu (đ)',
    'Tạm ứng đã về (đ)', 'Tình trạng tạm ứng', 'Đã giao (kg)', 'Số chuyến đã giao', 'Giá trị hàng đã giao (đ)',
    'Tiền về lũy kế (đ)', 'Công nợ (đ)', 'Trạng thái', 'Phụ trách']
  const lines = rows.map((c) => {
    const g = agg[c.id]
    return [c.id, c.orderId, c.code, c.customer, c.totalQty, c.unit, c.totalKg, c.unitPrice, c.value, fmtD(c.sentToKtAt),
      fmtD(c.dueAt), c.due.label, c.signDate ? fmtD(c.signDate) : 'Chưa ký', c.advance.pct, c.advance.required,
      c.advance.received, c.adv.label, g?.deliveredKg ?? 0, g?.trips ?? 0, g?.deliveredValue ?? 0, g?.paidTotal ?? 0,
      g?.debt ?? 0, c.status, c.owner].map(cell).join(',')
  })
  const csv = '﻿' + [head.map(cell).join(','), ...lines].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  const d = new Date()
  a.href = url
  a.download = `hop-dong_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
