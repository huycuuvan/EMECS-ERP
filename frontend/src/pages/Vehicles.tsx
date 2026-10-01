/* Danh mục → Xe (M06): biển số, tải trọng, xe nhà / xe thuê, tài xế mặc định. Số tấn theo từng xe: Báo cáo → tab "Theo xe". */
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Switch, Table, type TableColumnsType } from 'antd'
import { BarChart3, Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMeta } from '@/api/hooks'
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle, useVehicles, useVehicleTonnage } from '@/api/hooksMaster'
import type { Vehicle, VehicleInput } from '@/api/typesMaster'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtT } from '@/lib/format'
import '@/peek/drawers/contract/contract.css'

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

export function KindChip({ kind }: { kind: string | null }) {
  if (!kind) return <span className="text-ash">—</span>
  const own = kind === 'nhà'
  return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: own ? 'var(--steel-soft)' : 'var(--amber-soft)', color: own ? 'var(--steel)' : 'var(--amber)' }}>
    {own ? 'Xe nhà' : 'Xe thuê'}
  </span>
}

function VehicleModal({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const [form] = Form.useForm<VehicleInput>()
  const { data: meta } = useMeta()
  const create = useCreateVehicle()
  const update = useUpdateVehicle()
  const submit = async () => {
    const v = await form.validateFields()
    if (vehicle) await update.mutateAsync({ id: vehicle.id, ...v })
    else await create.mutateAsync(v)
    onClose()
  }
  return (
    <Modal open width={520} title={vehicle ? `Sửa xe ${vehicle.plate}` : 'Thêm xe'} okText="Lưu" cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false}
        initialValues={vehicle ?? { kind: 'nhà', active: true, capacityKg: 10000, defaultDriver: '' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Form.Item name="plate" label="Biển số" rules={[{ required: true, whitespace: true, min: 4, message: 'Chưa nhập biển số' }]}>
            <Input placeholder="VD: 29H-123.45" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="capacityKg" label="Tải trọng (kg)" rules={[{ required: true, message: 'Chưa nhập tải trọng' }]}>
            <InputNumber<number> min={0} step={500} style={{ width: '100%' }} suffix="kg" />
          </Form.Item>
        </div>
        <Form.Item name="kind" label="Loại xe">
          <Radio.Group options={[{ value: 'nhà', label: 'Xe nhà (công ty)' }, { value: 'thuê', label: 'Xe thuê ngoài' }]} />
        </Form.Item>
        <Form.Item name="defaultDriver" label="Tài xế mặc định" extra="Tự chọn xe này khi giao thẻ cho tài xế.">
          <Select allowClear placeholder="— Không cố định —" options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input /></Form.Item>
        <Form.Item name="active" label="Trạng thái" valuePropName="checked">
          <Switch checkedChildren="Đang sử dụng" unCheckedChildren="Ngừng sử dụng" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function Vehicles() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const { can } = useAuth()
  const navigate = useNavigate()
  const canEdit = can('xe', 'full')
  const canReport = can('bao-cao')
  const period = useMemo(() => ({ from: daysAgo(30) }), [])
  const { data: tonnage = [] } = useVehicleTonnage(period, canReport)
  const remove = useDeleteVehicle()
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null)
  const trips = Object.fromEntries(tonnage.map((r) => [r.plate ?? '', r]))

  const columns: TableColumnsType<Vehicle> = [
    { title: 'Biển số', key: 'plate', render: (_, v) => <span className="mono" style={{ fontWeight: 700 }}>{v.plate}</span> },
    { title: 'Tải trọng', key: 'cap', align: 'right', sorter: (a, b) => a.capacityKg - b.capacityKg, render: (_, v) => <span className="num">{fmtT(v.capacityKg)}</span> },
    { title: 'Loại', key: 'kind', render: (_, v) => <KindChip kind={v.kind} /> },
    { title: 'Tài xế mặc định', key: 'drv', render: (_, v) => v.defaultDriver || <span className="text-ash">—</span> },
    ...(canReport ? [{
      title: 'Chuyến 30 ngày', key: 'trips', align: 'right' as const,
      render: (_: unknown, v: Vehicle) => {
        const r = trips[v.plate]
        if (!r?.tripCount) return <span className="text-ash">0</span>
        return <span className="num"><b>{r.tripCount} chuyến</b><div className="sub-soft">gần nhất {fmtD(r.lastTrip)}</div></span>
      },
    }] : []),
    { title: 'Ghi chú', key: 'note', render: (_, v) => <span className="caption">{v.note}</span> },
    { title: 'Trạng thái', key: 'st', render: (_, v) => <StatusTag status={v.active ? 'Đang sử dụng' : 'Ngừng sử dụng'} /> },
    ...(canEdit ? [{
      title: '', key: 'act', width: 92,
      render: (_: unknown, v: Vehicle) => (
        <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<Pencil size={13} />} onClick={() => setEditing(v)} aria-label="Sửa" />
          <Popconfirm title={`Xóa xe ${v.plate}?`} description="Xe đã chạy chuyến không xóa được — chuyển Ngừng sử dụng."
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => remove.mutateAsync(v.id)}>
            <Button size="small" danger icon={<Trash2 size={13} />} aria-label="Xóa" />
          </Popconfirm>
        </span>
      ),
    }] : []),
  ]

  const active = vehicles.filter((v) => v.active)
  return (
    <>
      <PageHeader title="Danh mục xe" desc="Biển số, tải trọng, xe nhà / xe thuê — gán xe khi giao thẻ công việc để giám sát số tấn theo từng xe"
        extra={<>
          {canReport && <Button icon={<BarChart3 size={14} />} onClick={() => navigate('/bao-cao?tab=xe')}>Số tấn theo xe</Button>}
          {canEdit && <Button type="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Thêm xe</Button>}
        </>} />
      <KpiGrid>
        <Kpi tone="steel" label="Xe đang sử dụng" value={active.length} sub={`${vehicles.length} xe trong danh mục`} />
        <Kpi tone="moss" label="Tổng tải trọng" value={fmtT(active.reduce((s, v) => s + v.capacityKg, 0))} sub="một lượt chạy toàn đội xe" />
        <Kpi tone="amber" label="Xe nhà / xe thuê" value={`${active.filter((v) => v.kind === 'nhà').length} / ${active.filter((v) => v.kind === 'thuê').length}`} sub="xe đang sử dụng" />
        {canReport && <Kpi tone="rust" label="Chuyến 30 ngày" value={tonnage.reduce((s, r) => s + r.tripCount, 0)}
          sub={tonnage.find((r) => r.plate == null)?.tripCount ? `${tonnage.find((r) => r.plate == null)!.tripCount} chuyến chưa gán xe` : 'mọi chuyến đã gán xe'}
          onClick={() => navigate('/bao-cao?tab=xe')} />}
      </KpiGrid>
      <div className="list-card">
        <Table<Vehicle> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={vehicles} pagination={false} scroll={{ x: 880 }}
          rowClassName={canEdit ? 'clickable-row' : undefined} onRow={(v) => ({ onClick: canEdit ? () => setEditing(v) : undefined })}
          locale={{ emptyText: 'Chưa có xe trong danh mục.' }} />
      </div>
      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Đổi biển số → các thẻ công việc đã gán xe đổi theo. Tải trọng dùng để so sánh với số kg từng chuyến.</span>
      </p>
      {editing && <VehicleModal vehicle={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
