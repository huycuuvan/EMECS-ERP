import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { usePeek } from './context'
import { peekTypeOf, type PeekType } from './meta'

/** Mã bản ghi bấm được → mở drawer. Loại tự suy từ tiền tố mã nếu không truyền `type`. */
export default function RecordLink({ id, type, children, style, danger }: { id?: string | null; type?: PeekType; children?: ReactNode; style?: CSSProperties; danger?: boolean }) {
  const { open } = usePeek()
  if (!id) return <span className="text-ash">—</span>
  const t = type ?? peekTypeOf(id)
  if (!t) return <span className="mono">{id}</span>
  const onClick = (e: MouseEvent) => { e.stopPropagation(); open(t, id) }
  return (
    <a className="id-link" style={{ ...(danger ? { color: 'var(--signal)' } : {}), ...style }} onClick={onClick}>
      {children ?? id}
    </a>
  )
}
