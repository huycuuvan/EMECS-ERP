/* Chip thẻ khách hàng — lấy từ danh mục khách hàng (người dùng tạo / gắn thẻ ở Danh mục → Khách hàng & nhãn). */
import { TagChips, useCustomerTagLookup } from '../customers/tags'

export default function CustomerTags({ name, customerId }: { name: string; customerId?: number | null }) {
  const lookup = useCustomerTagLookup()
  return <TagChips tags={lookup(name, customerId)} />
}
