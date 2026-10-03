/* Thẻ khách hàng (Khách thân thiết / Khách lẻ / … do người dùng tạo): chip màu, ô lọc theo thẻ, tra thẻ theo khách. */
import { Select } from 'antd'
import { Tag as TagIcon, X } from 'lucide-react'
import { useCallback, useMemo, type CSSProperties } from 'react'
import { useCustomers, useTags } from '@/api/hooksMaster'
import { SEGMENTS, type TagItem } from '@/api/typesMaster'
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

export const SEGMENT_COLORS: Record<string, string> = { 'Thân thiết': '#2f5d3a', 'Đơn lẻ': '#9c7714' }

/** Chip phân loại khách hàng (Thân thiết / Đơn lẻ). */
export function SegmentChip({ segment }: { segment: string }) {
  if (!segment) return <span className="text-ash">Chưa phân loại</span>
  return <TagChip tag={{ name: segment, color: SEGMENT_COLORS[segment] ?? '#4a5560' }} />
}

const dot = (color: string, text: string, extra?: number) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: 'none' }} />{text}
    {extra != null && <span className="caption num">({extra})</span>}
  </span>
)

/** Ô lọc khách hàng (Đơn hàng, Hợp đồng, Dashboard, Khách hàng): theo phân loại ("seg:Thân thiết") hoặc nhãn ("tag:3"). */
export function TagFilter({ value, onChange, size, style }: { value?: string; onChange: (v?: string) => void; size?: 'small' | 'middle'; style?: CSSProperties }) {
  const { data: tags = [] } = useTags()
  const options = [
    { label: 'Phân loại khách', title: 'seg', options: SEGMENTS.map((s) => ({ value: `seg:${s}`, label: dot(SEGMENT_COLORS[s], s) })) },
    ...(tags.length ? [{ label: 'Nhãn', title: 'tag', options: tags.map((t) => ({ value: `tag:${t.id}`, label: dot(t.color, t.name, t.customerCount ?? undefined) })) }] : []),
  ]
  return (
    <Select allowClear size={size} value={value} onChange={(v) => onChange(v ?? undefined)} placeholder="Tất cả khách hàng"
      style={{ minWidth: 190, ...style }} popupMatchSelectWidth={false} suffixIcon={<TagIcon size={13} />} options={options} />
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
