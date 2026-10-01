/* "Đối tượng liên quan" — các pill bấm mở drawer chồng lớp (pill() của ERPPeek trong demo). */
import { Link2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sec } from '@/components/ui'
import { usePeek } from '../../context'
import { PEEK_META, type PeekType } from '../../meta'
import './contract.css'

export interface PillDef { type: PeekType; id: string | null | undefined; extra?: string }

export function RecordPill({ type, id, extra }: PillDef) {
  const { open } = usePeek()
  if (!id) return null
  const meta = PEEK_META[type]
  const Icon = meta.icon
  return (
    <a className="pk-pill" onClick={(e) => { e.stopPropagation(); open(type, id) }}>
      <Icon size={14} />
      <span><span className="pk-pill-t">{meta.label}</span>{id}{extra ? ` · ${extra}` : ''}</span>
    </a>
  )
}

export default function RelatedLinks({ pills, title = 'Đối tượng liên quan' }: { pills: PillDef[]; title?: ReactNode }) {
  const list = pills.filter((p) => p.id)
  return (
    <>
      <Sec icon={<Link2 />}>{title}</Sec>
      <div className="pk-links">
        {list.length ? list.map((p) => <RecordPill key={`${p.type}:${p.id}`} {...p} />) : <span className="pk-empty">Chưa có liên kết.</span>}
      </div>
    </>
  )
}
