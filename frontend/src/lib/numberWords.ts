/* Đọc số tiền thành chữ tiếng Việt — cùng quy tắc backend (app/contract_doc.py: number_words):
   1186827681 → "Một tỉ, một trăm tám mươi sáu triệu, tám trăm hai mươi bảy nghìn, sáu trăm tám mươi mốt đồng". */
const D = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const GROUPS = ['', 'nghìn', 'triệu', 'tỉ', 'nghìn tỉ', 'triệu tỉ']

function three(n: number, full: boolean): string {
  const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, u = n % 10
  const out: string[] = []
  if (h || full) out.push(D[h], 'trăm')
  if (t === 0) { if (u && (h || full)) out.push('linh') }
  else if (t === 1) out.push('mười')
  else out.push(D[t], 'mươi')
  if (u) {
    if (u === 1 && t >= 2) out.push('mốt')
    else if (u === 5 && t >= 1) out.push('lăm')
    else if (u === 4 && t >= 2) out.push('tư')
    else out.push(D[u])
  }
  return out.join(' ')
}

export function numberWords(v: number): string {
  let n = Math.round(v || 0)
  if (n <= 0) return 'Không đồng'
  const groups: number[] = []
  while (n) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]) parts.push(`${three(groups[i], i !== groups.length - 1)} ${GROUPS[i]}`.trim())
  }
  const s = parts.join(', ') + ' đồng'
  return s[0].toUpperCase() + s.slice(1)
}
