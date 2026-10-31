/* Chuyển kế toán làm HĐ — popup xác nhận + 2 MỐC (anh Thắng chốt 06/10):
   - Hạn soạn thảo hợp đồng (anh Thắng 31/10, trước là hạn trả HĐ): xong khi kế toán soạn xong (mặc định 05 ngày).
   - Hạn nhận đủ hồ sơ (anh Thắng 31/10, trước là hạn giao hàng): xong khi kế toán bấm Hoàn thành hợp đồng.
   Mỗi mốc cảnh báo riêng khi còn ≤ 7 ngày và báo đỏ khi quá hạn. Dùng ở trang Đơn hàng và drawer Đơn hàng. */
import { DatePicker, Form, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useState } from 'react'
import { useSendOrderToKT } from '@/api/hooks'
import type { Order } from '@/api/types'
import { fmtT, moneyShort } from '@/lib/format'
import { usePeek } from '@/peek/context'
import { MODAL_Z } from '@/peek/drawers/contract/utils'

export function useAskSendKT() {
  const [order, setOrder] = useState<Order | null>(null)
  const ask = (o: Order) => setOrder(o)
  const dialog = order ? <SendKTModal order={order} onClose={() => setOrder(null)} /> : null
  return Object.assign(ask, { dialog })
}

const iso = (d: Dayjs) => d.endOf('day').format('YYYY-MM-DDTHH:mm:ssZ')
const notPast = (d: Dayjs) => d.isBefore(dayjs().startOf('day').add(1, 'day'))

function SendKTModal({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const [form] = Form.useForm<{ completeBy: Dayjs; deliverBy: Dayjs }>()
  const send = useSendOrderToKT()
  const { open } = usePeek()
  const submit = async () => {
    const v = await form.validateFields()
    const c = await send.mutateAsync({ id: o.id, completeBy: iso(v.completeBy), deliverBy: iso(v.deliverBy) })
    onClose()
    open('hd', c.id)
  }
  return (
    <Modal open zIndex={MODAL_Z} width={560} title={`Chuyển kế toán làm hợp đồng — ${o.id}`} okText="Chuyển kế toán" cancelText="Hủy"
      onOk={submit} onCancel={onClose} confirmLoading={send.isPending} destroyOnHidden>
      <p>Chuyển đơn của <b>{o.customer}</b> ({fmtT(o.totalKg)} · {moneyShort(o.value)}) sang kế toán soạn hợp đồng?</p>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ completeBy: o.completeBy ? dayjs(o.completeBy) : dayjs().add(5, 'day'), deliverBy: o.deliverBy ? dayjs(o.deliverBy) : undefined }}>
        <Form.Item name="completeBy" label="Hạn soạn thảo hợp đồng (kế toán)" rules={[{ required: true, message: 'Chọn hạn soạn thảo hợp đồng' }]}
          extra="Kế toán soạn xong hợp đồng trước ngày này (mặc định 05 ngày).">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày" disabledDate={notPast} />
        </Form.Item>
        <Form.Item name="deliverBy" label="Hạn nhận đủ hồ sơ" rules={[{ required: true, message: 'Chọn hạn nhận đủ hồ sơ' }]}
          extra="Giao đủ hàng và nhận đủ hồ sơ (biên bản giao nhận ký…), kế toán bấm Hoàn thành trước ngày này. Gợi ý sẵn vào hợp đồng mục thời gian giao hàng (kế toán sửa được); khi phát lệnh SX hệ thống nhắc nếu hạn lệnh trễ hơn.">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày" disabledDate={notPast} />
        </Form.Item>
      </Form>
      <p className="caption" style={{ margin: 0 }}>
        Mỗi mốc cảnh báo khi còn ≤ 7 ngày mà chưa xong và báo đỏ khi quá hạn. Kế toán gửi khách xong, hệ thống báo lại Quản lý.
      </p>
    </Modal>
  )
}
