/* Chuyển kế toán làm HĐ — popup xác nhận + NGÀY HOÀN THÀNH đơn (bắt buộc). Hệ thống dùng ngày này để cảnh báo
   hợp đồng sắp tới / quá ngày hoàn thành mà hợp đồng chưa xong. Dùng ở trang Đơn hàng và drawer Đơn hàng. */
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

function SendKTModal({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const [form] = Form.useForm<{ completeBy: Dayjs }>()
  const send = useSendOrderToKT()
  const { open } = usePeek()
  const submit = async () => {
    const v = await form.validateFields()
    const c = await send.mutateAsync({ id: o.id, completeBy: v.completeBy.endOf('day').format('YYYY-MM-DDTHH:mm:ssZ') })
    onClose()
    open('hd', c.id)
  }
  return (
    <Modal open zIndex={MODAL_Z} width={520} title={`Chuyển kế toán làm hợp đồng — ${o.id}`} okText="Chuyển kế toán" cancelText="Hủy"
      onOk={submit} onCancel={onClose} confirmLoading={send.isPending} destroyOnHidden>
      <p>Chuyển đơn của <b>{o.customer}</b> ({fmtT(o.totalKg)} · {moneyShort(o.value)}) sang kế toán soạn hợp đồng?</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ completeBy: o.completeBy ? dayjs(o.completeBy) : undefined }}>
        <Form.Item name="completeBy" label="Ngày hoàn thành hợp đồng" rules={[{ required: true, message: 'Chọn ngày hoàn thành' }]}
          extra="Hạn để kế toán làm xong hợp đồng (bước Đã hoàn thành). Cảnh báo khi còn ≤ 7 ngày mà hợp đồng chưa xong, báo đỏ khi quá hạn.">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Chọn ngày"
            disabledDate={(d) => d.isBefore(dayjs().startOf('day').add(1, 'day'))} />
        </Form.Item>
      </Form>
      <p className="caption" style={{ margin: 0 }}>
        Kế toán soạn hợp đồng theo mẫu và gửi khách; ngày hoàn thành là hạn duy nhất của hợp đồng. Khi gửi khách xong, hệ thống báo lại Quản lý.
      </p>
    </Modal>
  )
}
