/* Xác nhận "Chuyển kế toán làm HĐ" — dùng ở trang Đơn hàng và drawer Đơn hàng. */
import { App } from 'antd'
import { useSendOrderToKT } from '@/api/hooks'
import type { Order } from '@/api/types'
import { fmtD, fmtT, moneyShort } from '@/lib/format'
import { usePeek } from '@/peek/context'
import { MODAL_Z } from '@/peek/drawers/contract/utils'

export function useAskSendKT() {
  const { modal } = App.useApp()
  const send = useSendOrderToKT()
  const { open } = usePeek()
  return (o: Order) => modal.confirm({
    title: `Chuyển kế toán làm hợp đồng — ${o.id}`,
    width: 520,
    zIndex: MODAL_Z,
    content: (
      <>
        <p>Chuyển đơn của <b>{o.customer}</b> ({fmtT(o.totalKg)} · {moneyShort(o.value)}) sang kế toán?</p>
        <p className="caption">
          Sau khi chuyển: kế toán phải <b>trả hợp đồng cho khách trong 05 ngày</b>. Giá trên hợp đồng tính theo{' '}
          <b>giá thép thị trường ngày chốt đơn</b> ({fmtD(o.date)}) — quá 05 ngày hệ thống báo đỏ trên dashboard.
        </p>
      </>
    ),
    okText: 'Chuyển kế toán', cancelText: 'Hủy',
    onOk: () => send.mutateAsync(o.id).then((c) => open('hd', c.id)).catch(() => undefined),
  })
}
