/* Chip thẻ khách hàng (màu cố định theo tên thẻ). */
import { CUSTOMER_TAGS, tagColor } from './customers'

export default function CustomerTags({ name }: { name: string }) {
  const tags = CUSTOMER_TAGS[name.trim()] ?? []
  if (!tags.length) return null
  return (
    <div className="cust-tags">
      {tags.map((t) => <span key={t} className="cust-tag" style={{ background: tagColor(t) }}>{t}</span>)}
    </div>
  )
}
