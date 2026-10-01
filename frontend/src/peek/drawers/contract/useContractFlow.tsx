/* Xác nhận Đã trả HĐ / Đã ký — dùng ở drawer Hợp đồng và trang danh sách. */
import { App } from 'antd'
import { useContractReturned, useContractSigned } from '@/api/hooks'
import type { Contract } from '@/api/types'
import { fmtD, fmtNum, money } from '@/lib/format'
import { MODAL_Z } from './utils'

export function useContractFlow() {
  const { modal } = App.useApp()
  const returned = useContractReturned()
  const signed = useContractSigned()
  return {
    askReturned: (c: Contract) => modal.confirm({
      title: `Xác nhận đã trả hợp đồng ${c.id}`,
      content: (
        <>
          <p>Kế toán đã soạn xong và trả hợp đồng cho khách <b>{c.customer}</b>?</p>
          <p className="caption">Hạn trả: {fmtD(c.dueAt)} — hệ thống sẽ tắt cảnh báo đến hạn.</p>
        </>
      ),
      zIndex: MODAL_Z, okText: 'Đã trả khách', cancelText: 'Hủy',
      onOk: () => returned.mutateAsync(c.id).catch(() => undefined),
    }),
    askSigned: (c: Contract) => modal.confirm({
      title: `Khách đã ký hợp đồng ${c.id}`,
      content: <p>Ghi nhận ngày ký hôm nay. Sau khi ký, hệ thống theo dõi <b>tạm ứng {fmtNum(c.advance.pct)}% = {money(c.advance.required)}</b> đã về chưa.</p>,
      zIndex: MODAL_Z, okText: 'Ghi nhận đã ký', cancelText: 'Hủy',
      onOk: () => signed.mutateAsync(c.id).catch(() => undefined),
    }),
  }
}
