/* Lập phiếu chuẩn bị hàng (kho nhận từ sản xuất): chọn HỢP ĐỒNG → lệnh SX của hợp đồng đó; chỉ khối lượng (kg).
   Chặn nhận vượt số kg xưởng đã báo hoàn thành. */
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { AlertOctagon, Factory } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useContracts, useCreateReceipt, useLsxList, useReceipts } from '@/api/hooks'
import type { ID, Receipt } from '@/api/types'
import { fmtD, fmtKg, fmtNum } from '@/lib/format'
import { InfoBox, WarnBox } from '../lsx/boxes'
import ContractGoods, { perUnit, useContractGoods } from './ContractGoods'

export default function CreateReceiptModal({ lsxId, onClose, onCreated }: { lsxId?: ID; onClose: () => void; onCreated?: (r: Receipt) => void }) {
  const create = useCreateReceipt()
  const { data: all = [] } = useLsxList()
  const { data: rcs = [] } = useReceipts()
  const lsxs = useMemo(() => all.filter((x) => x.status === 'Đang SX' || x.status === 'Hoàn thành'), [all])
  /* lũy kế kho đã nhận theo 1 LSX */
  const recOf = (id: ID) => rcs.filter((r) => r.lsxId === id).reduce((s, r) => s + (Number(r.kg) || 0), 0)

  const { data: contracts = [] } = useContracts()
  const [form] = Form.useForm<{ contractId: ID; lsxId: ID; kg: number; note?: string }>()
  const sel = Form.useWatch('lsxId', form)
  const cid = Form.useWatch('contractId', form)
  const cOpts = useMemo(() => contracts.filter((c) => lsxs.some((l) => l.contractId === c.id)), [contracts, lsxs])
  const lsxOfC = lsxs.filter((l) => l.contractId === cid)
  const [qtys, setQtys] = useState<Record<number, number | null>>({})
  const { order } = useContractGoods(cid)
  const lines = (order?.items ?? []).filter((i) => (qtys[i.id!] || 0) > 0)
  const autoKg = Math.round(lines.reduce((s, i) => s + (qtys[i.id!] || 0) * perUnit(i), 0) * 1000) / 1000
  useEffect(() => { if (lines.length) form.setFieldValue('kg', autoKg) }, [autoKg, lines.length, form])
  const kg = Form.useWatch('kg', form)
  const x = lsxs.find((l) => l.id === sel)
  const rec = sel ? recOf(sel) : 0
  const remain = x ? Math.max(0, (x.kgDone || 0) - rec) : 0
  const over = x && kg > 0 ? Math.round((rec + kg - (x.kgDone || 0)) * 100) / 100 : 0

  useEffect(() => {
    if (form.getFieldValue('lsxId') || !lsxs.length) return
    const first = (lsxId && lsxs.find((l) => l.id === lsxId)) || lsxs[0]
    form.setFieldsValue({ contractId: first.contractId, lsxId: first.id })
  }, [lsxs, lsxId, form])
  const pickContract = (c: ID) => {
    const ls = lsxs.filter((l) => l.contractId === c)
    form.setFieldsValue({ lsxId: ls.length === 1 ? ls[0].id : undefined })
    setQtys({})
  }

  return (
    <Modal open title="Chuẩn bị hàng — giao xuống kho" okText="Giao xuống kho" cancelText="Hủy" onCancel={onClose} width={860}
      confirmLoading={create.isPending} onOk={() => form.submit()} okButtonProps={{ disabled: !lsxs.length }}>
      {!lsxs.length && all.length ? <p className="caption" style={{ marginTop: 12 }}>Chưa có lệnh SX nào đang sản xuất / hoàn thành để tiếp nhận.</p> : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          onFinish={async (v) => {
            const items = lines.map((i) => ({ itemId: i.id!, qty: qtys[i.id!] || 0 }))
            const r = await create.mutateAsync({ lsxId: v.lsxId, note: v.note, ...(items.length ? { items } : { kg: v.kg }) })
            onClose()
            onCreated?.(r)
          }}>
          <Form.Item name="contractId" label="Hợp đồng" rules={[{ required: true, message: 'Chọn hợp đồng' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} onChange={pickContract}
              options={cOpts.map((c) => ({ value: c.id, label: `${c.id} · số ${c.number || c.orderId} — ${c.customer}` }))} />
          </Form.Item>
          <ContractGoods contractId={cid} qtys={qtys} onQty={(id, val) => setQtys((p) => ({ ...p, [id]: val }))} />
          <Form.Item name="lsxId" label="Lệnh sản xuất của hợp đồng (đang SX / hoàn thành)" rules={[{ required: true, message: 'Chọn lệnh SX' }]}>
            <Select placeholder={cid ? 'Chọn lệnh SX' : 'Chọn hợp đồng trước'}
              options={lsxOfC.map((l) => ({ value: l.id, label: `${l.id} · ${l.name} — còn nhận được ${fmtNum(Math.max(0, (l.kgDone || 0) - recOf(l.id)))} kg` }))} />
          </Form.Item>
          {x && (
            <InfoBox>
              <Factory size={12} style={{ verticalAlign: -2 }} /> SX đã báo xong <b>{fmtKg(x.kgDone || 0)}</b> — kho đã nhận <b>{fmtKg(rec)}</b> — còn có thể nhận <b>{fmtKg(remain)}</b>
              <br />HĐ <b>{x.contractId}</b> · hạn SX {fmtD(x.extension ? x.extension.to : x.deadline)}
            </InfoBox>
          )}
          <div>
            <Form.Item name="kg" label={lines.length ? 'Tổng khối lượng (kg) — tự cộng từ số lượng từng mặt hàng' : 'Khối lượng (kg)'} rules={[
              { required: true, type: 'number', min: 0.0001, message: 'Nhập khối lượng kg hợp lệ' },
              { validator: () => (over > 0 ? Promise.reject(new Error(`Vượt số SX đã báo ${fmtNum(over)} kg — kiểm tra lại với xưởng`)) : Promise.resolve()) },
            ]}>
              <InputNumber min={0} placeholder="Nhập số lượng ở bảng trên — hoặc gõ thẳng kg" style={{ width: '100%' }} disabled={lines.length > 0} />
            </Form.Item>
          </div>
          {over > 0 && <WarnBox title={<><AlertOctagon size={13} /> Vượt số SX đã báo {fmtNum(over)} kg — kiểm tra lại với xưởng</>} />}
          <p className="caption" style={{ margin: '0 0 10px' }}>Bấm <b>Giao xuống kho</b> → kho nhận phiếu cân <b>Chờ cân</b> với số lượng này; kho cân xe, chụp phiếu.
            Lệch quá ±5% so với số giao → kho nhập lý do, Quản lý duyệt mới tính công nợ.</p>
          <Form.Item name="note" label="Ghi chú">
            <Input placeholder="VD: Đợt 5 — cấu kiện số 069–078" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  )
}
