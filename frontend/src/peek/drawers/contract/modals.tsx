/* Các form thao tác trên hợp đồng — dùng chung cho drawer Hợp đồng và trang danh sách Hợp đồng.
   Mỗi modal được mount có điều kiện (luôn open) để form lấy giá trị mặc định mới mỗi lần mở. */
import { Alert, AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo } from 'react'
import { useCreateLsx, useMeta, useRecordPayment, useUpdateContract } from '@/api/hooks'
import type { Contract, Lsx } from '@/api/types'
import { useAuth } from '@/lib/auth'
import LeadHint from '@/pages/lsx/LeadHint'
import { fmtNum, money } from '@/lib/format'
import { usePeek } from '../../context'
import { committedKg, MODAL_Z, numFormatter, numParser, PAYMENT_TYPES, positive } from './utils'

/* ---------- + Tiền về ---------- */
export function PaymentModal({ contract: c, onClose }: { contract: Contract; onClose: () => void }) {
  const [form] = Form.useForm<{ type: string; amount: number; note?: string }>()
  const pay = useRecordPayment()
  const advLeft = Math.max(0, c.advance.required - (c.advance.received || 0))
  const submit = async () => {
    const v = await form.validateFields()
    await pay.mutateAsync({ id: c.id, amount: v.amount, type: v.type, note: v.note })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Nhập tiền về — ${c.id}`} okText="Gửi Quản lý duyệt" cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={pay.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ type: advLeft > 0 ? PAYMENT_TYPES[0] : PAYMENT_TYPES[1], amount: advLeft || undefined, note: '' }}>
        <Form.Item name="type" label="Loại"><Select options={PAYMENT_TYPES.map((t) => ({ value: t, label: t }))} /></Form.Item>
        <Form.Item name="amount" label="Số tiền (₫)" rules={[positive('Số tiền phải lớn hơn 0')]}>
          <InputNumber<number> style={{ width: '100%' }} min={0} placeholder="VD: 480.000.000" formatter={numFormatter} parser={numParser} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input placeholder="UNC ngân hàng..." /></Form.Item>
      </Form>
      <p className="caption" style={{ margin: 0 }}>
        Kế toán nhập tay theo UNC / sao kê — khoản này <b>chờ Quản lý duyệt</b> rồi mới tính vào tiền đã về. Loại "tạm ứng" khi
        được duyệt sẽ cộng vào tạm ứng đã về ({money(c.advance.received)} / {money(c.advance.required)}).
      </p>
    </Modal>
  )
}

/* ---------- Sửa hợp đồng ---------- */
interface EditVals { owner: string; complete: Dayjs | null; deliver: Dayjs | null; unitPrice: number; advPct: number; note: string }

export function ContractEditModal({ contract: c, onClose }: { contract: Contract; onClose: () => void }) {
  const [form] = Form.useForm<EditVals>()
  const upd = useUpdateContract()
  const { hasRole } = useAuth()
  const isQl = hasRole('admin')  // chỉ Quản lý đổi hạn trả HĐ / hạn giao hàng
  const { data: meta } = useMeta()
  const unitPrice = Form.useWatch('unitPrice', form) ?? c.unitPrice
  const advPct = Form.useWatch('advPct', form) ?? c.advance.pct
  const value = Math.round((unitPrice || 0) * c.totalKg)
  const owners = useMemo(() => {
    const names = new Set<string>([c.owner])
    Object.values(meta?.people ?? {}).filter((p) => p.roles?.includes('kt')).forEach((p) => names.add(p.name))
    return [...names].filter(Boolean).map((n) => ({ value: n }))
  }, [meta, c.owner])
  const submit = async () => {
    const v = await form.validateFields()
    await upd.mutateAsync({
      id: c.id, owner: v.owner, unitPrice: v.unitPrice, advancePct: v.advPct, note: v.note ?? '',
      completeBy: isQl && v.complete ? `${v.complete.format('YYYY-MM-DD')}T12:00:00Z` : undefined,
      deliverBy: isQl && v.deliver ? `${v.deliver.format('YYYY-MM-DD')}T12:00:00Z` : undefined,
    })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Chỉnh sửa hợp đồng ${c.id}`} okText="Lưu" cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={upd.isPending} destroyOnHidden width={560}>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ owner: c.owner, complete: c.completeBy ? dayjs(c.completeBy) : null, deliver: c.deliverBy ? dayjs(c.deliverBy) : null, unitPrice: c.unitPrice, advPct: c.advance.pct, note: c.note }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Form.Item name="owner" label="Kế toán phụ trách" rules={[{ required: true, message: 'Nhập kế toán phụ trách' }]}>
            <AutoComplete options={owners} />
          </Form.Item>
          <Form.Item name="complete" label="Hạn trả hợp đồng" extra={isQl ? undefined : 'Chỉ Quản lý được đổi'}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" allowClear={false} disabled={!isQl} />
          </Form.Item>
          <Form.Item name="deliver" label="Hạn giao hàng cho khách" extra={isQl ? undefined : 'Chỉ Quản lý được đổi'}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" allowClear={false} disabled={!isQl} />
          </Form.Item>
          <Form.Item name="unitPrice" label="Đơn giá (đ/kg) — theo giá thị trường" rules={[positive('Đơn giá phải lớn hơn 0')]}>
            <InputNumber<number> style={{ width: '100%' }} min={0} formatter={numFormatter} parser={numParser} />
          </Form.Item>
          <Form.Item name="advPct" label="Tạm ứng theo HĐ (%)" rules={[{ required: true, message: 'Nhập % tạm ứng' }]}>
            <InputNumber<number> style={{ width: '100%' }} min={0} max={100} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item>
      </Form>
      <Alert type="info" showIcon
        title={<>Giá trị mới: <b className="num">{money(value)}</b> ({fmtNum(c.totalKg)} kg × {fmtNum(unitPrice)}₫) · tạm ứng {fmtNum(advPct)}% = <b className="num">{money(Math.round(value * (advPct || 0) / 100))}</b></>} />
    </Modal>
  )
}

