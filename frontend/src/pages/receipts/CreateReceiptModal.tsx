/* Lập phiếu tiếp nhận thành phẩm (kho nhận từ sản xuất theo LSX) — chặn nhận vượt số kg xưởng đã báo hoàn thành. */
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { AlertOctagon, Factory } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useCreateReceipt, useLsxList, useReceipts } from '@/api/hooks'
import type { ID, Receipt } from '@/api/types'
import { fmtD, fmtKg, fmtNum } from '@/lib/format'
import { InfoBox, WarnBox } from '../lsx/boxes'

export default function CreateReceiptModal({ lsxId, onClose, onCreated }: { lsxId?: ID; onClose: () => void; onCreated?: (r: Receipt) => void }) {
  const create = useCreateReceipt()
  const { data: all = [] } = useLsxList()
  const { data: rcs = [] } = useReceipts()
  const lsxs = useMemo(() => all.filter((x) => x.status === 'Đang SX' || x.status === 'Hoàn thành'), [all])
  /* lũy kế kho đã nhận theo 1 LSX */
  const recOf = (id: ID) => rcs.filter((r) => r.lsxId === id).reduce((s, r) => s + (Number(r.kg) || 0), 0)

  const [form] = Form.useForm<{ lsxId: ID; qty: number; kg: number; note?: string }>()
  const sel = Form.useWatch('lsxId', form)
  const kg = Form.useWatch('kg', form)
  const x = lsxs.find((l) => l.id === sel)
  const rec = sel ? recOf(sel) : 0
  const remain = x ? Math.max(0, (x.kgDone || 0) - rec) : 0
  const over = x && kg > 0 ? Math.round((rec + kg - (x.kgDone || 0)) * 100) / 100 : 0

  useEffect(() => {
    if (form.getFieldValue('lsxId') || !lsxs.length) return
    form.setFieldsValue({ lsxId: lsxId && lsxs.some((l) => l.id === lsxId) ? lsxId : lsxs[0].id })
  }, [lsxs, lsxId, form])

  return (
    <Modal open title="Lập phiếu tiếp nhận thành phẩm" okText="Lập phiếu tiếp nhận" cancelText="Hủy" onCancel={onClose} width={640}
      confirmLoading={create.isPending} onOk={() => form.submit()} okButtonProps={{ disabled: !lsxs.length }}>
      {!lsxs.length && all.length ? <p className="caption" style={{ marginTop: 12 }}>Chưa có lệnh SX nào đang sản xuất / hoàn thành để tiếp nhận.</p> : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          onFinish={async (v) => {
            const r = await create.mutateAsync({ lsxId: v.lsxId, qty: v.qty, kg: v.kg, note: v.note })
            onClose()
            onCreated?.(r)
          }}>
          <Form.Item name="lsxId" label="Lệnh sản xuất (đang SX / hoàn thành)" rules={[{ required: true, message: 'Chọn lệnh SX' }]}>
            <Select options={lsxs.map((l) => ({ value: l.id, label: `${l.id} · ${l.name} — còn nhận được ${fmtNum(Math.max(0, (l.kgDone || 0) - recOf(l.id)))} kg` }))} />
          </Form.Item>
          {x && (
            <InfoBox>
              <Factory size={12} style={{ verticalAlign: -2 }} /> SX đã báo xong <b>{fmtKg(x.kgDone || 0)}</b> — kho đã nhận <b>{fmtKg(rec)}</b> — còn có thể nhận <b>{fmtKg(remain)}</b>
              <br />HĐ <b>{x.contractId}</b> · hạn SX {fmtD(x.extension ? x.extension.to : x.deadline)}
            </InfoBox>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Form.Item name="qty" label="Số lượng SP" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Nhập số lượng SP hợp lệ' }]}>
              <InputNumber min={0} step={1} placeholder="VD: 10" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="kg" label="Khối lượng (kg)" rules={[
              { required: true, type: 'number', min: 0.0001, message: 'Nhập khối lượng kg hợp lệ' },
              { validator: () => (over > 0 ? Promise.reject(new Error(`Vượt số SX đã báo ${fmtNum(over)} kg — kiểm tra lại với xưởng`)) : Promise.resolve()) },
            ]}>
              <InputNumber min={0} placeholder="VD: 10000" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          {over > 0 && <WarnBox title={<><AlertOctagon size={13} /> Vượt số SX đã báo {fmtNum(over)} kg — kiểm tra lại với xưởng</>} />}
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="VD: Đợt 5 — cấu kiện số 069–078" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
