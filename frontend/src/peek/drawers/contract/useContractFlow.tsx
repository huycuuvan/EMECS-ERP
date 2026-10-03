/* Chuyển bước hợp đồng (4 bước kế toán): Đã soạn thảo → Đã gửi khách hàng → Đã nhận về → Đã hoàn thành.
   Bước 1 làm ở màn Soạn thảo hợp đồng (/hop-dong/:id/soan-thao). Dùng ở drawer Hợp đồng và trang danh sách. */
import { App } from 'antd'
import { useContractCompleted, useContractReturned, useContractSigned } from '@/api/hooks'
import type { Contract } from '@/api/types'
import { fmtD, fmtNum, money } from '@/lib/format'
import { MODAL_Z } from './utils'

export function useContractFlow() {
  const { modal } = App.useApp()
  const returned = useContractReturned()
  const signed = useContractSigned()
  const completed = useContractCompleted()
  return {
    askReturned: (c: Contract) => modal.confirm({
      title: `Đã gửi hợp đồng ${c.number || c.id} cho khách hàng`,
      content: (
        <>
          <p>Kế toán đã soạn xong và gửi hợp đồng cho <b>{c.customer}</b>?</p>
          <p className="caption">Hạn gửi: {fmtD(c.dueAt)}. Sau bước này hệ thống <b>báo Quản lý</b>; bản soạn thảo vẫn sửa được tới khi nhận về.</p>
        </>
      ),
      zIndex: MODAL_Z, okText: 'Đã gửi khách hàng', cancelText: 'Hủy',
      onOk: () => returned.mutateAsync(c.id).catch(() => undefined),
    }),
    askSigned: (c: Contract) => modal.confirm({
      title: `Đã nhận về hợp đồng ${c.number || c.id} (khách đã ký)`,
      content: <p>Ghi nhận hôm nay. Sau bước này hệ thống theo dõi <b>tạm ứng {fmtNum(c.advance.pct)}% = {money(c.advance.required)}</b>; bản soạn thảo bị khóa.</p>,
      zIndex: MODAL_Z, okText: 'Đã nhận về', cancelText: 'Hủy',
      onOk: () => signed.mutateAsync(c.id).catch(() => undefined),
    }),
    askCompleted: (c: Contract) => modal.confirm({
      title: `Hoàn thành hợp đồng ${c.number || c.id}`,
      content: <p>Xác nhận hợp đồng của <b>{c.customer}</b> đã hoàn thành?</p>,
      zIndex: MODAL_Z, okText: 'Đã hoàn thành', cancelText: 'Hủy',
      onOk: () => completed.mutateAsync(c.id).catch(() => undefined),
    }),
  }
}
