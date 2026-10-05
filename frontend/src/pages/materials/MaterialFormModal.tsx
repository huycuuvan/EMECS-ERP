/* Phiếu nhập nguyên liệu (kho lập khi hàng về): ngày, nhà cung cấp, loại hàng, KG theo bên cung cấp, KG cân thực tế
   tại xưởng, chênh lệch tự tính, ảnh chứng từ. Lưu → ghi nhận + báo Quản lý (chỉ thống kê, không cần duyệt). */
import { AutoComplete, DatePicker, Form, Input, InputNumber, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCreateMaterial, useMaterials, useUpdateMaterial } from '@/api/hooksMaster'
import type { MaterialReceipt } from '@/api/typesMaster'
import { PhotoInput } from '@/components/PhotoBlock'
import { fmtNum } from '@/lib/format'
import { NUM } from '@/lib/numberInput'
import { positive } from '@/peek/drawers/contract/utils'

interface V { date: Dayjs; supplier: string; spec?: string; steelGrade?: string; kgSupplier?: number; kg: number; photo?: string | null; note?: string }
const GRADES = ['SS400', 'Q345B', 'A572', 'CT3', 'S355JR']
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].map((v) => ({ value: v }))

export default function MaterialFormModal({ item, onClose }: { item?: MaterialReceipt; onClose: () => void }) {
  const [form] = Form.useForm<V>()
  const { data: all = [] } = useMaterials()
  const create = useCreateMaterial()
  const update = useUpdateMaterial()
  const kgSup = Form.useWatch('kgSupplier', form)
  const kg = Form.useWatch('kg', form)
  const d = kgSup != null && kg != null ? kg - kgSup : null

  const submit = async () => {
    const v = await form.validateFields()
    const body = { ...v, date: v.date.toISOString(), supplier: v.supplier.trim() }
    if (item) await update.mutateAsync({ id: item.id, ...body })
    else await create.mutateAsync(body)
    onClose()
  }

  const initial: Partial<V> = item
    ? { date: dayjs(item.date), supplier: item.supplier, spec: item.spec, steelGrade: item.steelGrade, kgSupplier: item.kgSupplier ?? undefined,
        kg: item.kg, photo: item.photo, note: item.note }
    : { date: dayjs() }

  return (
    <Modal open width={620} title={item ? `Sửa phiếu nhập ${item.id}` : 'Phiếu nhập nguyên liệu'} okText={item ? 'Lưu phiếu' : 'Lưu & gửi Quản lý'} cancelText="Hủy"
      onOk={submit} onCancel={onClose} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '0 12px' }}>
          <Form.Item name="date" label="Ngày nhập" rules={[{ required: true, message: 'Chưa chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="supplier" label="Bên cung cấp" rules={[{ required: true, whitespace: true, message: 'Chưa nhập bên cung cấp' }]}>
            <AutoComplete options={uniq(all.map((m) => m.supplier))} placeholder="VD: Cty TNHH Thép Minh Khang"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="steelGrade" label="Mác thép (nếu có)">
            <AutoComplete options={uniq([...GRADES, ...all.map((m) => m.steelGrade)])} placeholder="VD: SS400" />
          </Form.Item>
          <Form.Item name="spec" label="Loại hàng (nếu có)">
            <AutoComplete options={uniq(all.map((m) => m.spec))} placeholder="VD: Thép tấm 12 ly"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 12px' }}>
          <Form.Item name="kgSupplier" label="KG theo bên cung cấp" rules={[positive('Nhập số kg trên phiếu / hóa đơn bên cung cấp')]}>
            <InputNumber<number> {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
          <Form.Item name="kg" label="KG cân thực tế tại xưởng" rules={[positive('Nhập số kg cân thực tế')]}>
            <InputNumber<number> {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
          <Form.Item label="Chênh lệch (thực tế − NCC)">
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--ff-mono)', color: d && Math.abs(d) > 0.5 ? 'var(--signal)' : 'var(--moss)' }}>
              {d == null ? '—' : Math.abs(d) <= 0.5 ? 'Khớp' : `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))} kg`}
            </div>
          </Form.Item>
        </div>
        <Form.Item name="photo" label="Ảnh chứng từ (phiếu cân / phiếu giao hàng của bên cung cấp)" rules={[{ required: true, message: 'Bắt buộc chụp ảnh chứng từ' }]}>
          <PhotoInput demo={{ label: 'Phiếu nhập NVL', kg: kg || kgSup || 0 }} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} placeholder="VD: số phiếu / hóa đơn NCC, xe giao" /></Form.Item>
      </Form>
      <p className="caption" style={{ margin: 0 }}>Lưu là ghi nhận vào hệ thống và báo Quản lý (có chênh thì ghi rõ). Chỉ để thống kê — không cần duyệt.</p>
    </Modal>
  )
}
