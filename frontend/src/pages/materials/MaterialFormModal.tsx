/* Phiếu nhập nguyên liệu mua vào: ngày, nhà cung cấp, mác thép, quy cách, số lượng, khối lượng. */
import { AutoComplete, DatePicker, Form, Input, InputNumber, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCreateMaterial, useMaterials, useUpdateMaterial } from '@/api/hooksMaster'
import type { MaterialReceipt } from '@/api/typesMaster'
import { numFormatter, numParser, positive } from '@/peek/drawers/contract/utils'

interface V { date: Dayjs; supplier: string; steelGrade?: string; spec?: string; qty?: number; unit?: string; kg: number; note?: string }
const GRADES = ['SS400', 'Q345B', 'A572', 'CT3', 'S355JR']
const UNITS = ['tấm', 'cây', 'cuộn', 'bó', 'tấn']

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].map((v) => ({ value: v }))

export default function MaterialFormModal({ item, onClose }: { item?: MaterialReceipt; onClose: () => void }) {
  const [form] = Form.useForm<V>()
  const { data: all = [] } = useMaterials()
  const create = useCreateMaterial()
  const update = useUpdateMaterial()

  const submit = async () => {
    const v = await form.validateFields()
    const body = { ...v, date: v.date.toISOString(), supplier: v.supplier.trim() }
    if (item) await update.mutateAsync({ id: item.id, ...body })
    else await create.mutateAsync(body)
    onClose()
  }

  const initial: Partial<V> = item
    ? { ...item, date: dayjs(item.date) }
    : { date: dayjs(), unit: 'tấm', steelGrade: 'SS400' }

  return (
    <Modal open width={600} title={item ? `Sửa phiếu nhập ${item.id}` : 'Nhập nguyên liệu mua vào'} okText="Lưu phiếu" cancelText="Hủy"
      onOk={submit} onCancel={onClose} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 12px' }}>
          <Form.Item name="date" label="Ngày nhập" rules={[{ required: true, message: 'Chưa chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="supplier" label="Nhà cung cấp" rules={[{ required: true, whitespace: true, message: 'Chưa nhập nhà cung cấp' }]}>
            <AutoComplete options={uniq(all.map((m) => m.supplier))} placeholder="VD: Cty TNHH Thép Minh Khang"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="steelGrade" label="Mác thép">
            <AutoComplete options={uniq([...GRADES, ...all.map((m) => m.steelGrade)])} placeholder="VD: SS400" />
          </Form.Item>
          <Form.Item name="spec" label="Quy cách">
            <AutoComplete options={uniq(all.map((m) => m.spec))} placeholder="VD: Thép tấm 12×1500×6000"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: '0 12px' }}>
          <Form.Item name="qty" label="Số lượng"><InputNumber<number> min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="unit" label="Đơn vị"><AutoComplete options={UNITS.map((u) => ({ value: u }))} /></Form.Item>
          <Form.Item name="kg" label="Khối lượng (kg)" rules={[positive('Khối lượng phải lớn hơn 0')]}>
            <InputNumber<number> min={0} style={{ width: '100%' }} formatter={numFormatter} parser={numParser} suffix="kg" />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} placeholder="VD: số phiếu cân / hóa đơn của NCC" /></Form.Item>
      </Form>
    </Modal>
  )
}
