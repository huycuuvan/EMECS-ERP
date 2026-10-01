/* Thêm / sửa khách hàng + gắn nhãn. */
import { Form, Input, Modal, Select, Switch } from 'antd'
import { useCreateCustomer, useTags, useUpdateCustomer } from '@/api/hooksMaster'
import type { Customer, CustomerInput } from '@/api/typesMaster'

type V = Required<Pick<CustomerInput, 'name'>> & CustomerInput

export default function CustomerFormModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const [form] = Form.useForm<V>()
  const { data: tags = [] } = useTags()
  const create = useCreateCustomer()
  const update = useUpdateCustomer()

  const submit = async () => {
    const v = await form.validateFields()
    const body = { ...v, name: v.name.trim() }
    if (customer) await update.mutateAsync({ id: customer.id, ...body })
    else await create.mutateAsync(body)
    onClose()
  }

  const initial: V = customer
    ? { name: customer.name, shortCode: customer.shortCode, taxCode: customer.taxCode, address: customer.address,
        contactName: customer.contactName, phone: customer.phone, note: customer.note, active: customer.active,
        tagIds: customer.tags.map((t) => t.id) }
    : { name: '', active: true, tagIds: [] }

  return (
    <Modal open width={620} title={customer ? `Sửa khách hàng — ${customer.name}` : 'Thêm khách hàng'}
      okText="Lưu" cancelText="Hủy" onOk={submit} onCancel={onClose} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 12px' }}>
          <Form.Item name="name" label="Tên khách hàng" rules={[{ required: true, whitespace: true, message: 'Chưa nhập tên khách hàng' }]}>
            <Input placeholder="VD: Cty CP Kết cấu thép FECON" />
          </Form.Item>
          <Form.Item name="shortCode" label="Mã viết tắt"><Input placeholder="VD: FECON" /></Form.Item>
        </div>
        <Form.Item name="tagIds" label="Nhãn khách hàng" extra="Dùng để lọc Khách thân thiết / Khách lẻ ở Đơn hàng, Hợp đồng, Dashboard.">
          <Select mode="multiple" allowClear placeholder="Chọn nhãn" optionFilterProp="title"
            options={tags.map((t) => ({
              value: t.id, title: t.name,
              label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: t.color }} />{t.name}</span>,
            }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Form.Item name="contactName" label="Người liên hệ"><Input placeholder="VD: Anh Minh — P. Mua hàng" /></Form.Item>
          <Form.Item name="phone" label="Số điện thoại"><Input placeholder="VD: 0912 345 678" /></Form.Item>
          <Form.Item name="taxCode" label="Mã số thuế"><Input /></Form.Item>
          <Form.Item name="active" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Đang giao dịch" unCheckedChildren="Ngừng giao dịch" />
          </Form.Item>
        </div>
        <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  )
}
