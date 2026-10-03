/* Thao tác phiếu cân (dùng chung trang Trạm cân, drawer phiếu cân, trang/drawer phiếu chuẩn bị hàng):
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
import AssignedGoods from './AssignedGoods'

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
              {receiptId && <> · từ phiếu chuẩn bị hàng <b>{receiptId}</b></>}
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

/* ---------------------------------------------------------------- nhập kết quả cân (cân xe) */
type FillVals = { gross: number; tare: number; plate?: string; inAt: Dayjs; outAt: Dayjs; photo: string | null; laiXe?: string; reason?: string; note?: string }
export function FillWeighingModal({ p, onClose }: { p: Weighing; onClose: () => void }) {
  const fill = useFillWeighing()
  const { data: meta } = useMeta()
  const pct = meta?.pcTolerancePct ?? 5
  const [form] = Form.useForm<FillVals>()
  const gross = Form.useWatch('gross', form) as number | undefined
  const tare = Form.useWatch('tare', form) as number | undefined
  const kg = gross != null && tare != null ? Math.round((gross - tare) * 1000) / 1000 : undefined
  const dev = kg != null && p.kgExpected ? ((kg - p.kgExpected) / p.kgExpected) * 100 : 0
  // thiếu trong pct% → đạt; thiếu quá pct% hoặc DƯ so với số giao → lý do + Quản lý duyệt
  const bad = kg != null && p.kgExpected > 0 && (kg > p.kgExpected || -dev > pct)
  return (
    <Modal open title={`Cân xuất — ${p.id}`} okText="Ghi nhận kết quả cân" cancelText="Hủy" onCancel={onClose} width={720}
      confirmLoading={fill.isPending} onOk={() => form.submit()}>
      <div style={{ marginTop: 12 }}>
        <InfoBox>HĐ <b>{p.contractId}</b> · {p.lsxId} · Quản lý giao <b>{fmtKg(p.kgExpected)}</b> · thiếu trong {pct}% là đạt; <b>thiếu quá {pct}% hoặc dư</b> phải nhập lý do, chờ Quản lý duyệt</InfoBox>
        <AssignedGoods receiptId={p.receiptId} />
      </div>
      <Form form={form} layout="vertical"
        initialValues={{ photo: p.photo ?? null, laiXe: p.signers.laiXe || undefined, plate: p.vehiclePlate ?? undefined,
          gross: p.grossKg ?? undefined, tare: p.tareKg ?? undefined,
          inAt: p.weighInAt ? dayjs(p.weighInAt) : dayjs().subtract(30, 'minute'), outAt: p.weighOutAt ? dayjs(p.weighOutAt) : dayjs() }}
        onFinish={async (v) => {
          await fill.mutateAsync({
            id: p.id, grossKg: v.gross, tareKg: v.tare, weighInAt: v.inAt.format(), weighOutAt: v.outAt.format(),
            vehiclePlate: v.plate || undefined, photo: v.photo, signerLaiXe: v.laiXe || undefined,
            reason: bad ? v.reason : undefined, reasonNote: bad ? (v.note || '').trim() : undefined,
          })
          onClose()
        }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0 12px' }}>
          <Form.Item name="gross" label="Trọng lượng xe + hàng (kg)" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Nhập tổng xe + hàng' }]}>
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item name="tare" label="Trọng lượng xe (kg)" dependencies={['gross']} rules={[{ required: true, type: 'number', min: 0, message: 'Nhập trọng lượng xe' },
            ({ getFieldValue }) => ({ validator: (_, v) => (v != null && getFieldValue('gross') != null && v > getFieldValue('gross') ? Promise.reject(new Error('Xe nặng hơn tổng?')) : Promise.resolve()) })]}>
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item label="Trọng lượng hàng (kg)">
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-mono)', color: bad ? 'var(--signal)' : 'var(--ink)' }}>
              {kg != null ? fmtNum(kg) : '—'}
              {kg != null && p.kgExpected > 0 && <span style={{ fontSize: 13, marginLeft: 8 }}>({dev > 0 ? '+' : ''}{dev.toFixed(1)}%)</span>}
            </div>
          </Form.Item>
          <Form.Item name="inAt" label="Ngày giờ cân vào" rules={[{ required: true, message: 'Chọn giờ cân vào' }]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="HH:mm DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="outAt" label="Ngày giờ cân ra" dependencies={['inAt']} rules={[{ required: true, message: 'Chọn giờ cân ra' },
            ({ getFieldValue }) => ({ validator: (_, v?: Dayjs) => (v && getFieldValue('inAt') && v.isBefore(getFieldValue('inAt')) ? Promise.reject(new Error('Cân ra phải sau cân vào')) : Promise.resolve()) })]}>
            <DatePicker showTime={{ format: 'HH:mm' }} format="HH:mm DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="plate" label="Biển số xe"><Input placeholder="VD: 29C-123.45" /></Form.Item>
        </div>
        <Form.Item name="photo" label="Ảnh phiếu cân" rules={[{ required: true, message: 'Bắt buộc chụp / tải ảnh phiếu cân' }]}>
          <PhotoInput demo={{ label: `${p.id} · ${p.contractId}`, kg: kg || p.kgExpected }} />
        </Form.Item>
        <Form.Item name="laiXe" label="Lái xe">
          <Select allowClear placeholder="Chọn lái xe" options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
        </Form.Item>
        {bad && (
          <WarnBox title={<><Siren size={14} /> {dev > 0 ? 'DƯ' : 'THIẾU'} {dev > 0 ? '+' : ''}{dev.toFixed(1)}% ({fmtDelta((kg ?? 0) - p.kgExpected)}) so với Quản lý giao — nhập lý do, chờ Quản lý duyệt mới tính công nợ</>}>
            <Form.Item name="reason" label="Lý do sai lệch (bắt buộc)" rules={[{ required: true, message: 'Bắt buộc chọn lý do' }]} style={{ marginBottom: 8 }}>
              <Select placeholder="— Chọn lý do —" options={(meta?.reasonsCan ?? []).map((r) => ({ value: r, label: r }))} />
            </Form.Item>
            <Form.Item name="note" label="Diễn giải" rules={[{ required: true, whitespace: true, message: 'Bắt buộc diễn giải nguyên nhân lệch' }]} style={{ marginBottom: 0 }}>
              <Input.TextArea rows={2} placeholder="Mô tả cụ thể nguyên nhân lệch..." />
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
