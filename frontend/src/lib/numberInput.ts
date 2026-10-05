/* Ô nhập số kiểu Việt Nam cho antd InputNumber: hiển thị 1.234.567,5 (nghìn = ".", thập phân = ",").
   Gõ được cả "12,5" lẫn "12.5" (dấu chấm KHÔNG theo nhóm 3 số = thập phân), "1.500" = một nghìn năm trăm. */

/** Chuỗi người dùng gõ → số. Rỗng → NaN. */
export function parseVN(input?: string | number | null): number {
  if (typeof input === 'number') return input
  let s = String(input ?? '').trim().replace(/[\s₫]|kg/gi, '')
  if (!s) return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')  // 1.234,5 → 1234.5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')  // 1.500 / 1.234.567 → nghìn
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Số → "1.234.567,5" (tối đa 3 chữ số thập phân). */
export function formatVN(v?: string | number | null): string {
  if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return ''
  const n = typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : parseVN(v)
  if (!Number.isFinite(n)) return String(v)
  const [i, d] = String(Math.round(n * 1000) / 1000).split('.')
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '')
}

/** formatter: đang gõ thì giữ nguyên chữ người dùng (không nhảy con trỏ, gõ được "12,"); rời ô thì định dạng. */
export const numFormatter = (v: string | number | undefined, info?: { userTyping: boolean; input: string }) =>
  info?.userTyping ? info.input : formatVN(v)

export const numParser = (v: string | undefined): number => {
  const n = parseVN(v)
  return (Number.isFinite(n) ? n : (v ?? '').trim() === '' ? '' : NaN) as number
}

/** Gắn vào InputNumber: <InputNumber {...NUM} /> */
export const NUM = { formatter: numFormatter, parser: numParser }
