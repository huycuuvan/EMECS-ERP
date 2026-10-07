/* Quản lý giao việc cho lái xe: loại việc, tài xế, xe, NGÀY GIỜ PHẢI CÓ MẶT, hợp đồng, chứng từ gốc (PC/VC), ghi chú.
   Đi mạ: KG lấy theo phiếu cân xuất. Giao khách: Quản lý nhập KG lấy chuyến này (mặc định phần của HĐ còn tại mạ, tối đa tải xe)
   → lái xe được điền sẵn số ký với mạ. Giao khách: chọn khách hàng → tự điền địa chỉ, người nhận, người liên hệ (sửa được). */
import { DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useRef } from 'react'
import { useContract, useContracts, useCreateTask, useMeta } from '@/api/hooks'
import { useCustomers, useGalvanizers, useVehicles } from '@/api/hooksMaster'
import type { TaskType } from '@/api/types'
import { fmtKg, fmtT } from '@/lib/format'
import { MODAL_Z } from './TaskActions'

interface V {
  type: TaskType; driver: string; contractId: string; refId?: string | null; note?: string; kgRequired?: number | null
  vehiclePlate?: string | null; galvanizerId?: number | null; arriveAt?: Dayjs; fillDeadline?: Dayjs
  deliverCustomerId?: number | null; deliverName?: string; deliverAddress?: string
  receiverName?: string; receiverPhone?: string; contactName?: string; contactPhone?: string
}

