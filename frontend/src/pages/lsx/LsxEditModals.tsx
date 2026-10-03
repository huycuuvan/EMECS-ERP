/* Quản lý sửa lệnh SX (lưu lịch sử + ghi nhật ký lệnh) và phát lại lệnh bị xưởng từ chối. Chỉ Quản lý (server kiểm). */
import { Button, DatePicker, Form, Input, InputNumber, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Pencil, RotateCcw } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useEditLsx, useReissueLsx } from '@/api/hooksEdit'
import type { Lsx } from '@/api/types'
import { fmtD, fmtKg } from '@/lib/format'
import { MODAL_Z } from '../mismatches/sign'
import { EditReasonField } from '../weighings/EditWeighingModal'
import { InfoBox } from './boxes'
import { useLsxPerms } from './lsxUtil'

type EV = { name: string; kgPlan: number; leadDays: number; deadline: Dayjs; reason?: string }

export function EditLsxModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const edit = useEditLsx()
  const [form] = Form.useForm<EV>()
  const k = Form.useWatch('kgPlan', form)
  const numChanged = typeof k === 'number' && k !== x.kgPlan
  const origDeadline = dayjs(x.deadline)

  const submit = async () => {
    const v = await form.validateFields()
    const dlTouched = form.isFieldTouched('deadline') && !v.deadline.isSame(origDeadline, 'day')
    await edit.mutateAsync({
      id: x.id, name: v.name.trim(), kgPlan: v.kgPlan, leadDays: v.leadDays,
      deadline: dlTouched ? v.deadline.hour(17).minute(0).second(0).millisecond(0).toISOString() : undefined,
      reason: (v.reason || '').trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal open zIndex={MODAL_Z} title={`Sửa lệnh sản xuất ${x.id}`} okText="Lưu thay đổi" cancelText="Hủy" width={620}
      confirmLoading={edit.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>HĐ <b>{x.contractId}</b> · đã xong <b>{fmtKg(x.kgDone)}</b> (kế hoạch không được nhỏ hơn số đã xong).
          Đổi tiến độ (ngày) mà không chọn hạn mới → hạn = ngày phát lệnh + số ngày. Mọi thay đổi ghi vào nhật ký lệnh và lịch sử chỉnh sửa.</InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ name: x.name, kgPlan: x.kgPlan, leadDays: x.leadDays, deadline: origDeadline }}>
        <Form.Item name="name" label="Tên lệnh" rules={[{ required: true, whitespace: true, message: 'Nhập tên lệnh' }]}><Input /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="kgPlan" label="KL kế hoạch (kg)" rules={[{ required: true, type: 'number', min: Math.max(x.kgDone, 0.0001), message: `Tối thiểu ${fmtKg(x.kgDone)} (đã xong)` }]}>
            <InputNumber min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
          <Form.Item name="leadDays" label="Tiến độ (ngày)" rules={[{ required: true, type: 'number', min: 1, message: 'Tối thiểu 1 ngày' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn hoàn thành" rules={[{ required: true, message: 'Chọn hạn' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <EditReasonField required={numChanged} />
      </Form>
    </Modal>
  )
}

export function ReissueLsxModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const m = useReissueLsx()
  const [form] = Form.useForm<{ leadDays: number; kgPlan: number; note?: string }>()
  const lead = Form.useWatch('leadDays', form)
  const submit = async () => {
    const v = await form.validateFields()
    await m.mutateAsync({ id: x.id, leadDays: v.leadDays, kgPlan: v.kgPlan, note: (v.note || '').trim() || undefined })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Phát lại lệnh ${x.id}`} okText="Phát lại lệnh" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>
          <span className="text-signal">Xưởng đã từ chối: <b>{x.rejectReason || '—'}</b></span><br />
          Phát lại → lệnh về <b>Chờ nhận</b>, tính hạn mới từ hôm nay
          {typeof lead === 'number' && lead > 0 && <> (hạn dự kiến <b>{fmtD(dayjs().add(lead, 'day').toISOString())}</b>)</>}; xưởng phải nhận lệnh lại.
        </InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ leadDays: x.leadDays, kgPlan: x.kgPlan }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="leadDays" label="Tiến độ (ngày)" rules={[{ required: true, type: 'number', min: 1, message: 'Tối thiểu 1 ngày' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="kgPlan" label="KL kế hoạch (kg)" rules={[{ required: true, type: 'number', min: 0.0001, message: '> 0' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú phát lại (ghi vào nhật ký lệnh)">
          <Input.TextArea rows={2} placeholder="VD: đã bổ sung thép tấm SS400, lùi tiến độ 2 ngày" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/** Nút Sửa (Quản lý) + Phát lại lệnh (Quản lý, lệnh Từ chối). `withEdit=false` chỉ hiện Phát lại. */
export function LsxAdminActions({ x, withEdit = true, ghost }: { x: Lsx; withEdit?: boolean; ghost?: boolean }) {
  const { canQl } = useLsxPerms()
  const [mode, setMode] = useState<'edit' | 'reissue' | null>(null)
  if (!canQl) return null
  const stop = (e: MouseEvent) => e.stopPropagation()
  const close = () => setMode(null)
  return (
    <span onClick={stop} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {x.status === 'Từ chối' && <Button size="small" type="primary" icon={<RotateCcw size={12} />} onClick={() => setMode('reissue')}>Phát lại lệnh</Button>}
      {withEdit && <Button size="small" ghost={ghost} icon={<Pencil size={12} />} onClick={() => setMode('edit')}>Sửa</Button>}
      {mode === 'edit' && <EditLsxModal x={x} onClose={close} />}
      {mode === 'reissue' && <ReissueLsxModal x={x} onClose={close} />}
    </span>
  )
}
