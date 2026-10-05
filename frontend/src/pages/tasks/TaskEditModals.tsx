/* Quản lý sửa thẻ lái xe (lưu lịch sử) + giao lại thẻ bị từ chối.
   - Trước khi xuất phát (Chờ xác nhận / Từ chối / Đã nhận): sửa tài xế, KG yêu cầu, chứng từ gốc, ghi chú
     (đổi tài xế → thẻ về "Chờ xác nhận" cho người mới).
   - Đã điền số cân: sửa số cân mạ / kg ký mạ / kg khách ký — bắt buộc lý do, chạy lại quy tắc sai lệch.
   - Giao lại: thẻ Từ chối / Chờ xác nhận → chọn tài xế (KG yêu cầu) → thẻ về "Chờ xác nhận". Chỉ Quản lý (server kiểm). */
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd'
import { Pencil, UserRoundCog } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useMeta } from '@/api/hooks'
import { useEditTask, useReassignTask } from '@/api/hooksEdit'
import type { Task } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { fmtKg } from '@/lib/format'
import { InfoBox } from '../lsx/boxes'
import { EditReasonField, MismatchPreview, usePendingMismatchId } from '../weighings/EditWeighingModal'
import { MODAL_Z } from './TaskActions'
import { NUM } from '@/lib/numberInput'

const BEFORE_DEPART: Task['status'][] = ['Chờ xác nhận', 'Từ chối', 'Đã nhận']
export const canEditTask = (t: Task) => BEFORE_DEPART.includes(t.status) || (!!t.filledAt && !t.lossAccepted)
export const canReassignTask = (t: Task) => t.status === 'Từ chối' || t.status === 'Chờ xác nhận'

type EV = { driver?: string; kgRequired?: number; refId?: string; note?: string; kgAtGalv?: number; kgPicked?: number; kgDelivered?: number; reason?: string; mismatchReason?: string; reasonNote?: string }

