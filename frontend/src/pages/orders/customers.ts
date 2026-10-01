/* Thẻ khách hàng (ERPTags.DEFAULTS của bản demo) — chỉ hiển thị, màu cố định theo tên thẻ. */
export const CUSTOMER_TAGS: Record<string, string[]> = {
  'Cty CP Kết cấu thép FECON': ['Ưu tiên', 'Đối tác lâu năm'], 'Nhà máy Thép Việt Ý': ['Trả đúng hạn'],
  'Cty TNHH Cơ điện Delta': ['Nhạy giá'], 'Tổng thầu Hòa Bình': ['Ưu tiên', 'Ưa giao nhanh'],
  'Cty Nhà thép PEB Việt Nam': ['Đối tác lâu năm'], 'Ban QLDA Cầu đường 5': ['Cần chăm sóc'],
}
const PALETTE = ['#c5400a', '#2f5d3a', '#4a5560', '#9c7714', '#8a1f1f', '#3f6f8c', '#6b4a8a']
export function tagColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export const UNITS = ['cấu kiện', 'bộ', 'bó', 'cụm', 'md', 'tấm']
