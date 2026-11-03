/* "Khách hàng – Tên đơn hàng" cạnh mã hợp đồng ở mọi bảng / phiếu (anh Thắng 02/11: khách thân thiết có nhiều đơn gối đầu,
   chỉ nhìn mã HĐ không biết hàng của đơn nào). Tra theo danh sách hợp đồng đã tải (dùng chung cache), không tra được thì bỏ trống. */
import type { CSSProperties } from 'react'
import { useContracts } from '@/api/hooks'
import { custOrder } from '@/lib/format'
import RecordLink from './RecordLink'

function useCustOrder(id?: string | null) {
  const { data } = useContracts()
  return id ? custOrder(data?.find((c) => c.id === id)) : ''
}

/** Chỉ phần chữ "Khách – Tên đơn" (chèn giữa dòng), kèm tiền tố / hậu tố khi có. */
export function CustOrderText({ id, prefix = '', suffix = '' }: { id?: string | null; prefix?: string; suffix?: string }) {
  const t = useCustOrder(id)
  return t ? <>{prefix}{t}{suffix}</> : null
}

/** Mã HĐ bấm được + dòng "Khách – Tên đơn" nhỏ bên dưới — dùng ở cột Hợp đồng của các bảng. */
export default function ContractRef({ id, style }: { id?: string | null; style?: CSSProperties }) {
  const t = useCustOrder(id)
  return (
    <>
      <RecordLink id={id} type="hd" style={style} />
      {t && <div className="sub-soft" style={{ fontSize: 11.5, lineHeight: 1.35, whiteSpace: 'normal' }}>{t}</div>}
    </>
  )
}