export function EditTaskModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const edit = useEditTask()
  const { data: meta } = useMeta()
  const tol = meta?.toleranceKg ?? 30
  const pendingId = usePendingMismatchId(t.mismatchId)
  const [form] = Form.useForm<EV>()
  const w = Form.useWatch([], form) as EV | undefined
  const basic = BEFORE_DEPART.includes(t.status)
  const fix = !!t.filledAt && !t.lossAccepted
  const isMa = t.type === 'di_ma'
  const num = (v: unknown, d: number | null) => (typeof v === 'number' ? v : d)

  const kgReq = num(w?.kgRequired, t.kgRequired)!
  const galv = num(w?.kgAtGalv, t.kgAtGalv)
  const picked = num(w?.kgPicked, t.kgPicked)
  const deliv = num(w?.kgDelivered, t.kgDelivered)
  const fixChanged = fix && (isMa ? galv !== t.kgAtGalv : picked !== t.kgPicked || deliv !== t.kgDelivered)
  const numChanged = (basic && kgReq !== t.kgRequired) || fixChanged

  // quy tắc giống server (task_fill_galv / task_fill_delivery)
  let out = false, delta = 0
  if (fixChanged && isMa && galv != null) { delta = galv - t.kgRequired; out = Math.abs(delta) > tol }
  if (fixChanged && !isMa && picked != null && deliv != null) {
    const d = deliv - picked
    out = Math.abs(d) > 0.5 || Math.abs(picked - t.kgRequired) > tol
    delta = Math.abs(d) > 0.5 ? d : picked - t.kgRequired
  }

  const submit = async () => {
    const v = await form.validateFields()
    await edit.mutateAsync({
      id: t.id,
      ...(basic ? { driver: v.driver, kgRequired: v.kgRequired, refId: v.refId ?? '', note: v.note ?? '' } : {}),
      ...(fix ? (isMa ? { kgAtGalv: v.kgAtGalv } : { kgPicked: v.kgPicked, kgDelivered: v.kgDelivered }) : {}),
      reason: (v.reason || '').trim() || undefined, mismatchReason: v.mismatchReason, reasonNote: (v.reasonNote || '').trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal open zIndex={MODAL_Z} title={`Sửa thẻ ${t.id}`} okText="Lưu thay đổi" cancelText="Hủy" width={600}
      confirmLoading={edit.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>
          {isMa ? 'Chở hàng đi mạ' : 'Lấy hàng mạ → giao khách'} · HĐ <b>{t.contractId}</b> · đang <b>{t.status}</b>.
          {!basic && <> Thẻ đã xuất phát — chỉ sửa được số cân đã điền.</>} Mọi thay đổi được lưu vào lịch sử chỉnh sửa.
        </InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{
        driver: t.driver, kgRequired: t.kgRequired, refId: t.refId ?? '', note: t.note,
        kgAtGalv: t.kgAtGalv ?? undefined, kgPicked: t.kgPicked ?? undefined, kgDelivered: t.kgDelivered ?? undefined,
      }}>
        {basic && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item name="driver" label="Tài xế" rules={[{ required: true, message: 'Chọn tài xế' }]}
              extra={t.status !== 'Chờ xác nhận' ? 'Đổi tài xế → thẻ về "Chờ xác nhận" cho người mới' : undefined}>
              <Select options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
            </Form.Item>
            <Form.Item name="kgRequired" label="KG yêu cầu" rules={[{ required: true, type: 'number', min: 0.01, message: 'KG yêu cầu phải lớn hơn 0' }]}>
              <InputNumber {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
            </Form.Item>
          </div>
          <Form.Item name="refId" label="Chứng từ gốc (PC-… / VC-…)"><Input /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
        </>}
        {fix && (isMa ? (
          <Form.Item name="kgAtGalv" label={`Số cân bên mạ (kg) — yêu cầu ${fmtKg(t.kgRequired)}`} rules={[{ required: true, type: 'number', min: 0, message: 'Nhập số cân bên mạ' }]}>
            <InputNumber {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item name="kgPicked" label="KG ký nhận với mạ" rules={[{ required: true, type: 'number', min: 0, message: 'Nhập KG ký với mạ' }]}>
              <InputNumber {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
            </Form.Item>
            <Form.Item name="kgDelivered" label="KG khách ký nhận" rules={[{ required: true, type: 'number', min: 0, message: 'Nhập KG khách ký' }]}>
              <InputNumber {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
            </Form.Item>
          </div>
        ))}
        {fixChanged && <MismatchPreview out={out} delta={delta} pendingId={pendingId} tol={tol} />}
        <EditReasonField required={numChanged} />
      </Form>
    </Modal>
  )
}

export function ReassignTaskModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useReassignTask()
  const { data: meta } = useMeta()
  const drivers = meta?.drivers ?? []
  const [form] = Form.useForm<{ driver: string; kgRequired: number; note?: string }>()
  const submit = async () => {
    const v = await form.validateFields()
    await m.mutateAsync({ id: t.id, driver: v.driver, kgRequired: v.kgRequired, note: (v.note || '').trim() || undefined })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Giao lại thẻ ${t.id}`} okText="Giao lại" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>
          Đang gán <b>{t.driver}</b> · {fmtKg(t.kgRequired)} · HĐ <b>{t.contractId}</b>
          {t.rejectReason && <><br /><span className="text-signal">Lý do từ chối: <b>{t.rejectReason}</b></span></>}
          <br />Sau khi giao lại, thẻ về <b>Chờ xác nhận</b> — tài xế mới phải đồng ý nhận việc.
        </InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ driver: drivers.find((d) => d !== t.driver) ?? t.driver, kgRequired: t.kgRequired }}>
        <Form.Item name="driver" label="Giao cho tài xế" rules={[{ required: true, message: 'Chọn tài xế' }]}>
          <Select options={drivers.map((d) => ({ value: d, label: d + (d === t.driver ? ' (đang gán)' : '') }))} />
        </Form.Item>
        <Form.Item name="kgRequired" label="KG yêu cầu" rules={[{ required: true, type: 'number', min: 0.01, message: 'KG yêu cầu phải lớn hơn 0' }]}>
          <InputNumber {...NUM} min={0} style={{ width: '100%' }} suffix="kg" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú giao lại"><Input placeholder="VD: đổi sang xe 29C-123.45 do xe cũ bảo dưỡng" /></Form.Item>
      </Form>
    </Modal>
  )
}

/** Nút Sửa + Giao lại (chỉ Quản lý) — dùng trong drawer thẻ và dòng bảng. `withEdit=false` chỉ hiện Giao lại. */
export function TaskAdminActions({ task: t, withEdit = true, size = 'small', ghost }: { task: Task; withEdit?: boolean; size?: 'small' | 'middle'; ghost?: boolean }) {
  const { hasRole } = useAuth()
  const [mode, setMode] = useState<'edit' | 'reassign' | null>(null)
  if (!hasRole('admin')) return null
  const showEdit = withEdit && canEditTask(t)
  const showReassign = t.status === 'Từ chối' || (withEdit && t.status === 'Chờ xác nhận')
  if (!showEdit && !showReassign) return null
  const stop = (e: MouseEvent) => e.stopPropagation()
  const close = () => setMode(null)
  return (
    <span onClick={stop} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {showReassign && <Button size={size} danger={t.status === 'Từ chối'} ghost={ghost && t.status !== 'Từ chối'} icon={<UserRoundCog size={13} />} onClick={() => setMode('reassign')}>Giao lại</Button>}
      {showEdit && <Button size={size} ghost={ghost} icon={<Pencil size={12} />} onClick={() => setMode('edit')}>Sửa</Button>}
      {mode === 'edit' && <EditTaskModal t={t} onClose={close} />}
      {mode === 'reassign' && <ReassignTaskModal t={t} onClose={close} />}
    </span>
  )
}
