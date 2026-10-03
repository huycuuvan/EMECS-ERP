/* Thao tác phiếu cân (dùng chung trang Trạm cân, drawer phiếu cân, trang/drawer phiếu tiếp nhận):
   tạo phiếu cân xuất từ PTN/LSX · nhập kết quả cân (kg + ảnh ký 3 bên + lý do khi lệch) · điều xe đi mạ. */
import { DatePicker, Form, InputNumber, Input, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { AlertOctagon, Siren } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCreateTask, useCreateWeighing, useFillWeighing, useLsxList, useMeta, useReceipts, useWeighings } from '@/api/hooks'
import type { ID, Lsx, Receipt, Weighing } from '@/api/types'
import { PhotoInput } from '@/components/PhotoBlock'
import { fmtDelta, fmtKg, fmtNum, hoursOver } from '@/lib/format'
import { ErrBox, InfoBox, WarnBox } from '../lsx/boxes'

export const MAX_TRUCK = 10000 // tải trọng xe 10 tấn/chuyến
export const PC_FILL_HOURS = 4 // phiếu cân quá 4 giờ chưa có số/ảnh → quá hạn (backend config.PC_FILL_HOURS)

/** Phiếu chưa đủ số kg + ảnh ký 3 bên. */
export const isMissing = (p: Weighing) => p.kgActual == null || !(p.hasPhoto || p.photo)
/** Quá hạn: thiếu số/ảnh quá 4 giờ kể từ lúc lập phiếu. */
export const isOverdue = (p: Weighing) => isMissing(p) && hoursOver(p.date) >= PC_FILL_HOURS

/** Tồn chờ cân theo LSX = kho đã nhận − (đã cân thực + đang chờ cân theo lệnh). */
export function stockOfLsx(lsxId: ID, receipts: Receipt[], weighings: Weighing[]) {
  const rec = receipts.filter((r) => r.lsxId === lsxId).reduce((s, r) => s + (Number(r.kg) || 0), 0)
  const w = weighings.filter((p) => p.lsxId === lsxId).reduce((s, p) => s + (p.kgActual != null ? Number(p.kgActual) : Number(p.kgExpected) || 0), 0)
  return rec - w
}

