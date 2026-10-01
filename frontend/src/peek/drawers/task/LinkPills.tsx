/* Mục "Đối tượng liên quan" cuối drawer (pk-links / pk-pill của demo). */
import { Link2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Sec } from '@/components/ui'
import { usePeek } from '@/peek/context'
import { PEEK_META, peekTypeOf } from '@/peek/meta'

export interface PillSpec { id: string | null | undefined; extra?: string; danger?: boolean }

export function LinkPill({ id, extra, danger }: PillSpec) {
  const { open } = usePeek()
  const t = id ? peekTypeOf(id) : null
  if (!id || !t) return null
  const Icon = PEEK_META[t].icon
  const onClick = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); open(t, id) }
  return (
    <a onClick={onClick} className="link-pill"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', fontSize: 12, fontFamily: 'var(--ff-mono)', background: 'var(--canvas)',
        border: `1px solid ${danger ? 'var(--signal)' : 'var(--rule)'}`, borderRadius: 10, color: danger ? 'var(--signal)' : 'var(--ink)', cursor: 'pointer', lineHeight: 1.35 }}>
      <Icon size={14} />
      <span>
        <span style={{ color: 'var(--ash)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>{PEEK_META[t].label}</span><br />
        <b>{id}</b>{extra ? ` · ${extra}` : ''}
      </span>
    </a>
  )
}

export default function LinkPills({ items }: { items: PillSpec[] }) {
  const list = items.filter((x) => x.id)
  return (
    <>
      <Sec icon={<Link2 />}>Đối tượng liên quan</Sec>
      {list.length
        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{list.map((x) => <LinkPill key={x.id!} {...x} />)}</div>
        : <span className="caption">Chưa có liên kết.</span>}
    </>
  )
}
