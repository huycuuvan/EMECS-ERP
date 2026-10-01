/* Thẻ khách hàng (Khách thân thiết / Khách lẻ / … do người dùng tạo): chip màu, ô lọc theo thẻ, tra thẻ theo khách. */
import { Select } from 'antd'
import { Tag as TagIcon, X } from 'lucide-react'
import { useCallback, useMemo, type CSSProperties } from 'react'
import { useCustomers, useTags } from '@/api/hooksMaster'
import type { TagItem } from '@/api/typesMaster'
import { useAuth } from '@/lib/auth'
import '@/peek/drawers/contract/contract.css'

export const TAG_COLORS = ['#2f5d3a', '#4a5560', '#c5400a', '#3f6f8c', '#2f7a6a', '#8a1f1f', '#6b4a8a', '#9c7714', '#14130f']

export function TagChip({ tag, onClose }: { tag: Pick<TagItem, 'name' | 'color'>; onClose?: () => void }) {
  return (
    <span className="cust-tag" style={{ background: tag.color, gap: 3 }}>
      {tag.name}
      {onClose && (
        <X size={10} style={{ cursor: 'pointer', opacity: .8 }} aria-label={`Gỡ thẻ ${tag.name}`}
          onClick={(e) => { e.stopPropagation(); onClose() }} />
      )}
    </span>
  )
}

export function TagChips({ tags, style }: { tags: Pick<TagItem, 'name' | 'color'>[]; style?: CSSProperties }) {
  if (!tags.length) return null
  return <div className="cust-tags" style={style}>{tags.map((t) => <TagChip key={t.name} tag={t} />)}</div>
}

/** Ô lọc theo thẻ khách hàng (dùng ở Đơn hàng, Hợp đồng, Dashboard). value = id thẻ. */
export function TagFilter({ value, onChange, size, style }: { value?: number; onChange: (v?: number) => void; size?: 'small' | 'middle'; style?: CSSProperties }) {
  const { data: tags = [] } = useTags()
  if (!tags.length) return null
  return (
    <Select allowClear size={size} value={value} onChange={(v) => onChange(v ?? undefined)} placeholder="Tất cả khách hàng"
      style={{ minWidth: 190, ...style }} popupMatchSelectWidth={false} suffixIcon={<TagIcon size={13} />}
      options={tags.map((t) => ({
        value: t.id,
        label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: t.color, flex: 'none' }} />{t.name}
          {t.customerCount != null && <span className="caption num">({t.customerCount})</span>}
        </span>,
      }))} />
  )
}

/** Tra thẻ của khách theo id (ưu tiên) hoặc tên. Chỉ tải danh mục khi người dùng được xem đơn hàng. */
export function useCustomerTagLookup() {
  const { can } = useAuth()
  const { data: customers } = useCustomers(undefined, can('don-hang'))
  const maps = useMemo(() => {
    const byId = new Map<number, TagItem[]>(), byName = new Map<string, TagItem[]>()
    for (const c of customers ?? []) { byId.set(c.id, c.tags); byName.set(c.name.trim().toLowerCase(), c.tags) }
    return { byId, byName }
  }, [customers])
  return useCallback((name: string, customerId?: number | null): TagItem[] =>
    (customerId != null ? maps.byId.get(customerId) : undefined) ?? maps.byName.get(name.trim().toLowerCase()) ?? [], [maps])
}