/* ---------------------------------------------------------------- tạo phiếu cân xuất */
export function CreateWeighingModal({ lsxId, receiptId, onClose }: { lsxId?: ID; receiptId?: ID; onClose: () => void }) {
  const create = useCreateWeighing()
  const { data: lsxs = [] } = useLsxList()
  const { data: rcs = [] } = useReceipts()
  const { data: pcs = [] } = useWeighings()
  const options = useMemo(() => lsxs.filter((x) => x.id === lsxId || stockOfLsx(x.id, rcs, pcs) > 0), [lsxs, rcs, pcs, lsxId])
  const [form] = Form.useForm<{ lsxId: ID; kg: number }>()
  const sel = Form.useWatch('lsxId', form)
  const kg = Form.useWatch('kg', form)
  const x = lsxs.find((l) => l.id === sel)
  const st = sel ? stockOfLsx(sel, rcs, pcs) : 0
  const inited = useRef(false)

  // khi dữ liệu về: chọn sẵn LSX (từ PTN) + đề xuất kg chuyến này
  useEffect(() => {
    if (inited.current || !lsxs.length || !options.length) return
    const id = lsxId && options.some((l) => l.id === lsxId) ? lsxId : options[0].id
    form.setFieldsValue({ lsxId: id, kg: Math.max(0, Math.min(stockOfLsx(id, rcs, pcs), MAX_TRUCK)) || undefined })
    inited.current = true
  }, [lsxs, options, lsxId, rcs, pcs, form])

  return (
    <Modal open title="Tạo phiếu cân xuất đi mạ" okText="Tạo phiếu cân" cancelText="Hủy" onCancel={onClose} width={640}
      confirmLoading={create.isPending} onOk={() => form.submit()} okButtonProps={{ disabled: !options.length }}>
      {!options.length && lsxs.length ? <p className="caption" style={{ marginTop: 12 }}>Không còn lệnh SX nào có tồn kho chờ cân.</p> : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}
          onFinish={async (v) => {
            // từ PTN: gửi mã PTN (backend tự suy LSX); còn lại gửi mã LSX
            const sourceId = receiptId && v.lsxId === lsxId ? receiptId : v.lsxId
            await create.mutateAsync({ sourceId, kgExpected: v.kg })
            onClose()
          }}>
          <Form.Item name="lsxId" label="Lệnh SX có tồn kho chờ cân" rules={[{ required: true, message: 'Chọn lệnh SX' }]}>
            <Select onChange={(id: ID) => form.setFieldsValue({ kg: Math.max(0, Math.min(stockOfLsx(id, rcs, pcs), MAX_TRUCK)) || undefined })}
              options={options.map((l: Lsx) => ({ value: l.id, label: `${l.id} · ${l.name} — tồn chờ cân ${fmtNum(stockOfLsx(l.id, rcs, pcs))} kg` }))} />
          </Form.Item>
          {x && (
            <InfoBox>
              HĐ <b>{x.contractId}</b> · tồn kho chờ cân <b>{fmtKg(st)}</b> · đề xuất chuyến này <b>{fmtKg(Math.max(0, Math.min(st, MAX_TRUCK)))}</b> (xe 10 tấn)
              {receiptId && <> · từ phiếu tiếp nhận <b>{receiptId}</b></>}
            </InfoBox>
          )}
          <Form.Item name="kg" label="Khối lượng theo lệnh xuất (kg) — xe tối đa 10 tấn/chuyến" rules={[
            { required: true, type: 'number', min: 0.0001, message: 'Nhập khối lượng theo lệnh xuất' },
            { validator: (_, v) => (v > MAX_TRUCK ? Promise.reject(new Error('Quá tải trọng xe: tối đa 10.000 kg/chuyến')) : Promise.resolve()) },
          ]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {kg > MAX_TRUCK && (
            <WarnBox title={<><AlertOctagon size={13} /> Quá tải trọng xe: {fmtKg(kg)} &gt; 10.000 kg/chuyến — chia thành nhiều chuyến</>} />
          )}
        </Form>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- nhập kết quả cân */
type FillVals = { kg: number; photo: string | null; laiXe?: string; reason?: string; note?: string }
export function FillWeighingModal({ p, onClose }: { p: Weighing; onClose: () => void }) {
  const fill = useFillWeighing()
  const { data: meta } = useMeta()
  const tol = meta?.toleranceKg ?? 30
  const [form] = Form.useForm<FillVals>()
  const kg = Form.useWatch('kg', form)
  const delta = kg > 0 ? kg - p.kgExpected : 0
  const bad = kg > 0 && Math.abs(delta) > tol
  return (
    <Modal open title={`Nhập kết quả cân — ${p.id}`} okText="Ghi nhận kết quả cân" cancelText="Hủy" onCancel={onClose} width={680}
      confirmLoading={fill.isPending} onOk={() => form.submit()}>
      <div style={{ marginTop: 12 }}>
        <InfoBox>HĐ <b>{p.contractId}</b> · {p.lsxId} · KL theo lệnh xuất <b>{fmtKg(p.kgExpected)}</b> · dung sai cho phép ±{tol} kg</InfoBox>
      </div>
      <Form form={form} layout="vertical" initialValues={{ photo: p.photo ?? null, laiXe: p.signers.laiXe || undefined }}
        onFinish={async (v) => {
          await fill.mutateAsync({
            id: p.id, kgActual: v.kg, photo: v.photo, signerLaiXe: v.laiXe || undefined,
            reason: bad ? v.reason : undefined, reasonNote: bad ? (v.note || '').trim() : undefined,
          })
          onClose()
        }}>
        <Form.Item name="kg" label="KG CÂN THỰC TẠI TRẠM" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Nhập số kg cân thực' }]}>
          <InputNumber min={0} placeholder="0" style={{ width: '100%', fontSize: 26, fontWeight: 800, fontFamily: 'var(--ff-mono)' }} size="large" />
        </Form.Item>
        <Form.Item name="photo" label="Ảnh phiếu cân ký 3 bên (Bốc xếp · Thủ kho · Lái xe)"
          rules={[{ required: true, message: 'Bắt buộc tải ảnh phiếu cân ký 3 bên' }]}>
          <PhotoInput demo={{ label: `${p.id} · ${p.contractId}`, kg: kg || p.kgExpected }} />
        </Form.Item>
        <Form.Item name="laiXe" label="Lái xe ký phiếu">
          <Select allowClear placeholder="Chọn lái xe" options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
        </Form.Item>
        {bad && (
          <WarnBox title={<><Siren size={14} /> LỆCH {fmtDelta(delta)} — bắt buộc chọn lý do</>}>
            <Form.Item name="reason" label="Lý do sai lệch (bắt buộc)" rules={[{ required: true, message: `Phiếu LỆCH ${fmtDelta(delta)} — bắt buộc chọn lý do` }]} style={{ marginBottom: 8 }}>
              <Select placeholder="— Chọn lý do —" options={(meta?.reasonsCan ?? []).map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Form.Item name="note" label="Diễn giải" rules={[{ required: true, whitespace: true, message: 'Bắt buộc diễn giải nguyên nhân lệch cân' }]} style={{ marginBottom: 0 }}>
              <Input.TextArea rows={2} placeholder="Mô tả cụ thể nguyên nhân lệch cân..." />
            </Form.Item>
          </WarnBox>
        )}
      </Form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- điều xe đi mạ */
export function DispatchModal({ p, onClose }: { p: Weighing; onClose: () => void }) {
  const create = useCreateTask()
  const { data: meta } = useMeta()
  const drivers = meta?.drivers ?? []
  const [driver, setDriver] = useState<string | undefined>(p.signers.laiXe || drivers[0])
  const [arrive, setArrive] = useState<Dayjs | null>(dayjs().add(1, 'hour').minute(0).second(0))
  const [due, setDue] = useState<Dayjs | null>(dayjs().add(25, 'hour').minute(0).second(0))
  const [err, setErr] = useState<ReactNode>(null)
  if (p.kgActual == null) return null
  return (
    <Modal open title={`Điều xe đi mạ — ${p.id}`} okText="Giao thẻ công việc" cancelText="Hủy" onCancel={onClose}
      confirmLoading={create.isPending}
      onOk={async () => {
        const d = driver ?? drivers[0]
        if (!d) return setErr('Chọn tài xế')
        if (!arrive) return setErr('Chọn ngày giờ lái xe phải có mặt')
        if (!due || !due.isAfter(arrive)) return setErr('Hạn trả phiếu phải sau giờ có mặt')
        await create.mutateAsync({ type: 'di_ma', driver: d, contractId: p.contractId, refId: p.id, arriveAt: arrive.format(), fillDeadline: due.format() })
        onClose()
      }}>
      <div style={{ marginTop: 12 }}>
        <InfoBox>
          Chuyến hàng <b>{fmtKg(p.kgActual)}</b> (theo số cân thực) · HĐ <b>{p.contractId}</b> → Xưởng Mạ kẽm Việt Đức.<br />
          Tài xế phải xác nhận thẻ, điền số cân bên mạ + ảnh phiếu trước <b>hạn trả phiếu</b> bên dưới.
        </InfoBox>
        <div className="caption" style={{ marginBottom: 6 }}>Chọn tài xế</div>
        <Select value={driver ?? drivers[0]} onChange={setDriver} style={{ width: '100%' }} options={drivers.map((d) => ({ value: d, label: d }))} />
        <div className="caption" style={{ margin: '10px 0 6px' }}>Ngày giờ lái xe phải có mặt</div>
        <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="HH:mm DD/MM/YYYY" value={arrive} style={{ width: '100%' }}
          onChange={(d) => { setArrive(d); if (d) setDue(d.add(24, 'hour')) }} />
        <div className="caption" style={{ margin: '10px 0 6px' }}>Hạn trả phiếu (điền số cân + ảnh phiếu)</div>
        <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="HH:mm DD/MM/YYYY" value={due} onChange={setDue} style={{ width: '100%' }} />
        <div style={{ marginTop: 10 }}><ErrBox>{err}</ErrBox></div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- hook */
type State = { kind: 'create'; lsxId?: ID; receiptId?: ID } | { kind: 'fill' | 'dispatch'; p: Weighing } | null

export function useWeighingActions() {
  const [state, setState] = useState<State>(null)
  const close = () => setState(null)
  let node: ReactNode = null
  if (state?.kind === 'create') node = <CreateWeighingModal lsxId={state.lsxId} receiptId={state.receiptId} onClose={close} />
  else if (state?.kind === 'fill') node = <FillWeighingModal p={state.p} onClose={close} />
  else if (state?.kind === 'dispatch') node = <DispatchModal p={state.p} onClose={close} />
  return {
    create: (o?: { lsxId?: ID; receiptId?: ID }) => setState({ kind: 'create', ...o }),
    fill: (p: Weighing) => setState({ kind: 'fill', p }),
    dispatch: (p: Weighing) => setState({ kind: 'dispatch', p }),
    node,
  }
}
