/* Form Đơn hàng mới (khách đã ký chốt) / Chỉnh sửa đơn hàng — dùng ở trang Đơn hàng và drawer Đơn hàng.
   Bảng hàng hóa theo đúng file đặt hàng chuẩn của khách ("BẢNG XÁC NHẬN GIÁ TRỊ VÀ KHỐI LƯỢNG ĐẶT HÀNG"):
   STT · Tên hàng hóa · ĐVT · Số lượng · KL/1 bộ · Tổng KL (kg) · Đơn giá · Thành tiền · Ghi chú, cuối bảng
   Tổng cộng trước thuế · Thuế VAT · Tổng cộng sau thuế. Có thể tải lên file Excel đó để điền sẵn. */
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Modal, Select, Upload } from 'antd'
import { Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, errorMessage } from '@/api/client'
import { useCreateOrder, useOrders, useUpdateOrder } from '@/api/hooks'
import { blobError, downloadFile } from '@/api/hooksEdit'
import { useCustomers } from '@/api/hooksMaster'
import type { Order, OrderExcelImport } from '@/api/types'
import { fmtNum, money } from '@/lib/format'
import { MODAL_Z, numFormatter, numParser, positive } from '@/peek/drawers/contract/utils'
import { UNITS } from './customers'
import './orderForm.css'

const NEW = '__new__'
type ItemVals = { name: string; unit: string; qty?: number; kgPerUnit?: number; price?: number; note?: string }
interface Vals { cust: string; custNew?: string; code?: string; items: ItemVals[]; vatPct: number; file: string; note?: string }

const kgOf = (i?: ItemVals) => (Number(i?.qty) || 0) * (Number(i?.kgPerUnit) || 0)
const BLANK: ItemVals = { name: '', unit: 'Bộ' }

