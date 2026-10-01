/* Thao tác vòng đời thẻ lái xe (dùng ở bảng danh sách + drawer thẻ VC):
   Chờ xác nhận → Đồng ý / Từ chối · Đã nhận → Xuất phát · Đang chạy → Điền phiếu cân mạ / phiếu giao nhận.
   Chỉ hiện với vai trò được thao tác trang van-chuyen (Quản lý A, Lái xe). */
import { Button, Form, Input, InputNumber, Modal, Select } from 'antd'
import { AlarmClock, AlertTriangle, Check, ClipboardPen, Play, X } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'
import {
  useContract, useMeta, useTaskAccept, useTaskDepart, useTaskFillDelivery, useTaskFillGalv, useTaskReject,
} from '@/api/hooks'
import type { Task } from '@/api/types'
import { PhotoInput } from '@/components/PhotoBlock'
import { useAuth } from '@/lib/auth'
import { fmtDelta, fmtKg, fmtNum } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'

type Mode = 'accept' | 'reject' | 'depart' | 'galv' | 'delivery' | null
/** Modal nằm trên drawer bản ghi (drawer zIndex 1000+). */
export const MODAL_Z = 1500

const hint = { fontSize: 12.5, color: 'var(--ash)', margin: '0 0 12px' }
const strong = { color: 'var(--rust-deep)', fontWeight: 700 }
const warnBox = { background: 'var(--signal-soft)', border: '1px solid rgba(138,31,31,.35)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }
const warnTitle = { color: 'var(--signal)', fontWeight: 800, fontSize: 12, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }

export default function TaskActions({ task: t, size = 'small' }: { task: Task; size?: 'small' | 'middle' }) {
  const { can } = useAuth()
  const [mode, setMode] = useState<Mode>(null)
  if (!can('van-chuyen', 'edit')) return null

  const stop = (e: MouseEvent) => e.stopPropagation()
  const close = () => setMode(null)
  let buttons = null
  if (t.status === 'Chờ xác nhận') {
    buttons = <>
      <Button size={size} type="primary" icon={<Check size={13} />} onClick={() => setMode('accept')}>Đồng ý</Button>
      <Button size={size} icon={<X size={13} />} onClick={() => setMode('reject')}>Từ chối</Button>
    </>
  } else if (t.status === 'Đã nhận') {
    buttons = <Button size={size} type="primary" icon={<Play size={13} />} onClick={() => setMode('depart')}>Xuất phát</Button>
  } else if (t.status === 'Đang chạy') {
    buttons = t.type === 'di_ma'
      ? <Button size={size} type="primary" icon={<ClipboardPen size={13} />} onClick={() => setMode('galv')}>Điền phiếu cân mạ</Button>
      : <Button size={size} type="primary" icon={<ClipboardPen size={13} />} onClick={() => setMode('delivery')}>Điền phiếu giao nhận</Button>
  }
  if (!buttons) return null

  return (
    // chặn click lan lên dòng bảng (React bubble qua portal của Modal)
    <span onClick={stop} style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {buttons}
      {mode === 'accept' && <AcceptModal t={t} onClose={close} />}
      {mode === 'reject' && <RejectModal t={t} onClose={close} />}
      {mode === 'depart' && <DepartModal t={t} onClose={close} />}
      {mode === 'galv' && <FillGalvModal t={t} onClose={close} />}
      {mode === 'delivery' && <FillDeliveryModal t={t} onClose={close} />}
    </span>
  )
}

const what = (t: Task) => (t.type === 'di_ma' ? 'chở hàng đi mạ' : 'lấy hàng từ mạ giao khách')

function AcceptModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useTaskAccept()
  const { data: meta } = useMeta()
  return (
    <Modal open zIndex={MODAL_Z} title={`Nhận thẻ công việc ${t.id}`} okText="Đồng ý nhận việc" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={() => m.mutateAsync(t.id).then(onClose)}>
      <p>{t.driver} xác nhận nhận việc <b>{what(t)}</b> — HĐ <b>{t.contractId}</b>, khối lượng <b>{fmtKg(t.kgRequired)}</b>?</p>
      <p className="caption">Sau khi nhận, bấm "Xuất phát" khi xe rời bãi — từ lúc đó có {meta?.fillHours ?? 24}h để điền phiếu.</p>
    </Modal>
  )
}

function RejectModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useTaskReject()
  const { data: meta } = useMeta()
  const [form] = Form.useForm<{ reason: string; note?: string }>()
  const submit = async () => {
    const v = await form.validateFields()
    const n = (v.note || '').trim()
    await m.mutateAsync({ id: t.id, reason: v.reason + (n ? ' — ' + n : '') })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Từ chối thẻ ${t.id}`} okText="Xác nhận từ chối" okButtonProps={{ danger: true }} cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ reason: meta?.reasonsTuChoiLx[0] }}>
        <Form.Item name="reason" label="Lý do từ chối" rules={[{ required: true, message: 'Bắt buộc chọn lý do từ chối' }]}>
          <Select options={(meta?.reasonsTuChoiLx ?? []).map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item name="note" label="Diễn giải thêm">
          <Input placeholder="VD: xe vào xưởng thay lốp đến 15h..." />
        </Form.Item>
      </Form>
      <p className="caption" style={{ color: 'var(--signal)', margin: 0 }}>Thẻ từ chối sẽ báo đỏ về Quản lý để gán tài xế khác.</p>
    </Modal>
  )
}

function DepartModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useTaskDepart()
  const { data: meta } = useMeta()
  const h = meta?.fillHours ?? 24
  return (
    <Modal open zIndex={MODAL_Z} title={`Xuất phát — ${t.id}`} okText="Xác nhận xuất phát" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={() => m.mutateAsync(t.id).then(onClose)}>
      <p>Xe của <b>{t.driver}</b> rời bãi để {t.type === 'di_ma'
        ? <>chở <b>{fmtKg(t.kgRequired)}</b> sang xưởng mạ</>
        : <>lấy <b>{fmtKg(t.kgRequired)}</b> từ xưởng mạ đi giao khách</>}.</p>
      <p style={{ background: 'var(--amber-soft)', color: 'var(--amber)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, fontWeight: 600, display: 'flex', gap: 6 }}>
        <AlarmClock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Từ lúc xuất phát, tài xế có <b>{h} giờ</b> để điền số cân và tải ảnh phiếu. Quá hạn hệ thống báo đỏ về Quản lý.</span>
      </p>
    </Modal>
  )
}

/** Dropdown lý do lệch (meta.reasonsCan) + diễn giải — chỉ hiện khi có lệch. */
function ReasonBlock({ title, notePh }: { title: ReactNode; notePh: string }) {
  const { data: meta } = useMeta()
  return (
    <div style={warnBox}>
      <div style={warnTitle}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /><span>{title}</span></div>
      <Form.Item name="reason" label="Lý do sai lệch" rules={[{ required: true, message: 'Có sai lệch — bắt buộc chọn lý do' }]} style={{ marginBottom: 8 }}>
        <Select placeholder="— Chọn lý do —" options={(meta?.reasonsCan ?? []).map((r) => ({ value: r, label: r }))} />
      </Form.Item>
      <Form.Item name="reasonNote" label="Diễn giải" style={{ marginBottom: 0 }}>
        <Input placeholder={notePh} />
      </Form.Item>
    </div>
  )
}

const kgRule = (msg: string) => [{ required: true, message: msg }, { type: 'number' as const, min: 0.01, message: 'Số kg phải lớn hơn 0' }]

function FillGalvModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useTaskFillGalv()
  const { data: meta } = useMeta()
  const tol = meta?.toleranceKg ?? 30
  const [form] = Form.useForm<{ kg: number; photo: string | null; reason?: string; reasonNote?: string }>()
  const kg = Form.useWatch('kg', form)
  const delta = typeof kg === 'number' ? Math.round((kg - t.kgRequired) * 100) / 100 : 0
  const lech = typeof kg === 'number' && Math.abs(delta) > tol
  const submit = async () => {
    const v = await form.validateFields()
    await m.mutateAsync({ id: t.id, kg: v.kg, photo: v.photo, reason: lech ? v.reason : undefined, reasonNote: lech ? v.reasonNote : undefined })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Điền phiếu cân bên mạ — ${t.id}`} okText="Lưu phiếu cân mạ" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden width={560}>
      <p style={hint}>
        Cân xuất công ty (yêu cầu): <b style={strong}>{fmtKg(t.kgRequired)}</b>
        {t.refId && <> — chứng từ gốc <RecordLink id={t.refId} style={{ color: 'var(--rust)' }} /></>}. Bên mạ cân lại khi hàng đến, in phiếu, lái xe ký.
      </p>
      <Form form={form} layout="vertical">
        <Form.Item name="kg" label="Số cân bên mạ (kg)" rules={kgRule('Phải nhập số cân bên mạ (kg)')}>
          <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder={`VD: ${fmtNum(t.kgRequired)}`} suffix="kg" />
        </Form.Item>
        {lech && <ReasonBlock notePh="VD: cân mạ hiển thị thấp hơn ~0,5%..."
          title={<>LỆCH {fmtDelta(delta)} so với cân xuất công ty (dung sai ±{tol} kg) — bắt buộc chọn lý do, hệ thống sẽ lập phiếu sai lệch chờ Quản lý ký.</>} />}
        <Form.Item name="photo" label="Ảnh phiếu (chụp phiếu in có chữ ký)" rules={[{ required: true, message: 'Phải tải ảnh phiếu cân bên mạ (hoặc dùng ảnh demo)' }]}>
          <PhotoInput demo={{ label: `Phiếu cân xưởng mạ · ${t.id}`, kg: kg || t.kgRequired }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function FillDeliveryModal({ t, onClose }: { t: Task; onClose: () => void }) {
  const m = useTaskFillDelivery()
  const { data: meta } = useMeta()
  const { data: agg } = useContract(t.contractId)
  const tol = meta?.toleranceKg ?? 30
  const [form] = Form.useForm<{ kgPicked: number; kgDelivered: number; photo: string | null; reason?: string; reasonNote?: string }>()
  const kp = Form.useWatch('kgPicked', form)
  const kd = Form.useWatch('kgDelivered', form)
  const msgs: string[] = []
  if (typeof kp === 'number' && Math.abs(kp - t.kgRequired) > tol)
    msgs.push(`KG ký với mạ lệch ${fmtDelta(Math.round((kp - t.kgRequired) * 100) / 100)} so với yêu cầu (${fmtKg(t.kgRequired)})`)
  if (typeof kp === 'number' && typeof kd === 'number' && Math.abs(kd - kp) > 0.5)
    msgs.push(`Khách ký ${fmtKg(kd)} ≠ mạ ký ${fmtKg(kp)} — hàng để lại trên xe / thất thoát dọc đường?`)
  const lech = msgs.length > 0
  const submit = async () => {
    const v = await form.validateFields()
    await m.mutateAsync({ id: t.id, kgPicked: v.kgPicked, kgDelivered: v.kgDelivered, photo: v.photo,
      reason: lech ? v.reason : undefined, reasonNote: lech ? v.reasonNote : undefined })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Điền phiếu giao nhận — ${t.id}`} okText="Lưu phiếu giao nhận" cancelText="Hủy"
      confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden width={560}>
      <p style={hint}>
        Yêu cầu lấy: <b style={strong}>{fmtKg(t.kgRequired)}</b> · Đang tại mạ của HĐ này: <b style={strong}>{fmtKg(agg?.atGalvKg ?? 0)}</b>
        {t.refId && <> (đối ứng lượng đã gửi trước đó — thẻ gửi <RecordLink id={t.refId} style={{ color: 'var(--rust)' }} />)</>}. Một tờ phiếu, cả bên mạ và khách cùng ký.
      </p>
      <Form form={form} layout="vertical">
        <Form.Item name="kgPicked" label="KG ký nhận với xưởng mạ" rules={kgRule('Phải nhập KG ký với mạ')}>
          <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder={`VD: ${fmtNum(t.kgRequired)}`} suffix="kg" />
        </Form.Item>
        <Form.Item name="kgDelivered" label="KG khách ký nhận" rules={kgRule('Phải nhập KG khách ký')}>
          <InputNumber style={{ width: '100%' }} min={0} step={10} placeholder={`VD: ${fmtNum(t.kgRequired)}`} suffix="kg" />
        </Form.Item>
        {lech && <ReasonBlock notePh="VD: 40 kg để lại trên xe do khách kiểm thiếu..."
          title={<>{msgs.join(' · ')} — bắt buộc chọn lý do, hệ thống lập phiếu sai lệch chờ Quản lý ký.</>} />}
        <Form.Item name="photo" label="Ảnh phiếu giao nhận (mạ ký + khách ký cùng 1 tờ)" rules={[{ required: true, message: 'Phải tải ảnh phiếu giao nhận (hoặc dùng ảnh demo)' }]}>
          <PhotoInput demo={{ label: `Phiếu giao nhận · ${t.id}`, kg: kd || kp || t.kgRequired }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
