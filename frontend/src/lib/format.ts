// Định dạng giống SteelStore của bản demo (vi-VN).
const nf = (max = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: max })

const pad = (n: number) => String(n).padStart(2, '0')
export const fmtD = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
export const fmtDT = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fmtNum = (n?: number | null, max = 2) => nf(max).format(Number(n) || 0)
export const fmtKg = (n?: number | null) => `${fmtNum(n)} kg`
export const fmtT = (n?: number | null) => `${nf(2).format((Number(n) || 0) / 1000)} tấn`
/** +120 / −60 kg (dấu trừ chuẩn) */
export const fmtDelta = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n)) + ' kg'
export const money = (n?: number | null) => `${nf(0).format(Math.round(Number(n) || 0))}₫`
export const moneyShort = (n?: number | null) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e9) return `${nf(2).format(v / 1e9)} tỷ`
  if (Math.abs(v) >= 1e6) return `${nf(0).format(Math.round(v / 1e6))} tr`
  return money(v)
}
export const relTime = (iso?: string | null) => {
  if (!iso) return '—'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m} phút trước`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.round(h / 24)} ngày trước`
}
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** Số NGÀY LỊCH còn lại tới hạn: qua 0h là trừ 1 ngày, không đợi đủ 24 giờ (anh Thắng 02/11). 0 = hạn hôm nay, âm = đã trễ. */
export const daysLeft = (iso: string) => Math.round((dayStart(new Date(iso)) - dayStart(new Date())) / 86400000)
export const hoursOver = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000))
/** "Khách hàng – Tên đơn hàng" — anh Thắng 02/11: khách thân thiết có nhiều đơn gối đầu / chạy song song,
    chỉ tên khách thì không biết đơn nào. Dùng ở mọi chỗ chọn / hiện hợp đồng. */
export const custOrder = (c?: { customer?: string; orderName?: string | null } | null) =>
  c ? [c.customer, c.orderName?.trim()].filter(Boolean).join(' – ') : ''
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
