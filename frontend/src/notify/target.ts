/* Bấm thông báo → mở thẳng bản ghi được báo.
   Người dùng hiện trường (xưởng / lái xe) → bản điện thoại /mobile?xem=<mã>; còn lại → trang danh sách ?open=<loại>:<mã>. */
import { homeFor } from '@/layout/nav'
import { PEEK_META, peekTypeOf } from '@/peek/meta'

const MOBILE_KINDS = ['LSX', 'PC', 'PTN', 'VC', 'SL', 'HD']

export function notifTarget(ref: string | null | undefined, perms: Record<string, string> | undefined, roles: string[]): string {
  const home = homeFor(perms, roles)
  if (!ref) return home
  const prefix = ref.split('-')[0]
  if (home === '/mobile') return MOBILE_KINDS.includes(prefix) ? `/mobile?xem=${encodeURIComponent(ref)}` : '/mobile'
  if (prefix === 'NL') return perms?.['nguyen-lieu'] ? '/nguyen-lieu' : home
  const t = peekTypeOf(ref)
  if (!t) return home
  const page = PEEK_META[t].page
  const pageId = Object.entries({ '/don-hang': 'don-hang', '/hop-dong': 'hop-dong', '/lsx': 'lsx', '/tiep-nhan': 'tiep-nhan',
    '/phieu-can': 'phieu-can', '/van-chuyen': 'van-chuyen', '/sai-lech': 'sai-lech', '/kho-ao': 'kho-ao' }).find(([p]) => p === page)?.[1]
  if (pageId && !perms?.[pageId]) return home  // không có quyền xem loại bản ghi này
  return `${page}?open=${t}:${encodeURIComponent(ref)}`
}