export default function OrderFormModal({ order, onClose, onSaved }: { order?: Order; onClose: () => void; onSaved?: (o: Order) => void }) {
  const [form] = Form.useForm<Vals>()
  const { message } = App.useApp()
  const create = useCreateOrder()
  const update = useUpdateOrder()
  const { data: orders = [] } = useOrders()
  const { data: catalog = [] } = useCustomers()
  const [imported, setImported] = useState<OrderExcelImport | null>(null)
  const [reading, setReading] = useState(false)
  const customers = useMemo(() => {
    const s = new Set<string>(catalog.filter((c) => c.active).map((c) => c.name))
    orders.forEach((o) => s.add(o.customer))
    if (order) s.add(order.customer)
    return [...s]
  }, [catalog, orders, order])
  const cust = Form.useWatch('cust', form)
  const items = (Form.useWatch('items', form) as ItemVals[] | undefined) ?? []
  const vatPct = Number(Form.useWatch('vatPct', form)) || 0
  const info = catalog.find((c) => c.name === cust)
  const totalKg = items.reduce((s, i) => s + kgOf(i), 0)
  const value = Math.round(items.reduce((s, i) => s + kgOf(i) * (Number(i?.price) || 0), 0))
  const vat = Math.round(value * vatPct / 100)

  const submit = async () => {
    const v = await form.validateFields()
    const customer = (v.cust === NEW ? v.custNew ?? '' : v.cust).trim()
    const its = v.items.map((i) => ({ name: i.name.trim(), qty: i.qty ?? 0, unit: (i.unit || 'Bộ').trim(), kgPerUnit: i.kgPerUnit,
      kg: kgOf(i), price: i.price ?? 0, note: (i.note ?? '').trim() }))
    const file = (v.file || '').trim() || 'don-hang-ky-chot.pdf'
    const body = { customer, items: its, file, note: v.note ?? '', vatPct: v.vatPct ?? 10 }
    const o = order
      ? await update.mutateAsync({ id: order.id, ...body, code: v.code?.trim() || undefined })
      : await create.mutateAsync(body)
    onSaved?.(o)
    onClose()
  }

  const readExcel = async (file: File) => {
    setReading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<OrderExcelImport>('/orders/import-excel', fd)
      const known = data.customerId != null ? catalog.find((c) => c.id === data.customerId)?.name : undefined
      form.setFieldsValue({
        items: data.items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, kgPerUnit: i.kgPerUnit ?? undefined, price: i.price, note: i.note })),
        vatPct: data.vatPct,
        ...(known ? { cust: known } : data.customer ? { cust: NEW, custNew: data.customer } : {}),
      })
      setImported(data)
      message.success(`Đã đọc ${data.items.length} dòng hàng từ ${data.fileName || 'file Excel'}`)
    } catch (e) {
      message.error(errorMessage(e))
    } finally {
      setReading(false)
    }
    return false
  }

  const template = async () => {
    try { await downloadFile('/orders/excel-template', 'Mau-don-hang.xlsx') } catch (e) { message.error(await blobError(e)) }
  }

  const initial: Vals = order
    ? { cust: order.customer, code: order.code, file: order.file ?? '', note: order.note, vatPct: order.vatPct ?? 10,
        items: order.items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, kgPerUnit: i.kgPerUnit ?? (i.qty ? i.kg / i.qty : undefined),
          price: i.price, note: i.note ?? '' })) }
    : { cust: customers[0], file: 'don-hang-ky-chot.pdf', note: '', vatPct: 10, items: [{ ...BLANK }] }

  return (
    <Modal open zIndex={MODAL_Z} width={1120} title={order ? `Chỉnh sửa đơn hàng ${order.id}` : 'Đơn hàng mới (khách đã ký chốt)'}
      okText={order ? 'Lưu' : 'Lưu đơn hàng'} cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial}>
        <div className="of-head">
          <div className="of-title">BẢNG XÁC NHẬN GIÁ TRỊ VÀ KHỐI LƯỢNG ĐẶT HÀNG</div>
          <div className="of-actions">
            <Upload accept=".xlsx,.xlsm" showUploadList={false} beforeUpload={readExcel}>
              <Button icon={<FileSpreadsheet size={14} />} loading={reading}>Tải lên file Excel</Button>
            </Upload>
            <Button type="link" icon={<Download size={13} />} onClick={template}>File mẫu</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: order ? 'minmax(0, 3fr) minmax(0, 1fr)' : '1fr', gap: '0 12px' }}>
          <Form.Item name="cust" label="Công ty đặt hàng" rules={[{ required: true, message: 'Chưa chọn hoặc nhập công ty đặt hàng' }]}
            extra={info && (info.taxCode || info.address || info.representative)
              ? [info.taxCode && `MST ${info.taxCode}`, info.address, info.representative && `Đại diện: ${info.representative}${info.representativeTitle ? ` (${info.representativeTitle})` : ''}`]
                  .filter(Boolean).join(' · ')
              : undefined}>
            <Select showSearch options={[...customers.map((c) => ({ value: c, label: c })), { value: NEW, label: '— Khách mới (nhập tên) —' }]} />
          </Form.Item>
          {order && <Form.Item name="code" label="Mã nội bộ"><Input /></Form.Item>}
        </div>
        {cust === NEW && (
          <Form.Item name="custNew" label="Tên công ty mới" rules={[{ required: true, whitespace: true, message: 'Chưa nhập tên công ty' }]}
            extra="Công ty mới sẽ tự thêm vào tab Khách hàng — bổ sung MST, địa chỉ, đại diện ở đó.">
            <Input placeholder="VD: CÔNG TY CỔ PHẦN THÀNH HƯNG" />
          </Form.Item>
        )}

        {imported && (
          <Alert style={{ marginBottom: 12 }} type={imported.warnings.length ? 'warning' : 'info'} showIcon closable onClose={() => setImported(null)}
            message={`Đã điền ${imported.items.length} dòng từ "${imported.fileName}" (sheet ${imported.sheet}) — kiểm tra lại rồi bấm Lưu.`}
            description={imported.warnings.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{imported.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : undefined} />
        )}

        <div className="of-wrap">
          <table className="of-table">
            <colgroup>
              <col style={{ width: 44 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 96 }} /><col style={{ width: 90 }} />
              <col style={{ width: 112 }} /><col style={{ width: 108 }} /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th className="r">Số lượng</th><th className="r">KL/1 bộ</th>
                <th className="r">Tổng KL (kg)</th><th className="r">Đơn giá</th><th className="r">Thành tiền</th><th>Ghi chú</th><th />
              </tr>
            </thead>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <tbody>
                  {fields.map((f, idx) => {
                    const it = items[f.name]
                    return (
                      <tr key={f.key}>
                        <td className="c">{idx + 1}</td>
                        <td>
                          <Form.Item name={[f.name, 'name']} rules={[{ required: true, whitespace: true, message: 'Nhập tên hàng' }]}>
                            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="VD: Tiếp địa lặp lại" />
                          </Form.Item>
                        </td>
                        <td>
                          <Form.Item name={[f.name, 'unit']}>
                            <AutoComplete options={UNITS.map((u) => ({ value: u }))} />
                          </Form.Item>
                        </td>
                        <td>
                          <Form.Item name={[f.name, 'qty']} rules={[positive('> 0')]}>
                            <InputNumber<number> min={0} formatter={numFormatter} parser={numParser} style={{ width: '100%' }} />
                          </Form.Item>
                        </td>
                        <td>
                          <Form.Item name={[f.name, 'kgPerUnit']} rules={[positive('> 0')]}>
                            <InputNumber<number> min={0} decimalSeparator="," style={{ width: '100%' }} />
                          </Form.Item>
                        </td>
                        <td className="r calc">{kgOf(it) ? fmtNum(kgOf(it)) : '—'}</td>
                        <td>
                          <Form.Item name={[f.name, 'price']} rules={[positive('> 0')]}>
                            <InputNumber<number> min={0} formatter={numFormatter} parser={numParser} style={{ width: '100%' }} />
                          </Form.Item>
                        </td>
                        <td className="r calc">{kgOf(it) && it?.price ? fmtNum(Math.round(kgOf(it) * it.price)) : '—'}</td>
                        <td>
                          <Form.Item name={[f.name, 'note']}>
                            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} />
                          </Form.Item>
                        </td>
                        <td className="c">
                          {fields.length > 1 && (
                            <Button type="text" size="small" danger icon={<Trash2 size={14} />} onClick={() => remove(f.name)} aria-label="Xóa dòng" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="of-add">
                    <td colSpan={10}>
                      <Button type="dashed" size="small" icon={<Plus size={13} />} onClick={() => add({ ...BLANK })}>Thêm dòng</Button>
                    </td>
                  </tr>
                </tbody>
              )}
            </Form.List>
            <tfoot>
              <tr>
                <td colSpan={5} className="c">TỔNG CỘNG TRƯỚC THUẾ</td>
                <td className="r">{fmtNum(totalKg)}</td><td /><td className="r">{fmtNum(value)}</td><td colSpan={2} />
              </tr>
              <tr>
                <td colSpan={5} className="c">
                  <span className="of-vat">THUẾ VAT
                    <Form.Item name="vatPct" noStyle>
                      <InputNumber<number> size="small" min={0} max={100} style={{ width: 64 }} />
                    </Form.Item>%
                  </span>
                </td>
                <td /><td /><td className="r">{fmtNum(vat)}</td><td colSpan={2} />
              </tr>
              <tr className="grand">
                <td colSpan={5} className="c">TỔNG CỘNG SAU THUẾ</td>
                <td /><td /><td className="r">{fmtNum(value + vat)}</td><td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 12px', marginTop: 14 }}>
          <Form.Item name="file" label="File ký chốt đính kèm"><Input placeholder="VD: don-hang-ky-chot.pdf" /></Form.Item>
          <Form.Item name="note" label="Ghi chú đơn hàng"><Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} /></Form.Item>
        </div>
      </Form>
      <p className="caption" style={{ margin: 0 }}>
        Tổng KL = Số lượng × KL/1 bộ · Thành tiền = Tổng KL × Đơn giá (₫/kg) — giống công thức trong file đặt hàng.
        {!order && ' Sau khi lưu, bấm "Chuyển kế toán" để làm hợp đồng.'} Tổng sau thuế: <b className="num">{money(value + vat)}</b>
      </p>
    </Modal>
  )
}
