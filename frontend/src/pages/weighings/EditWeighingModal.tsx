/* Sửa phiếu cân (lưu lịch sử): KL theo lệnh, KL cân thực, người ký 3 bên. Đổi số kg bắt buộc "Lý do sửa";
   hệ thống chạy lại quy tắc dung sai (lập / cập nhật / ghi chú biên bản sai lệch) — xem trước ngay trong form.
   Dùng chung `MismatchPreview` + `EditReasonField` cho form sửa thẻ lái xe. */
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { Siren } from 'lucide-react'
import { useMeta, useMismatch } from '@/api/hooks'
import { useEditWeighing } from '@/api/hooksEdit'
import type { ID, Weighing } from '@/api/types'
import { fmtDelta, fmtKg } from '@/lib/format'
import { InfoBox, WarnBox } from '../lsx/boxes'
import { MODAL_Z } from '../mismatches/sign'
import { NUM } from '@/lib/numberInput'

/** Ô "Lý do sửa" — bắt buộc khi `required` (đổi số kg / số lượng). */
export function EditReasonField({ required }: { required: boolean }) {
  return (
    <Form.Item name="reason" label={<span>Lý do sửa {required ? <span className="text-signal">(bắt buộc khi đổi số kg / số lượng)</span> : <span className="caption">(tùy chọn)</span>}</span>}
      rules={[{ required, whitespace: true, message: 'Đổi số kg / số lượng bắt buộc nhập lý do sửa — lý do được lưu vào lịch sử chỉnh sửa' }]}>
      <Input.TextArea rows={2} placeholder="VD: cân lại do đầu cân lệch, nhập nhầm số..." />
    </Form.Item>
  )
}

/** Biên bản đang chờ ký (nếu có) của chứng từ — để xem trước hệ thống sẽ lập mới / cập nhật / ghi chú. */
export function usePendingMismatchId(mismatchId: ID | null) {
  const { data: m } = useMismatch(mismatchId)
  return m && m.status === 'Chờ QL ký' ? m.id : null
}

/** Xem trước kết quả quy tắc dung sai sau khi sửa số (giống server). Có ô lý do sai lệch khi phải lập biên bản mới. */
export function MismatchPreview({ out, delta, pendingId, tol, what = 'Số cân' }: { out: boolean; delta: number; pendingId: ID | null; tol: number; what?: string }) {
  const { data: meta } = useMeta()
  if (out && !pendingId) return (
    <WarnBox title={<><Siren size={14} /> LỆCH {fmtDelta(delta)} vượt dung sai ±{tol} kg — hệ thống sẽ lập biên bản sai lệch mới chờ Quản lý ký</>}>
      <Form.Item name="mismatchReason" label="Lý do sai lệch (bắt buộc)" rules={[{ required: true, message: 'Chọn lý do sai lệch cho biên bản mới' }]} style={{ marginBottom: 8 }}>
        <Select placeholder="— Chọn lý do —" options={(meta?.reasonsCan ?? []).map((r) => ({ value: r, label: r }))} />
      </Form.Item>
      <Form.Item name="reasonNote" label="Diễn giải cho biên bản" style={{ marginBottom: 0 }}>
        <Input placeholder="Mô tả nguyên nhân lệch (để trống = lấy theo lý do sửa)" />
      </Form.Item>
    </WarnBox>
  )
  if (out) return <InfoBox>Vẫn lệch <b className="text-signal">{fmtDelta(delta)}</b> — số trên biên bản <b>{pendingId}</b> (đang chờ Quản lý ký) sẽ được cập nhật theo số mới.</InfoBox>
  if (pendingId) return <InfoBox>{what} về trong dung sai ±{tol} kg — biên bản <b>{pendingId}</b> vẫn giữ (chờ Quản lý ký), hệ thống ghi chú việc sửa số vào diễn giải.</InfoBox>
  return <InfoBox>Trong dung sai ±{tol} kg{delta ? ` (${fmtDelta(delta)})` : ''} — không phát sinh biên bản sai lệch.</InfoBox>
}

