/* Phiếu nhập nguyên liệu (kho lập khi hàng về): ngày, nhà cung cấp, loại hàng (danh mục cố định), quy cách, số lượng + ĐVT,
   KG theo bên cung cấp, KG cân thực tế tại xưởng, chênh lệch tự tính, ảnh chứng từ. Lưu → gửi Quản lý duyệt.
   Anh Thắng 02/11: mọi trường đánh dấu * bắt buộc (trừ ghi chú); bỏ mác thép, loại hàng chọn trong danh mục để tổng hợp. */
import { AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useMeta } from '@/api/hooks'
import { useCreateMaterial, useMaterials, useUpdateMaterial } from '@/api/hooksMaster'
import type { MaterialReceipt } from '@/api/typesMaster'
import { PhotoInput } from '@/components/PhotoBlock'
import { fmtNum } from '@/lib/format'
import { NUM } from '@/lib/numberInput'
import { positive } from '@/peek/drawers/contract/utils'

interface V {
  date: Dayjs; supplier: string; category: string; spec: string; qty: number; unit: string
  kgSupplier: number; kg: number; photo?: string | null; note?: string
}
const UNITS = ['tấm', 'cây', 'kg', 'bộ', 'cuộn', 'bình', 'chai', 'bao', 'thùng']
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].map((v) => ({ value: v }))

export default function MaterialFormModal({ item, onClose }: { item?: MaterialReceipt; onClose: () => void }) {
  const [form] = Form.useForm<V>()
  const { data: meta } = useMeta()
  const { data: all = [] } = useMaterials()
  const create = useCreateMaterial()
  const update = useUpdateMaterial()
  const kgSup = Form.useWatch('kgSupplier', form)
  const kg = Form.useWatch('kg', form)
  const d = kgSup != null && kg != null ? kg - kgSup : null

  const submit = async () => {
    const v = await form.validateFields()
    const body = { ...v, date: v.date.toISOString(), supplier: v.supplier.trim(), spec: v.spec.trim(), unit: v.unit.trim() }
    if (item) await update.mutateAsync({ id: item.id, ...body })
    else await create.mutateAsync(body)
    onClose()
  }

  const initial: Partial<V> = item
    ? { date: dayjs(item.date), supplier: item.supplier, category: item.category || undefined, spec: item.spec, qty: item.qty || undefined,
        unit: item.unit, kgSupplier: item.kgSupplier ?? undefined, kg: item.kg, photo: item.photo, note: item.note }
    : { date: dayjs() }
  const req = (message: string) => [{ required: true, whitespace: true, message }]

  return (
    <Modal open width={640} title={item ? `Sửa phiếu nhập ${item.id}` : 'Phiếu nhập nguyên liệu'} okText={item ? 'Lưu phiếu' : 'Lưu & gửi Quản lý duyệt'} cancelText="Hủy"
      onOk={submit} onCancel={onClose} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '0 12px' }}>
          <Form.Item name="date" label="Ngày nhập" rules={[{ required: true, message: 'Chưa chọn ngày' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="supplier" label="Bên cung cấp" rules={req('Chưa nhập bên cung cấp')}>
            <AutoComplete options={uniq(all.map((m) => m.supplier))} placeholder="VD: Cty TNHH Thép Minh Khang"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="category" label="Loại hàng" rules={[{ required: true, message: 'Chọn loại hàng' }]}>
            <Select placeholder="Chọn loại hàng" options={(meta?.materialCategories ?? []).map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="spec" label="Quy cách / tên hàng" rules={req('Nhập quy cách / tên hàng')}>
            <AutoComplete options={uniq(all.map((m) => m.spec))} placeholder="VD: Thép V63×6, bulong M16×60, dây hàn 3,2 ly"
              filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 12px' }}>
          <Form.Item name="qty" label="Số lượng" rules={[{ required: true, message: 'Nhập số lượng' }, positive('Số lượng phải lớn hơn 0')]}>
            <InputNumber<number> {...NUM} min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit" label="Đơn vị tính" rules={req('Nhập đơn vị tính')}>
            <AutoComplete options={uniq([...UNITS, ...all.map((m) => m.unit)])} placeholder="tấm, cây, bình…" />
          </Form.Item>
          <Form.Item name="kgSupplier" label="KG theo bên cung cấp" rules={[{ required: true, message: 'Nhập số kg trên phiếu / hóa đơn bên cung cấp' }, positive('Nhập số kg trên phiếu / hóa đơn bên cung cấp')]}>
            <InputNumber<number> {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
          <Form.Item name="kg" label="KG cân thực tế tại xưởng" rules={[{ required: true, message: 'Nhập số kg cân thực tế' }, positive('Nhập số kg cân thực tế')]}>
            <InputNumber<number> {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
        </div>
        <Form.Item label="Chênh lệch (thực tế − NCC)" style={{ marginTop: -8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-mono)', color: d && Math.abs(d) > 0.5 ? 'var(--signal)' : 'var(--moss)' }}>
            {d == null ? '—' : Math.abs(d) <= 0.5 ? 'Khớp' : `${d > 0 ? 'thừa ' : 'thiếu '}${fmtNum(Math.abs(d))} kg`}
          </div>
        </Form.Item>
        <Form.Item name="photo" label="Ảnh chứng từ (phiếu cân / phiếu giao hàng của bên cung cấp)" rules={[{ required: true, message: 'Bắt buộc chụp ảnh chứng từ' }]}>
          <PhotoInput demo={{ label: 'Phiếu nhập NVL', kg: kg || kgSup || 0 }} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú (không bắt buộc)"><Input.TextArea rows={2} placeholder="VD: số phiếu / hóa đơn NCC, xe giao" /></Form.Item>
      </Form>
      <p className="caption" style={{ margin: 0 }}>Các ô có dấu <b className="text-signal">*</b> bắt buộc. Lưu là gửi Quản lý duyệt — duyệt xong mới tính vào thống kê và kho ảo (chênh với bên cung cấp).</p>
    </Modal>
  )
}
