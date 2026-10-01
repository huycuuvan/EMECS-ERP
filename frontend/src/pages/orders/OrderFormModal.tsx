/* Form Đơn hàng mới (khách đã ký chốt) / Chỉnh sửa đơn hàng — dùng ở trang Đơn hàng và drawer Đơn hàng. */
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useCreateOrder, useOrders, useUpdateOrder } from '@/api/hooks'
import type { Order, OrderItem } from '@/api/types'
import { fmtT, money } from '@/lib/format'
import { MODAL_Z, numFormatter, numParser, positive } from '@/peek/drawers/contract/utils'
import { useCustomers } from '@/api/hooksMaster'
import { UNITS } from './customers'

const NEW = '__new__'
type ItemVals = Omit<OrderItem, 'id'>
interface Vals { cust: string; custNew?: string; code?: string; items: ItemVals[]; file: string; note?: string }

export default function OrderFormModal({ order, onClose, onSaved }: { order?: Order; onClose: () => void; onSaved?: (o: Order) => void }) {
  const [form] = Form.useForm<Vals>()
  const create = useCreateOrder()
  const update = useUpdateOrder()
  const { data: orders = [] } = useOrders()
  const { data: catalog = [] } = useCustomers()
  const customers = useMemo(() => {
    const s = new Set<string>(catalog.filter((c) => c.active).map((c) => c.name))
    orders.forEach((o) => s.add(o.customer))
    if (order) s.add(order.customer)
    return [...s]
  }, [catalog, orders, order])
  const cust = Form.useWatch('cust', form)
  const items = Form.useWatch('items', form) as ItemVals[] | undefined
  const totalKg = (items ?? []).reduce((s, i) => s + (Number(i?.kg) || 0), 0)
  const value = (items ?? []).reduce((s, i) => s + (Number(i?.kg) || 0) * (Number(i?.price) || 0), 0)

  const submit = async () => {
    const v = await form.validateFields()
    const customer = (v.cust === NEW ? v.custNew ?? '' : v.cust).trim()
    const its = v.items.map((i) => ({ name: i.name.trim(), qty: i.qty, unit: i.unit, kg: i.kg, price: i.price }))
    const file = (v.file || '').trim() || 'don-hang-ky-chot.pdf'
    const o = order
      ? await update.mutateAsync({ id: order.id, customer, code: v.code?.trim() || undefined, items: its, file, note: v.note ?? '' })
      : await create.mutateAsync({ customer, items: its, file, note: v.note ?? '' })
    onSaved?.(o)
    onClose()
  }

  const initial: Vals = order
    ? { cust: order.customer, code: order.code, file: order.file ?? '', note: order.note,
        items: order.items.map(({ name, qty, unit, kg, price }) => ({ name, qty, unit, kg, price })) }
    : { cust: customers[0], file: 'don-hang-ky-chot.pdf', note: '', items: [{ name: '', unit: 'cấu kiện' } as ItemVals] }

  return (
    <Modal open zIndex={MODAL_Z} width={680} title={order ? `Chỉnh sửa đơn hàng ${order.id}` : 'Đơn hàng mới (khách đã ký chốt)'}
      okText={order ? 'Lưu' : 'Lưu đơn hàng'} cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: order ? '2fr 1fr' : '1fr', gap: '0 12px' }}>
          <Form.Item name="cust" label="Khách hàng" rules={[{ required: true, message: 'Chưa chọn hoặc nhập tên khách hàng' }]}>
            <Select showSearch options={[...customers.map((c) => ({ value: c, label: c })), { value: NEW, label: '— Khách mới (nhập tên) —' }]} />
          </Form.Item>
          {order && <Form.Item name="code" label="Mã nội bộ"><Input /></Form.Item>}
        </div>
        {cust === NEW && (
          <Form.Item name="custNew" label="Tên khách mới" rules={[{ required: true, whitespace: true, message: 'Chưa chọn hoặc nhập tên khách hàng' }]}>
            <Input placeholder="VD: Cty Kết cấu thép Miền Bắc" />
          </Form.Item>
        )}

        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f, idx) => (
                <div key={f.key} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '10px 12px 0', marginBottom: 10, background: 'var(--paper)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Form.Item name={[f.name, 'name']} label={fields.length > 1 ? `Tên hàng hóa #${idx + 1}` : 'Tên hàng hóa'} style={{ flex: 1 }}
                      rules={[{ required: true, whitespace: true, message: 'Chưa nhập tên hàng hóa' }]}>
                      <Input placeholder="VD: Dầm thép I-400 tổ hợp (mạ kẽm)" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button type="text" danger icon={<Trash2 size={14} />} style={{ marginTop: 30 }} onClick={() => remove(f.name)} aria-label="Xóa hạng mục" />
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 10px' }}>
                    <Form.Item name={[f.name, 'qty']} label="Số lượng" rules={[positive('Số lượng phải lớn hơn 0')]}>
                      <InputNumber<number> style={{ width: '100%' }} min={0} placeholder="VD: 50" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'unit']} label="Đơn vị">
                      <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'kg']} label="Khối lượng (kg)" rules={[positive('Khối lượng (kg) phải lớn hơn 0')]}>
                      <InputNumber<number> style={{ width: '100%' }} min={0} placeholder="VD: 25.000" formatter={numFormatter} parser={numParser} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'price']} label="Đơn giá (₫/kg)" rules={[positive('Đơn giá (₫/kg) phải lớn hơn 0')]}>
                      <InputNumber<number> style={{ width: '100%' }} min={0} placeholder="VD: 49.500" formatter={numFormatter} parser={numParser} />
                    </Form.Item>
                  </div>
                </div>
              ))}
              <Button type="dashed" block icon={<Plus size={14} />} onClick={() => add({ name: '', unit: 'cấu kiện' })} style={{ marginBottom: 14 }}>
                Thêm hạng mục
              </Button>
            </>
          )}
        </Form.List>

        <Form.Item name="file" label="File ký chốt đính kèm"><Input placeholder="VD: don-hang-ky-chot.pdf" /></Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
      </Form>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <p className="caption" style={{ margin: 0, flex: 1, minWidth: 240 }}>
          {order
            ? 'Giá trị đơn được tính lại theo khối lượng × đơn giá từng hạng mục.'
            : 'Giá chốt theo giá thép thị trường hôm nay — sau khi lưu, bấm "Chuyển kế toán" để làm hợp đồng.'}
        </p>
        <span className="num" style={{ fontWeight: 700 }}>{fmtT(totalKg)} · {money(Math.round(value))}</span>
      </div>
    </Modal>
  )
}
