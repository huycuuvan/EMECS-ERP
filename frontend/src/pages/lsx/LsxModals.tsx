/* Các thao tác trên Lệnh sản xuất (dùng chung trang danh sách + drawer):
   phát lệnh (QL) · xưởng nhận · xưởng từ chối có lý do · cập nhật tiến độ · QL duyệt gia hạn. */
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { OctagonAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  useContracts, useCreateLsx, useLsxAccept, useLsxExtend, useLsxList, useLsxProgress, useLsxReject, useMeta, useReceipts,
} from '@/api/hooks'
import type { ID, Lsx } from '@/api/types'
import { daysLeft, fmtD, fmtKg, fmtNum } from '@/lib/format'
import { C } from '@/theme'
import { ErrBox, WarnBox } from './boxes'
import { effDeadline } from './lsxUtil'
import RecordLink from '@/peek/RecordLink'

const OTHER = 'Khác (ghi rõ)'

/* ---------------------------------------------------------------- từ chối */
function RejectModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const { data: meta } = useMeta()
  const reject = useLsxReject()
  const [form] = Form.useForm<{ reason: string; note?: string }>()
  const reason = Form.useWatch('reason', form)
  const reasons = meta?.reasonsTuChoiSx ?? []
  return (
    <Modal open title={`Xưởng từ chối lệnh ${x.id}`} okText="Xác nhận từ chối" cancelText="Hủy" onCancel={onClose}
      okButtonProps={{ danger: true }} confirmLoading={reject.isPending} onOk={() => form.submit()}>
      <Form form={form} layout="vertical" initialValues={{ reason: reasons[0] }} style={{ marginTop: 12 }}
        onFinish={async (v) => {
          const note = (v.note || '').trim()
          await reject.mutateAsync({ id: x.id, reason: note ? `${v.reason} — ${note}` : v.reason })
          onClose()
        }}>
        <Form.Item name="reason" label="Lý do từ chối (bắt buộc)" rules={[{ required: true, message: 'Chọn lý do từ chối' }]}>
          <Select options={reasons.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item name="note"
          label={<span>Diễn giải thêm {reason === OTHER && <span className="text-signal">(bắt buộc khi chọn "Khác")</span>}</span>}
          rules={[{ validator: (_, v) => (reason === OTHER && !(v || '').trim()
            ? Promise.reject(new Error('Chọn "Khác (ghi rõ)" thì bắt buộc phải diễn giải lý do cụ thể.')) : Promise.resolve()) }]}>
          <Input.TextArea rows={3} placeholder="VD: máy chấn 400T bảo trì đến hết tuần, đề nghị lùi 2 ngày..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- cập nhật tiến độ */
function ProgressModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const progress = useLsxProgress()
  const { data: rcs = [] } = useReceipts({ lsxId: x.id })
  const recKg = rcs.reduce((s, r) => s + (Number(r.kg) || 0), 0)
  const avg = x.qtyPlan ? x.kgPlan / x.qtyPlan : 0
  const [form] = Form.useForm<{ qty: number; kg: number }>()
  const q = Form.useWatch('qty', form)
  const k = Form.useWatch('kg', form)
  const [ack, setAck] = useState(false)
  const [err, setErr] = useState<ReactNode>(null)

  const dev = avg > 0 && q > 0 && k != null ? (k / q - avg) / avg : 0
  const devBad = Math.abs(dev) > 0.1

  const submit = async () => {
    const qv = Number(q), kv = Number(k)
    if (q == null || k == null || isNaN(qv) || isNaN(kv) || qv < 0 || kv < 0) return setErr('Số SP và số kg không được để trống / không được âm.')
    if (qv > x.qtyPlan) return setErr(`SP báo hoàn thành (${fmtNum(qv)}) vượt kế hoạch ${fmtNum(x.qtyPlan)} SP.`)
    if (kv > x.kgPlan) return setErr(`Kg báo hoàn thành (${fmtNum(kv)}) vượt kế hoạch ${fmtKg(x.kgPlan)}.`)
    if (kv < recKg) return setErr(<span><OctagonAlert size={13} style={{ verticalAlign: -2 }} /> Kho đã tiếp nhận <b>{fmtKg(recKg)}</b> &gt; số SX báo ({fmtKg(kv)}) — không thể ghi số thấp hơn lượng kho đã nhận từ lệnh này.</span>)
    if (devBad && !ack) return setErr('Đơn trọng thực tế lệch quá ±10% so với kế hoạch — tick xác nhận bên dưới rồi ghi nhận lại.')
    setErr(null)
    await progress.mutateAsync({ id: x.id, qtyDone: qv, kgDone: kv })
    onClose()
  }

  return (
    <Modal open title={`Cập nhật tiến độ — ${x.id}`} okText="Ghi nhận tiến độ" cancelText="Hủy" onCancel={onClose}
      confirmLoading={progress.isPending} onOk={submit}>
      <p className="caption" style={{ marginTop: 8 }}>
        Kế hoạch <b>{fmtNum(x.qtyPlan)} SP · {fmtKg(x.kgPlan)}</b> — đơn trọng bình quân {fmtNum(Math.round(avg))} kg/SP.
        {recKg > 0 && <> Kho đã tiếp nhận lũy kế <b>{fmtKg(recKg)}</b> từ lệnh này.</>}
      </p>
      <Form form={form} layout="vertical" initialValues={{ qty: x.qtyDone, kg: x.kgDone }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="qty" label="SP đã hoàn thành"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="kg" label="Kg đã hoàn thành"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </div>
      </Form>
      <ErrBox>{err}</ErrBox>
      {devBad && (
        <WarnBox>
          <div style={{ color: C.signal, fontSize: 12.5 }}>
            Đơn trọng thực tế <b>{fmtNum(Math.round(k / q))} kg/SP</b> lệch <b>{dev > 0 ? '+' : ''}{Math.round(dev * 100)}%</b> so với kế hoạch {fmtNum(Math.round(avg))} kg/SP — kiểm tra lại số kg hoặc số SP.
          </div>
          <Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 6, color: C.signal, fontWeight: 600 }}>
            Tôi xác nhận số liệu đúng thực tế dù lệch đơn trọng kế hoạch
          </Checkbox>
        </WarnBox>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- gia hạn (QL) */
function ExtendModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const extend = useLsxExtend()
  const [form] = Form.useForm<{ to: Dayjs; reason: string }>()
  const eff = effDeadline(x)
  const dl = daysLeft(eff)
  return (
    <Modal open title={`Gia hạn tiến độ — ${x.id} (Quản lý duyệt)`} okText="Duyệt gia hạn" cancelText="Hủy" onCancel={onClose}
      confirmLoading={extend.isPending} onOk={() => form.submit()}>
      <p className="caption" style={{ marginTop: 8 }}>
        Hạn hiệu lực hiện tại: <b className="text-signal">{fmtD(eff)}</b>
        {dl < 0 ? <> — đã trễ {Math.abs(dl)} ngày.</> : <> — còn {dl} ngày.</>} Gia hạn sẽ ghi vào nhật ký lệnh kèm người duyệt.
      </p>
      <Form form={form} layout="vertical" initialValues={{ to: dayjs().add(2, 'day') }}
        onFinish={async (v) => {
          const to = v.to.hour(17).minute(0).second(0).millisecond(0)
          await extend.mutateAsync({ id: x.id, to: to.toISOString(), reason: v.reason.trim() })
          onClose()
        }}>
        <Form.Item name="to" label="Hạn mới" rules={[
          { required: true, message: 'Chọn ngày hạn mới.' },
          { validator: (_, v: Dayjs) => (v && !v.hour(17).isAfter(dayjs()) ? Promise.reject(new Error('Hạn mới phải sau thời điểm hiện tại.')) : Promise.resolve()) },
        ]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="reason" label="Lý do gia hạn (bắt buộc)"
          rules={[{ required: true, whitespace: true, message: 'Lý do gia hạn là bắt buộc — mọi lần lùi hạn đều phải truy được nguyên nhân.' }]}>
          <Input.TextArea rows={3} placeholder="VD: chờ thép tấm SS400 bổ sung từ NCC..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- phát lệnh mới (QL) */
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: ID) => void }) {
  const create = useCreateLsx()
  const { data: contracts = [] } = useContracts()
  const { data: lsxs = [] } = useLsxList()
  const signed = useMemo(() => contracts.filter((c) => c.signDate != null), [contracts])
  const waiting = useMemo(() => contracts.filter((c) => c.signDate == null), [contracts])
  /* kg đã phát lệnh của 1 HĐ (không tính lệnh bị từ chối — lệnh đó sẽ phát lại) */
  const remainOf = (cid: ID) => {
    const c = contracts.find((z) => z.id === cid)
    const committed = lsxs.filter((x) => x.contractId === cid && x.status !== 'Từ chối').reduce((s, x) => s + (Number(x.kgPlan) || 0), 0)
    return Math.max(0, (c?.totalKg || 0) - committed)
  }
  const [form] = Form.useForm<{ contractId: ID; name: string; qty: number; kg: number; leadDays: number }>()
  const cid = Form.useWatch('contractId', form)
  const rem = cid ? remainOf(cid) : 0

  const sync = (id: ID) => {
    const c = contracts.find((z) => z.id === id)
    const seq = lsxs.filter((l) => l.contractId === id).length + 1
    const r = remainOf(id)
    form.setFieldsValue({ name: `Lệnh SX ${c?.code ?? ''} — đợt ${seq}`, kg: r > 0 ? r : undefined })
  }

  return (
    <Modal open title="Phát lệnh sản xuất (Quản lý)" okText="Phát lệnh" cancelText="Hủy" onCancel={onClose}
      confirmLoading={create.isPending} onOk={() => form.submit()} width={600}>
      {!signed.length ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px' }}>Chưa có hợp đồng <b>đã ký</b> để phát lệnh — lệnh sản xuất chỉ phát cho hợp đồng khách đã ký.</p>
          {waiting.length > 0 && (
            <>
              <p className="caption" style={{ margin: '0 0 6px' }}>Hợp đồng đang chờ — vào <b>Hợp đồng &amp; Tạm ứng</b> bấm <b>Đã trả HĐ</b> rồi <b>Đã ký</b> (Kế toán / Quản lý):</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {waiting.map((c) => <li key={c.id}><RecordLink id={c.id} type="hd" /> — {c.customer} · <b>{c.status}</b></li>)}
              </ul>
            </>
          )}
        </div>
      ) : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ leadDays: 7 }}
          onFinish={async (v) => {
            const x = await create.mutateAsync({ contractId: v.contractId, name: v.name.trim(), qty: v.qty, kg: v.kg, leadDays: v.leadDays || 7 })
            onCreated?.(x.id)
            onClose()
          }}>
          <Form.Item name="contractId" label="Hợp đồng (chỉ HĐ đã ký)" rules={[{ required: true, message: 'Chọn hợp đồng.' }]}
            extra={cid ? (rem > 0
              ? <span>Còn <b>{fmtNum(rem)} kg</b> của hợp đồng này chưa phát lệnh (không tính lệnh bị từ chối).</span>
              : <span className="text-signal" style={{ fontWeight: 600 }}>Hợp đồng đã phát lệnh đủ khối lượng — không còn phần để phát thêm.</span>) : undefined}>
            <Select placeholder="Chọn hợp đồng" onChange={sync}
              options={signed.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer} · còn ${fmtNum(remainOf(c.id))} kg chưa phát lệnh` }))} />
          </Form.Item>
          <Form.Item name="name" label="Tên lệnh" rules={[{ required: true, whitespace: true, message: 'Nhập tên lệnh sản xuất.' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Form.Item name="qty" label="Số lượng SP" rules={[{ required: true, type: 'number', min: 0.0001, message: 'Số lượng SP phải lớn hơn 0.' }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="kg" label="Khối lượng (kg)" rules={[
              { required: true, type: 'number', min: 0.0001, message: 'Khối lượng (kg) phải lớn hơn 0.' },
              { validator: (_, v) => (v > rem ? Promise.reject(new Error(`Khối lượng phát lệnh ${fmtNum(v)} kg VƯỢT phần còn lại của hợp đồng (${fmtNum(rem)} kg chưa phát lệnh).`)) : Promise.resolve()) },
            ]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="leadDays" label="Tiến độ (ngày)">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------------- hook */
type State = { kind: 'reject' | 'progress' | 'extend'; x: Lsx } | { kind: 'create' } | null

/** Trả về các hàm mở thao tác + `node` (render vào cây component). */
export function useLsxActions(opts?: { onCreated?: (id: ID) => void }) {
  const { modal } = App.useApp()
  const { data: meta } = useMeta()
  const accept = useLsxAccept()
  const [state, setState] = useState<State>(null)
  const close = () => setState(null)

  const doAccept = (x: Lsx) => modal.confirm({
    title: `Xưởng nhận lệnh ${x.id}`,
    content: (
      <div>
        <p>Xác nhận xưởng ({meta?.people?.sx?.name ?? 'Xưởng SX'}) nhận lệnh <b>{x.name}</b>?</p>
        <p className="caption">
          Kế hoạch: <b>{fmtNum(x.qtyPlan)} SP · {fmtKg(x.kgPlan)}</b> — hạn hoàn thành {fmtD(effDeadline(x))} ({x.leadDays} ngày).
          Sau khi nhận, lệnh chuyển sang <b>Đang SX</b>.
        </p>
      </div>
    ),
    okText: 'Nhận lệnh', cancelText: 'Hủy',
    onOk: () => accept.mutateAsync(x.id).catch(() => undefined),
  })

  let node: ReactNode = null
  if (state?.kind === 'reject') node = <RejectModal x={state.x} onClose={close} />
  else if (state?.kind === 'progress') node = <ProgressModal x={state.x} onClose={close} />
  else if (state?.kind === 'extend') node = <ExtendModal x={state.x} onClose={close} />
  else if (state?.kind === 'create') node = <CreateModal onClose={close} onCreated={opts?.onCreated} />

  return {
    accept: doAccept,
    reject: (x: Lsx) => setState({ kind: 'reject', x }),
    progress: (x: Lsx) => setState({ kind: 'progress', x }),
    extend: (x: Lsx) => setState({ kind: 'extend', x }),
    create: () => setState({ kind: 'create' }),
    node,
  }
}
