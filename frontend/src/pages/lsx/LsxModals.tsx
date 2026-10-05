/* Các thao tác trên Lệnh sản xuất (dùng chung trang danh sách + drawer):
   phát lệnh (QL, chỉ khối lượng) · xưởng nhận · xưởng từ chối có lý do · xưởng nhập sản lượng theo NGÀY · QL duyệt gia hạn. */
import { App, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useState, type ReactNode } from 'react'
import {
  useContracts, useCreateLsx, useLsxAccept, useLsxDaily, useLsxExtend, useLsxList, useLsxReject, useMeta,
} from '@/api/hooks'
import type { ID, Lsx } from '@/api/types'
import { daysLeft, fmtD, fmtDT, fmtKg, fmtNum } from '@/lib/format'
import { numFormatter, numParser } from '@/peek/drawers/contract/utils'
import { WarnBox } from './boxes'
import { effDeadline } from './lsxUtil'
import { NUM } from '@/lib/numberInput'

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

/* ---------------------------------------------------------------- sản lượng theo ngày (xưởng) */
function ProgressModal({ x, onClose }: { x: Lsx; onClose: () => void }) {
  const daily = useLsxDaily()
  const [form] = Form.useForm<{ day: Dayjs; kg: number | null; note?: string }>()
  const day = Form.useWatch('day', form) as Dayjs | undefined
  const kg = Form.useWatch('kg', form) as number | null | undefined
  const start = dayjs(x.acceptedAt ?? x.assignedAt).startOf('day')
  const existing = day ? x.daily.find((d) => d.day === day.format('YYYY-MM-DD')) : undefined
  const after = x.kgDone - (existing?.kg ?? 0) + (Number(kg) || 0)

  return (
    <Modal open title={`Nhập sản lượng ngày — ${x.id}`} okText="Ghi sản lượng" cancelText="Hủy" onCancel={onClose}
      confirmLoading={daily.isPending} onOk={() => form.submit()}>
      <p className="caption" style={{ marginTop: 8 }}>
        Kế hoạch <b>{fmtKg(x.kgPlan)}</b> · đã làm lũy kế <b>{fmtKg(x.kgDone)}</b>. Nhập số kg làm được <b>trong ngày</b> —
        hôm nào không làm thì nhập <b>0</b>. Hạn nhập trước <b>20h</b> mỗi ngày.
      </p>
      <Form form={form} layout="vertical" initialValues={{ day: dayjs(), kg: x.today ? x.today.kg : null }}
        onValuesChange={(ch) => { if (ch.day) { const e = x.daily.find((d) => d.day === (ch.day as Dayjs).format('YYYY-MM-DD')); form.setFieldValue('kg', e ? e.kg : null) } }}
        onFinish={async (v) => {
          await daily.mutateAsync({ id: x.id, day: v.day.format('YYYY-MM-DD'), kg: Number(v.kg) || 0, note: (v.note || '').trim() })
          onClose()
        }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Form.Item name="day" label="Ngày" rules={[{ required: true, message: 'Chọn ngày.' }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false}
              disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(start, 'day')} />
          </Form.Item>
          <Form.Item name="kg" label="Khối lượng làm được trong ngày (kg)" rules={[{ required: true, message: 'Nhập số kg (không làm thì 0).' }]}>
            <InputNumber<number> min={0} style={{ width: '100%' }} placeholder="0 nếu không làm" formatter={numFormatter} parser={numParser} />
          </Form.Item>
        </div>
        <Form.Item name="note" label="Ghi chú (tùy chọn)"><Input placeholder="VD: nghỉ chờ vật tư, máy chấn bảo trì..." /></Form.Item>
      </Form>
      {existing && (
        <WarnBox>Ngày {dayjs(existing.day).format('DD/MM')} đã nhập <b>{fmtKg(existing.kg)}</b> lúc {fmtDT(existing.updatedAt ?? existing.createdAt)}
          {' '}({existing.updatedBy ?? existing.createdBy}) — ghi lại sẽ <b>sửa</b> số này, Quản lý được báo kèm giờ sửa.</WarnBox>
      )}
      <p className="caption" style={{ margin: '8px 0 0' }}>
        Sau khi ghi: lũy kế <b>{fmtKg(after)}</b> / {fmtKg(x.kgPlan)}{after >= x.kgPlan && x.kgPlan > 0 ? ' — lệnh chuyển Hoàn thành.' : '.'}
      </p>
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
  // phát lệnh độc lập với bước hợp đồng (không cần chờ khách ký) — chỉ giới hạn theo khối lượng còn lại
  const signed = contracts
  /* kg đã phát lệnh của 1 HĐ (không tính lệnh bị từ chối — lệnh đó sẽ phát lại) */
  const remainOf = (cid: ID) => {
    const c = contracts.find((z) => z.id === cid)
    const committed = lsxs.filter((x) => x.contractId === cid && x.status !== 'Từ chối').reduce((s, x) => s + (Number(x.kgPlan) || 0), 0)
    return Math.max(0, (c?.totalKg || 0) - committed)
  }
  const [form] = Form.useForm<{ contractId: ID; name: string; kg: number; leadDays: number }>()
  const cid = Form.useWatch('contractId', form)
  const leadDays = Form.useWatch('leadDays', form) as number | undefined
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
        <p style={{ marginTop: 12 }}>Chưa có hợp đồng nào — Quản lý tạo đơn hàng và <b>Chuyển kế toán</b> trước, sau đó phát lệnh được ngay.</p>
      ) : (
        <Form form={form} layout="vertical" style={{ marginTop: 12 }} initialValues={{ leadDays: 7 }}
          onFinish={async (v) => {
            const x = await create.mutateAsync({ contractId: v.contractId, name: v.name.trim(), kg: v.kg, leadDays: v.leadDays || 7 })
            onCreated?.(x.id)
            onClose()
          }}>
          <Form.Item name="contractId" label="Hợp đồng" rules={[{ required: true, message: 'Chọn hợp đồng.' }]}
            extra={cid ? (rem > 0
              ? <span>Còn <b>{fmtNum(rem)} kg</b> của hợp đồng này chưa phát lệnh (không tính lệnh bị từ chối).</span>
              : <span className="text-signal" style={{ fontWeight: 600 }}>Hợp đồng đã phát lệnh đủ khối lượng — không còn phần để phát thêm.</span>) : undefined}>
            <Select placeholder="Chọn hợp đồng" onChange={sync}
              options={signed.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer} · ${c.status} · còn ${fmtNum(remainOf(c.id))} kg chưa phát lệnh` }))} />
          </Form.Item>
          <Form.Item name="name" label="Tên lệnh" rules={[{ required: true, whitespace: true, message: 'Nhập tên lệnh sản xuất.' }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Form.Item name="kg" label="Khối lượng (kg)" rules={[
              { required: true, type: 'number', min: 0.0001, message: 'Khối lượng (kg) phải lớn hơn 0.' },
              { validator: (_, v) => (v > rem ? Promise.reject(new Error(`Khối lượng phát lệnh ${fmtNum(v)} kg VƯỢT phần còn lại của hợp đồng (${fmtNum(rem)} kg chưa phát lệnh).`)) : Promise.resolve()) },
            ]}>
              <InputNumber {...NUM} min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="leadDays" label="Tiến độ (ngày)">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          {(() => {
            const c = contracts.find((z) => z.id === cid)
            if (!c?.completeBy) return null
            const end = dayjs().add(leadDays || 7, 'day')
            const by = dayjs(c.completeBy)
            return end.isAfter(by, 'day')
              ? <WarnBox>Hạn lệnh ({end.format('DD/MM')}) <b>vượt ngày hoàn thành đơn {by.format('DD/MM/YYYY')}</b> — rút ngắn tiến độ hoặc báo khách.</WarnBox>
              : <p className="caption" style={{ margin: 0 }}>Ngày hoàn thành đơn: <b>{by.format('DD/MM/YYYY')}</b> · hạn lệnh {end.format('DD/MM')}.</p>
          })()}
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
          Kế hoạch: <b>{fmtKg(x.kgPlan)}</b> — hạn hoàn thành {fmtD(effDeadline(x))} ({x.leadDays} ngày).
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