type V = { kgExpected: number; kgActual?: number; bocXep?: string; kho?: string; laiXe?: string; reason?: string; mismatchReason?: string; reasonNote?: string }

export default function EditWeighingModal({ p, onClose }: { p: Weighing; onClose: () => void }) {
  const edit = useEditWeighing()
  const { data: meta } = useMeta()
  const tol = meta?.toleranceKg ?? 30
  const pendingId = usePendingMismatchId(p.mismatchId)
  const [form] = Form.useForm<V>()
  const exp = Form.useWatch('kgExpected', form)
  const act = Form.useWatch('kgActual', form)
  const weighed = p.kgActual != null
  const e = typeof exp === 'number' ? exp : p.kgExpected
  const a = weighed ? (typeof act === 'number' ? act : p.kgActual!) : null
  const kgChanged = e !== p.kgExpected || (weighed && a !== p.kgActual)
  const delta = a != null ? a - e : 0
  const lock = p.lossAccepted

  const submit = async () => {
    const v = await form.validateFields()
    await edit.mutateAsync({
      id: p.id, kgExpected: v.kgExpected, kgActual: weighed ? v.kgActual : undefined,
      signers: { bocXep: v.bocXep ?? '', kho: v.kho ?? '', laiXe: v.laiXe ?? '' },
      reason: (v.reason || '').trim() || undefined, mismatchReason: v.mismatchReason, reasonNote: (v.reasonNote || '').trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal open zIndex={MODAL_Z} title={`Sửa phiếu cân ${p.id}`} okText="Lưu thay đổi" cancelText="Hủy" width={620}
      confirmLoading={edit.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>HĐ <b>{p.contractId}</b> · {p.lsxId} · dung sai ±{tol} kg. Mọi thay đổi được lưu vào <b>lịch sử chỉnh sửa</b> (người sửa, giờ sửa, số cũ → mới, lý do).
          {lock && <><br /><b className="text-signal">Phần lệch đã chuyển kho ảo — không sửa được số kg.</b></>}</InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{
        kgExpected: p.kgExpected, kgActual: p.kgActual ?? undefined,
        bocXep: p.signers.bocXep, kho: p.signers.kho, laiXe: p.signers.laiXe || undefined,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="kgExpected" label="KL theo lệnh xuất (kg)" rules={[{ required: true, type: 'number', min: 0.0001, message: 'KL theo lệnh phải lớn hơn 0' }]}>
            <InputNumber {...NUM} min={0} style={{ width: '100%' }} disabled={lock} suffix="kg" />
          </Form.Item>
          <Form.Item name="kgActual" label="KL cân thực tế (kg)" extra={!weighed ? 'Phiếu chưa cân — dùng "Nhập kết quả cân"' : undefined}
            rules={weighed ? [{ required: true, type: 'number', min: 0, message: 'Nhập số kg cân thực' }] : []}>
            <InputNumber {...NUM} min={0} style={{ width: '100%' }} disabled={lock || !weighed} suffix="kg" />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Form.Item name="bocXep" label="Bốc xếp ký"><Input /></Form.Item>
          <Form.Item name="kho" label="Thủ kho ký"><Input /></Form.Item>
          <Form.Item name="laiXe" label="Lái xe ký">
            <Select allowClear placeholder="Chọn lái xe" options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
          </Form.Item>
        </div>
        {kgChanged && a != null && <MismatchPreview out={Math.abs(delta) > tol} delta={delta} pendingId={pendingId} tol={tol} />}
        {kgChanged && a == null && <InfoBox>KL theo lệnh đổi {fmtKg(p.kgExpected)} → {fmtKg(e)}.</InfoBox>}
        <EditReasonField required={kgChanged} />
      </Form>
    </Modal>
  )
}