export default function CreateTaskModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<V> }) {
  const [form] = Form.useForm<V>()
  const { data: meta } = useMeta()
  const { data: contracts } = useContracts()
  const create = useCreateTask()
  const { data: vehicles = [] } = useVehicles(open)
  const { data: galvs = [] } = useGalvanizers(open)
  const type = Form.useWatch('type', form)
  const cid = Form.useWatch('contractId', form)
  const plate = Form.useWatch('vehiclePlate', form)
  const refId = Form.useWatch('refId', form)
  const { data: customers = [] } = useCustomers(undefined, open)
  const activeVehicles = vehicles.filter((v) => v.active)
  const vehicle = vehicles.find((v) => v.plate === plate)
  const plateOf = (driver?: string) => activeVehicles.find((v) => v.defaultDriver && v.defaultDriver === driver)?.plate
  const { data: agg } = useContract(open ? cid : null)

  const cs = (contracts ?? []).filter((c) => c.status !== 'Đã hoàn thành')  // độc lập với bước ký HĐ (đi theo lệnh SX)

  useEffect(() => {
    if (open) {
      form.resetFields()
      const driver = initial?.driver ?? meta?.drivers[0]
      form.setFieldsValue({ type: 'di_ma', driver, contractId: cs[0]?.id, vehiclePlate: plateOf(driver),
        galvanizerId: galvs.find((g) => g.active)?.id, arriveAt: dayjs().add(1, 'hour').minute(0).second(0),
        fillDeadline: dayjs().add(25, 'hour').minute(0).second(0), ...initial })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // danh mục xe / xưởng mạ tải xong sau khi mở → điền mặc định (xe của tài xế, xưởng mạ đầu tiên)
  useEffect(() => {
    if (!open) return
    if (!form.getFieldValue('vehiclePlate')) {
      const p = plateOf(form.getFieldValue('driver'))
      if (p) form.setFieldValue('vehiclePlate', p)
    }
    const g = galvs.find((x) => x.active)
    if (form.getFieldValue('galvanizerId') == null && g) form.setFieldValue('galvanizerId', g.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicles.length, galvs.length])

  // Chứng từ gốc: đi mạ → phiếu cân xuất (PC đã cân, chưa có thẻ đi mạ nào dùng); giao khách → thẻ gửi mạ (VC mạ đã cân nhận)
  const usedPc = new Set((agg?.tasksDiMa ?? []).map((t) => t.refId).filter(Boolean))
  const refOptions = !agg ? [] : type === 'di_ma'
    ? agg.weighings.filter((p) => p.kgActual != null && !usedPc.has(p.id))
      .map((p) => ({ value: p.id, label: `${p.id} · phiếu cân xuất ${fmtKg(p.kgActual)}`, kg: p.kgActual ?? p.kgExpected }))
    : agg.tasksDiMa.filter((t) => t.kgAtGalv != null)
      .map((t) => ({ value: t.id, label: `${t.id} · thẻ gửi mạ — mạ nhận ${fmtKg(t.kgAtGalv)}`, kg: t.kgAtGalv ?? t.kgRequired }))

  // giao khách: mặc định khách của hợp đồng → điền thông tin nơi giao
  const fillCustomer = (id?: number | null) => {
    const cu = customers.find((x) => x.id === id)
    form.setFieldsValue({
      deliverCustomerId: cu?.id ?? null, deliverName: cu?.name ?? '', deliverAddress: cu?.address ?? '',
      receiverName: cu?.contactName ?? '', receiverPhone: cu?.phone ?? '', contactName: cu?.contactName || cu?.representative || '', contactPhone: cu?.phone ?? '',
    })
  }
  useEffect(() => {
    if (!open) return
    form.setFieldValue('refId', undefined)
    if (type === 'giao_khach') {
      const c = cs.find((x) => x.id === cid)
      fillCustomer(c?.customerId ?? customers.find((x) => x.name === c?.customer)?.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, cid, customers.length])
  const kgRef = refOptions.find((o) => o.value === refId)?.kg
  const noStock = type === 'giao_khach' && !!agg && agg.atGalvKg <= 0.5
  // giao khách: mặc định lấy hết phần của HĐ còn tại mạ, tối đa tải trọng xe
  const galvLeft = agg?.atGalvKg ?? 0
  const kgEdited = useRef(false)  // Quản lý đã tự sửa số → không ghi đè khi đổi xe / hợp đồng
  useEffect(() => { if (open) kgEdited.current = false }, [open])
  const kgDefault = Math.max(0, Math.min(galvLeft, vehicle?.capacityKg || 10000))
  useEffect(() => {
    if (open && type === 'giao_khach' && agg && agg.contract.id === cid && !kgEdited.current)
      form.setFieldValue('kgRequired', kgDefault > 0 ? kgDefault : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, cid, agg?.contract.id, agg?.atGalvKg, vehicle?.capacityKg])
  const kgGiao = Form.useWatch('kgRequired', form) as number | undefined

  const submit = async () => {
    const v = await form.validateFields()
    if (noStock) return
    await create.mutateAsync({
      ...v, refId: v.type === 'giao_khach' ? null : v.refId || null, kgRequired: v.type === 'giao_khach' ? v.kgRequired ?? null : null, galvanizerId: v.type === 'di_ma' ? v.galvanizerId ?? null : null,
      arriveAt: v.arriveAt!.format(), fillDeadline: v.fillDeadline?.format(),
    })
    onClose()
  }

  return (
    <Modal open={open} zIndex={MODAL_Z} title="Giao việc cho lái xe" okText="Giao việc" cancelText="Hủy" width={620}
      confirmLoading={create.isPending} onCancel={onClose} onOk={submit} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="type" label="Loại việc">
          <Radio.Group options={[
            { value: 'di_ma', label: 'Đi mạ (công ty → xưởng mạ)' },
            { value: 'giao_khach', label: 'Giao khách (mạ → khách)' },
          ]} />
        </Form.Item>
        <Form.Item name="driver" label="Tài xế" rules={[{ required: true, message: 'Chưa chọn tài xế' }]}>
          <Select options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))}
            onChange={(d: string) => { const p = plateOf(d); if (p) form.setFieldValue('vehiclePlate', p) }} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: type === 'di_ma' ? '1fr 1fr' : '1fr', gap: '0 12px' }}>
          <Form.Item name="vehiclePlate" label="Xe" extra={vehicle && ((type === 'giao_khach' ? kgGiao : kgRef) ?? 0) > vehicle.capacityKg
            ? <span className="text-signal">Hàng theo chứng từ vượt tải trọng xe ({fmtT(vehicle.capacityKg)})</span> : undefined}>
            <Select allowClear placeholder="— Chưa gán xe —" showSearch={{ optionFilterProp: 'label' }}
              options={activeVehicles.map((v) => ({ value: v.plate, label: `${v.plate} · ${fmtT(v.capacityKg)} · xe ${v.kind}` }))} />
          </Form.Item>
          {type === 'di_ma' && (
            <Form.Item name="galvanizerId" label="Xưởng mạ">
              <Select allowClear placeholder="— Chọn xưởng mạ —" options={galvs.filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }))} />
            </Form.Item>
          )}
        </div>
        <Form.Item name="arriveAt" label={type === 'di_ma' ? 'Ngày giờ lái xe phải có mặt (lấy hàng tại công ty)' : 'Ngày giờ lái xe phải có mặt (lấy hàng tại xưởng mạ)'}
          rules={[{ required: true, message: 'Chọn ngày giờ lái xe phải có mặt' }]}>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="HH:mm — DD/MM/YYYY" style={{ width: '100%' }}
            onChange={(d) => { if (d && !form.isFieldTouched('fillDeadline')) form.setFieldValue('fillDeadline', d.add(24, 'hour')) }} />
        </Form.Item>
        <Form.Item name="fillDeadline" label="Hạn trả phiếu (lái xe điền số cân + ảnh phiếu trước)"
          extra="Mặc định 24 giờ sau giờ có mặt. Quá hạn mà chưa trả phiếu → báo đỏ trên dashboard và thẻ lái xe."
          dependencies={['arriveAt']}
          rules={[{ required: true, message: 'Chọn hạn trả phiếu' }, ({ getFieldValue }) => ({
            validator: (_, v?: Dayjs) => (v && getFieldValue('arriveAt') && !v.isAfter(getFieldValue('arriveAt'))
              ? Promise.reject(new Error('Hạn trả phiếu phải sau giờ có mặt')) : Promise.resolve()),
          })]}>
          <DatePicker showTime={{ format: 'HH:mm', minuteStep: 15 }} format="HH:mm — DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="contractId" label={type === 'giao_khach' ? 'Hợp đồng (hàng của khách nào)' : 'Hợp đồng'}
          rules={[{ required: true, message: 'Chưa chọn hợp đồng' }]}
          validateStatus={noStock ? 'error' : undefined}
          help={noStock ? `HĐ ${cid} không còn hàng tại xưởng mạ — không giao việc lấy hàng được` : undefined}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={cs.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer}` }))} />
        </Form.Item>
        {type === 'giao_khach' ? (
          <Form.Item name="kgRequired" label="KG lấy chuyến này (lái xe ký nhận với xưởng mạ)"
            extra={agg ? <>Hàng của HĐ còn tại xưởng mạ <b style={{ color: 'var(--rust-deep)' }}>{fmtKg(galvLeft)}</b>. Lái xe được điền sẵn số này, chỉ sửa khi mạ ký số khác.</> : undefined}
            rules={[{ required: true, message: 'Nhập KG lấy chuyến này' },
              { validator: (_, v?: number) => (v != null && agg && v > galvLeft + (meta?.toleranceKg ?? 30) ? Promise.reject(new Error(`Vượt hàng của HĐ còn tại mạ (${fmtKg(galvLeft)})`)) : Promise.resolve()) }]}>
            <InputNumber min={1} step={100} style={{ width: '100%' }} suffix="kg" onChange={() => { kgEdited.current = true }} />
          </Form.Item>
        ) : (
          <>
            <Form.Item name="refId" label="Chứng từ gốc — phiếu cân xuất (PC)"
              extra={refOptions.length === 0 && agg ? 'Không còn phiếu cân xuất nào chưa gán chuyến.' : undefined}>
              <Select allowClear placeholder="— Không gắn chứng từ —" options={refOptions.map(({ value, label }) => ({ value, label }))} />
            </Form.Item>
            <p className="caption" style={{ margin: '-8px 0 12px' }}>
              KG không cần nhập — {kgRef != null ? <>theo chứng từ: <b>{fmtKg(kgRef)}</b></> : 'lấy theo chứng từ gốc khi gắn'}.
            </p>
          </>
        )}
        {type === 'giao_khach' && (
          <div style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '10px 12px 0', marginBottom: 12, background: 'var(--paper)' }}>
            <Form.Item name="deliverCustomerId" label="Giao cho khách hàng (theo hợp đồng)"
              extra="Hàng tại mạ của khách nào chỉ giao cho khách đó — đổi khách thì chọn hợp đồng khác. Địa chỉ, người nhận sửa được cho riêng chuyến này.">
              <Select disabled placeholder="Theo khách của hợp đồng" options={customers.map((x) => ({ value: x.id, label: x.name }))} />
            </Form.Item>
            <Form.Item name="deliverName" label="Tên khách / đơn vị nhận"><Input /></Form.Item>
            <Form.Item name="deliverAddress" label="Địa chỉ giao hàng" rules={[{ required: true, whitespace: true, message: 'Nhập địa chỉ giao hàng' }]}>
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} placeholder="VD: Công trường KCN Yên Phong, Bắc Ninh" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 12px' }}>
              <Form.Item name="receiverName" label="Người nhận hàng"><Input /></Form.Item>
              <Form.Item name="receiverPhone" label="SĐT người nhận"><Input /></Form.Item>
              <Form.Item name="contactName" label="Người liên hệ"><Input /></Form.Item>
              <Form.Item name="contactPhone" label="SĐT liên hệ"><Input /></Form.Item>
            </div>
          </div>
        )}
        <Form.Item name="note" label="Ghi chú">
          <Input placeholder="VD: lấy tại cổng 2 xưởng mạ Việt Đức..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}