/* ---------- Phát lệnh SX từ hợp đồng ---------- */
export function LsxFromContractModal({ contract: c, lsxs, onClose }: { contract: Contract; lsxs: Lsx[]; onClose: () => void }) {
  const [form] = Form.useForm<{ name: string; kg: number; lead: number }>()
  const create = useCreateLsx()
  const { open } = usePeek()
  const rem = Math.max(0, c.totalKg - committedKg(lsxs))
  const kg = Form.useWatch('kg', form)
  const lead = Form.useWatch('lead', form)
  const over = (kg || 0) > rem
  const submit = async () => {
    const v = await form.validateFields()
    if (v.kg > rem) return
    const x = await create.mutateAsync({ contractId: c.id, name: v.name, kg: v.kg, leadDays: v.lead || 7 })
    onClose()
    open('lsx', x.id)
  }
  return (
    <Modal open zIndex={MODAL_Z} title="Phát lệnh sản xuất (Quản lý)" okText="Phát lệnh" cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={create.isPending} okButtonProps={{ disabled: rem <= 0 }} destroyOnHidden width={560}>
      <p style={{ marginTop: 0 }}>Hợp đồng <b className="mono">{c.id}</b> — {c.customer}</p>
      <p className="caption" style={{ marginTop: -6 }}>
        {rem > 0
          ? <>Còn <b>{fmtNum(rem)} kg</b> của hợp đồng này chưa phát lệnh (không tính lệnh bị từ chối).</>
          : <span className="text-signal" style={{ fontWeight: 600 }}>Hợp đồng đã phát lệnh đủ khối lượng — không còn phần để phát thêm.</span>}
      </p>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={{ name: `Lệnh SX ${c.code} — đợt ${lsxs.length + 1}`, kg: rem > 0 ? rem : undefined, lead: 7 }}>
        <Form.Item name="name" label="Tên lệnh" rules={[{ required: true, whitespace: true, message: 'Nhập tên lệnh sản xuất.' }]}><Input /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 12px' }}>
          <Form.Item name="kg" label="Khối lượng (kg)" rules={[positive('Khối lượng (kg) phải lớn hơn 0.')]}>
            <InputNumber<number> style={{ width: '100%' }} min={0} formatter={numFormatter} parser={numParser} />
          </Form.Item>
          <Form.Item name="lead" label="Tiến độ (số ngày)"><InputNumber<number> style={{ width: '100%' }} min={1} /></Form.Item>
        </div>
        <LeadHint lead={lead} deliverBy={c.deliverBy} onFit={(d) => form.setFieldValue('lead', d)} />
      </Form>
      {over && (
        <Alert type="error" showIcon
          title={<>Khối lượng phát lệnh <b>{fmtNum(kg)} kg</b> VƯỢT phần còn lại của hợp đồng (<b>{fmtNum(rem)} kg</b> chưa phát lệnh).</>} />
      )}
    </Modal>
  )
}
