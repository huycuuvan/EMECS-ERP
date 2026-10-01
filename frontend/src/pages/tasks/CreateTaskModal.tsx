/* Quản lý A giao việc cho lái xe: loại việc, tài xế, hợp đồng, chứng từ gốc (PC/VC), KG yêu cầu, ghi chú. */
import { Form, Input, InputNumber, Modal, Radio, Select } from 'antd'
import { useEffect } from 'react'
import { useContract, useContracts, useCreateTask, useMeta } from '@/api/hooks'
import type { TaskType } from '@/api/types'
import { fmtKg } from '@/lib/format'
import { MODAL_Z } from './TaskActions'

interface V { type: TaskType; driver: string; contractId: string; refId?: string | null; kgRequired: number; note?: string }

export default function CreateTaskModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<V> }) {
  const [form] = Form.useForm<V>()
  const { data: meta } = useMeta()
  const { data: contracts } = useContracts()
  const create = useCreateTask()
  const type = Form.useWatch('type', form)
  const cid = Form.useWatch('contractId', form)
  const { data: agg } = useContract(open ? cid : null)

  const cs = (contracts ?? []).filter((c) => c.status === 'Đang triển khai' || c.status === 'Đã ký')

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({ type: 'di_ma', driver: meta?.drivers[0], contractId: cs[0]?.id, ...initial })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Chứng từ gốc: đi mạ → phiếu cân xuất (PC đã cân, chưa có thẻ đi mạ nào dùng); giao khách → thẻ gửi mạ (VC mạ đã cân nhận)
  const usedPc = new Set((agg?.tasksDiMa ?? []).map((t) => t.refId).filter(Boolean))
  const refOptions = !agg ? [] : type === 'di_ma'
    ? agg.weighings.filter((p) => p.kgActual != null && !usedPc.has(p.id))
      .map((p) => ({ value: p.id, label: `${p.id} · phiếu cân xuất ${fmtKg(p.kgActual)}`, kg: p.kgActual ?? p.kgExpected }))
    : agg.tasksDiMa.filter((t) => t.kgAtGalv != null)
      .map((t) => ({ value: t.id, label: `${t.id} · thẻ gửi mạ — mạ nhận ${fmtKg(t.kgAtGalv)}`, kg: t.kgAtGalv ?? t.kgRequired }))

  // gợi ý KG giao khách = toàn bộ lượng còn tại mạ (như demo)
  useEffect(() => {
    if (!open) return
    form.setFieldValue('refId', undefined)
    if (type === 'giao_khach' && agg && !form.getFieldValue('kgRequired') && agg.atGalvKg > 0) form.setFieldValue('kgRequired', agg.atGalvKg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, cid, agg?.contract.id])

  const submit = async () => {
    const v = await form.validateFields()
    await create.mutateAsync({ ...v, refId: v.refId || null })
    onClose()
  }

  return (
    <Modal open={open} zIndex={MODAL_Z} title="Giao việc cho lái xe" okText="Giao việc" cancelText="Hủy" width={560}
      confirmLoading={create.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="type" label="Loại việc">
          <Radio.Group options={[
            { value: 'di_ma', label: 'Đi mạ (công ty → xưởng mạ)' },
            { value: 'giao_khach', label: 'Giao khách (mạ → khách)' },
          ]} />
        </Form.Item>
        <Form.Item name="driver" label="Tài xế" rules={[{ required: true, message: 'Chưa chọn tài xế' }]}>
          <Select options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
        </Form.Item>
        <Form.Item name="contractId" label="Hợp đồng (đang triển khai)" rules={[{ required: true, message: 'Chưa chọn hợp đồng' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={cs.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer}` }))} />
        </Form.Item>
        <Form.Item name="refId" label={type === 'di_ma' ? 'Chứng từ gốc — phiếu cân xuất (PC)' : 'Chứng từ gốc — thẻ gửi mạ (VC)'}
          extra={refOptions.length === 0 && agg ? (type === 'di_ma' ? 'Không còn phiếu cân xuất nào chưa gán chuyến.' : 'Chưa có chuyến gửi mạ nào được mạ cân nhận.') : undefined}>
          <Select allowClear placeholder="— Không gắn chứng từ —" options={refOptions.map(({ value, label }) => ({ value, label }))}
            onChange={(v) => { const o = refOptions.find((x) => x.value === v); if (o) form.setFieldValue('kgRequired', o.kg) }} />
        </Form.Item>
        <Form.Item name="kgRequired" label="KG yêu cầu" rules={[{ required: true, message: 'KG yêu cầu phải lớn hơn 0' }, { type: 'number', min: 0.01, message: 'KG yêu cầu phải lớn hơn 0' }]}
          extra={type === 'giao_khach' && agg ? <>Còn tại xưởng mạ: <b style={{ color: 'var(--rust-deep)' }}>{fmtKg(agg.atGalvKg)}</b> — gợi ý KG yêu cầu = toàn bộ lượng còn tại mạ.</> : undefined}>
          <InputNumber style={{ width: '100%' }} min={0} step={100} placeholder="VD: 10000" suffix="kg" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input placeholder="VD: lấy tại cổng 2 xưởng mạ Việt Đức..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}
