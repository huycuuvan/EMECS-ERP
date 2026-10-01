/* Xử lý dứt điểm bút toán kho ảo đang treo: hướng xử lý (meta.vlossResolutions) + ghi chú. */
import { Form, Input, Modal, Select } from 'antd'
import { useEffect } from 'react'
import { useMeta, useResolveVloss } from '@/api/hooks'
import type { VLoss } from '@/api/types'
import { fmtKg } from '@/lib/format'

/** Nằm trên drawer bản ghi (drawer zIndex 1000+). */
export const VLOSS_MODAL_Z = 1500

export default function ResolveVlossModal({ entry, onClose }: { entry: VLoss | null; onClose: () => void }) {
  const { data: meta } = useMeta()
  const m = useResolveVloss()
  const [form] = Form.useForm<{ resolution: string; note?: string }>()
  useEffect(() => {
    if (entry) { form.resetFields(); form.setFieldsValue({ resolution: meta?.vlossResolutions[0] }) }
  }, [entry, form, meta])

  const submit = async () => {
    const v = await form.validateFields()
    await m.mutateAsync({ id: entry!.id, resolution: v.resolution, note: v.note })
    onClose()
  }
  return (
    <Modal open={!!entry} zIndex={VLOSS_MODAL_Z} title={entry ? `Xử lý dứt điểm — ${entry.id} (${fmtKg(Math.abs(entry.kg))})` : ''}
      okText="Xác nhận xử lý" cancelText="Hủy" confirmLoading={m.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <div onClick={(e) => e.stopPropagation()}>
        <Form form={form} layout="vertical">
          <Form.Item name="resolution" label="Hướng xử lý" rules={[{ required: true, message: 'Chọn hướng xử lý' }]}>
            <Select options={(meta?.vlossResolutions ?? []).map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú xử lý" style={{ marginBottom: 0 }}>
            <Input placeholder="VD: gom cùng lô phế liệu bán cuối tháng" />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  )
}
