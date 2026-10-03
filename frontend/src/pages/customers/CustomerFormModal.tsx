/* Thêm / sửa khách hàng: thông tin pháp lý (tên công ty, địa chỉ, MST, tài khoản, đại diện — dùng lập hợp đồng),
   phân loại Thân thiết / Đơn lẻ, nhãn thêm. */
import { Form, Input, Modal, Radio, Select, Switch } from 'antd'
import { useCreateCustomer, useTags, useUpdateCustomer } from '@/api/hooksMaster'
import { SEGMENTS, type Customer, type CustomerInput } from '@/api/typesMaster'

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
        representative: customer.representative, representativeTitle: customer.representativeTitle,
        bankAccount: customer.bankAccount, bankName: customer.bankName, segment: customer.segment,
        tagIds: customer.tags.map((t) => t.id) }
    : { name: '', active: true, segment: '', tagIds: [] }

  const two = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 12px' }

  return (
    <Modal open width={720} title={customer ? `Sửa khách hàng — ${customer.name}` : 'Thêm khách hàng'}
      okText="Lưu" cancelText="Hủy" onOk={submit} onCancel={onClose} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '0 12px' }}>
          <Form.Item name="name" label="Tên công ty" rules={[{ required: true, whitespace: true, message: 'Chưa nhập tên công ty' }]}>
            <Input placeholder="VD: CÔNG TY CỔ PHẦN THÀNH HƯNG" />
          </Form.Item>
          <Form.Item name="shortCode" label="Mã viết tắt"><Input placeholder="VD: THANHHUNG" /></Form.Item>
        </div>
        <Form.Item name="address" label="Địa chỉ"><Input placeholder="Số nhà, đường, phường/xã, tỉnh/thành" /></Form.Item>
        <div style={two}>
          <Form.Item name="phone" label="Điện thoại"><Input placeholder="VD: 0228.3632559" /></Form.Item>
          <Form.Item name="taxCode" label="Mã số thuế"><Input className="mono" placeholder="VD: 0600321679" /></Form.Item>
          <Form.Item name="bankAccount" label="Số tài khoản"><Input className="mono" /></Form.Item>
          <Form.Item name="bankName" label="Tại ngân hàng"><Input placeholder="VD: Ngân hàng TMCP Đông Nam Á - CN Nam Định" /></Form.Item>
          <Form.Item name="representative" label="Đại diện"><Input placeholder="VD: Bà Vũ Thị Lan Anh" /></Form.Item>
          <Form.Item name="representativeTitle" label="Chức vụ"><Input placeholder="VD: Giám đốc" /></Form.Item>
        </div>
        <div style={two}>
          <Form.Item name="segment" label="Phân loại khách hàng">
            <Radio.Group optionType="button" buttonStyle="solid"
              options={[...SEGMENTS.map((s) => ({ value: s, label: s })), { value: '', label: 'Chưa phân loại' }]} />
          </Form.Item>
          <Form.Item name="active" label="Trạng thái" valuePropName="checked">
            <Switch checkedChildren="Đang giao dịch" unCheckedChildren="Ngừng giao dịch" />
          </Form.Item>
          <Form.Item name="contactName" label="Người liên hệ" extra="Người làm việc hằng ngày (nếu khác người đại diện)">
            <Input placeholder="VD: Anh Minh — P. Mua hàng" />
          </Form.Item>
          <Form.Item name="tagIds" label="Nhãn thêm (tùy chọn)">
            <Select mode="multiple" allowClear placeholder="Chọn nhãn" optionFilterProp="title"
              options={tags.map((t) => ({
                value: t.id, title: t.name,
                label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: t.color }} />{t.name}</span>,
              }))} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  )
}
