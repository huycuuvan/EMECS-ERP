/* Hằng số + tiện ích dùng chung của form hợp đồng / đơn hàng. */
import type { LedgerKey, Lsx } from '@/api/types'

/** Modal mở từ drawer phải nằm trên chồng drawer (zIndex 1000 + 10/lớp). */
export const MODAL_Z = 1500

/* ---------- định dạng ô nhập tiền / số kiểu Việt Nam (1.234.567,5) — xem lib/numberInput ---------- */
export { numFormatter, numParser } from '@/lib/numberInput'
export const positive = (msg: string) => ({ validator: (_: unknown, v: number | null) => (v && v > 0 ? Promise.resolve() : Promise.reject(new Error(msg))) })

export const PAYMENT_TYPES = ['Tạm ứng theo hợp đồng', 'Thanh toán đợt', 'Tất toán']

/** kg đã phát lệnh của 1 HĐ (không tính lệnh bị từ chối — lệnh đó sẽ phát lại) */
export const committedKg = (lsxs: Lsx[]) => lsxs.filter((x) => x.status !== 'Từ chối').reduce((s, x) => s + (x.kgPlan || 0), 0)

/** 5 vị trí thép trong sổ luân chuyển (màu theo demo). */
export const FLOW_COLS: { k: LedgerKey; label: string; color: string }[] = [
  { k: 'kho', label: 'Tồn kho', color: '#4b5563' },
  { k: 'duong', label: 'Đang tới mạ', color: '#8a6100' },
  { k: 'ma', label: 'Tại xưởng mạ', color: '#d11a24' },
  { k: 'giao', label: 'Đã giao khách', color: '#1e6b3a' },
  { k: 'lech', label: 'Lệch ghi nhận', color: '#a3121b' },
]
