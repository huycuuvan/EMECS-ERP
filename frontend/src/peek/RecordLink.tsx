import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { NAV_FLAT } from '@/layout/nav'
import { useAuth } from '@/lib/auth'
import { usePeek } from './context'
import { PEEK_META, peekTypeOf, type PeekType } from './meta'

/** Mã bản ghi bấm được → mở drawer. Loại tự suy từ tiền tố mã nếu không truyền `type`. */
export default function RecordLink({ id, type, children, style, danger }: { id?: string | null; type?: PeekType; children?: ReactNode; style?: CSSProperties; danger?: boolean }) {
  const { open } = usePeek()
  const { level } = useAuth()
  if (!id) return <span className="text-ash">—</span>
  const t = type ?? peekTypeOf(id)
  // bản ghi thuộc màn vai trò không được xem → chỉ hiện mã, không mở hồ sơ
  const page = t ? NAV_FLAT.find((n) => n.path === PEEK_META[t].page) : undefined
  if (!t || (page && !level(page.id))) return <span className="mono">{children ?? id}</span>
  const onClick = (e: MouseEvent) => { e.stopPropagation(); open(t, id) }
  return (
    <a className="id-link" style={{ ...(danger ? { color: 'var(--signal)' } : {}), ...style }} onClick={onClick}>
      {children ?? id}
    </a>
  )
}
