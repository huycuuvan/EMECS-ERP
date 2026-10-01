/* Sửa lý do / diễn giải biên bản sai lệch (lưu lịch sử) — chỉ khi biên bản còn "Chờ QL ký".
   Quyền (khớp server): Quản lý, Thủ kho; lái xe chỉ sửa biên bản do chính mình báo. */
import { Form, Input, Modal, Select } from 'antd'
import { useMeta } from '@/api/hooks'
import { useEditMismatch } from '@/api/hooksEdit'
import type { Mismatch } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { InfoBox } from '../lsx/boxes'
import { MODAL_Z, signedKg } from './sign'

const OTHER = 'Khác (ghi rõ)'

export function useCanEditMismatch() {
  const { hasRole, user } = useAuth()
  return (m: Mismatch) => m.status === 'Chờ QL ký' && (hasRole('kho') || (hasRole('lx') && m.reportedBy === user?.name))
}

export default function EditMismatchModal({ m, onClose }: { m: Mismatch; onClose: () => void }) {
  const edit = useEditMismatch()
  const { data: meta } = useMeta()
  const [form] = Form.useForm<{ reason: string; reasonNote?: string; editNote?: string }>()
  const reason = Form.useWatch('reason', form)
  const submit = async () => {
    const v = await form.validateFields()
    await edit.mutateAsync({ id: m.id, reason: v.reason, reasonNote: (v.reasonNote || '').trim(), editNote: (v.editNote || '').trim() || undefined })
    onClose()
  }
  return (
    <Modal open zIndex={MODAL_Z} title={`Sửa lý do sai lệch — ${m.id}`} okText="Lưu thay đổi" cancelText="Hủy"
      confirmLoading={edit.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div style={{ marginTop: 12 }}>
        <InfoBox>{m.source} · {m.refId} · lệch <b className="text-signal">{signedKg(m.delta)}</b>. Biên bản đang chờ Quản lý ký — mọi thay đổi lý do được lưu vào lịch sử chỉnh sửa.</InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ reason: m.reason, reasonNote: m.reasonNote }}>
        <Form.Item name="reason" label="Lý do sai lệch (chọn từ danh mục)" rules={[{ required: true, message: 'Chọn lý do' }]}>
          <Select options={(meta?.reasonsCan ?? []).map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item name="reasonNote" label={<span>Diễn giải {reason === OTHER && <span className="text-signal">(bắt buộc khi chọn "Khác")</span>}</span>}
          rules={[{ validator: (_, v) => (reason === OTHER && !(v || '').trim() ? Promise.reject(new Error('Chọn "Khác (ghi rõ)" thì bắt buộc diễn giải')) : Promise.resolve()) }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="editNote" label="Vì sao sửa (tùy chọn)"><Input placeholder="VD: kiểm tra lại thực tế tại bãi" /></Form.Item>
      </Form>
    </Modal>
  )
}
