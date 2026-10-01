/* Sửa phiếu tiếp nhận thành phẩm (lưu lịch sử): số lượng, khối lượng, ghi chú. Đổi số lượng / kg bắt buộc lý do sửa. */
import { Form, Input, InputNumber, Modal } from 'antd'
import { useEditReceipt } from '@/api/hooksEdit'
import type { Receipt } from '@/api/types'
import { InfoBox } from '../lsx/boxes'
import { MODAL_Z } from '../mismatches/sign'
import { EditReasonField } from '../weighings/EditWeighingModal'

type V = { qty: number; kg: number; note?: string; reason?: string }

export default function EditReceiptModal({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const edit = useEditReceipt()
  const [form] = Form.useForm<V>()
  const qty = Form.useWatch('qty', form)
  const kg = Form.useWatch('kg', form)
  const numChanged = (typeof qty === 'number' && qty !== r.qty) || (typeof kg === 'number' && kg !== r.kg)

  const submit = async () => {
    const v = await form.validateFields()
    await edit.mutateAsync({ id: r.id, qty: v.qty, kg: v.kg, note: v.note ?? '', reason: (v.reason || '').trim() || undefined })
    onClose()
  }

  return (
    <Modal open zIndex={MODAL_Z} title={`Sửa phiếu tiếp nhận ${r.id}`} okText="Lưu thay đổi" cancelText="Hủy"
      confirmLoading={edit.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>Lệnh <b>{r.lsxId}</b> · HĐ <b>{r.contractId}</b>. Mọi thay đổi được lưu vào lịch sử chỉnh sửa. Kho không được nhận vượt số kg xưởng đã báo hoàn thành.</InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ qty: r.qty, kg: r.kg, note: r.note }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="qty" label="Số lượng SP" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Số lượng phải lớn hơn 0' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="kg" label="Khối lượng (kg)" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Khối lượng phải lớn hơn 0' }]}>
            <InputNumber min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
        <EditReasonField required={numChanged} />
      </Form>
    </Modal>
  )
}
