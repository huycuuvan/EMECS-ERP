/* Danh mục → Xưởng mạ: tên, địa chỉ, SĐT; thống kê chuyến gửi mạ + kg mạ cân nhận theo từng xưởng. */
import { Button, Form, Input, Modal, Popconfirm, Switch, Table, type TableColumnsType } from 'antd'
import { Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTasks } from '@/api/hooks'
import { useCreateGalvanizer, useDeleteGalvanizer, useGalvanizers, useUpdateGalvanizer } from '@/api/hooksMaster'
import type { Galvanizer, GalvanizerInput } from '@/api/typesMaster'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtKg } from '@/lib/format'
import '@/peek/drawers/contract/contract.css'

function GalvanizerModal({ galv, onClose }: { galv?: Galvanizer; onClose: () => void }) {
  const [form] = Form.useForm<GalvanizerInput>()
  const create = useCreateGalvanizer()
  const update = useUpdateGalvanizer()
  const submit = async () => {
    const v = await form.validateFields()
    if (galv) await update.mutateAsync({ id: galv.id, ...v })
    else await create.mutateAsync(v)
    onClose()
  }
  return (
    <Modal open width={520} title={galv ? `Sửa xưởng mạ — ${galv.name}` : 'Thêm xưởng mạ'} okText="Lưu" cancelText="Hủy" onOk={submit} onCancel={onClose}
      confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={galv ?? { active: true }}>
        <Form.Item name="name" label="Tên xưởng mạ" rules={[{ required: true, whitespace: true, message: 'Chưa nhập tên xưởng mạ' }]}>
          <Input placeholder="VD: Mạ kẽm Việt Đức" />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
        <Form.Item name="phone" label="Số điện thoại"><Input /></Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="active" label="Trạng thái" valuePropName="checked">
          <Switch checkedChildren="Đang hợp tác" unCheckedChildren="Ngừng hợp tác" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default function Galvanizers() {
  const { data: galvs = [], isLoading } = useGalvanizers()
  const { data: tasks = [] } = useTasks({ type: 'di_ma' })
  const { can } = useAuth()
  const canEdit = can('xuong-ma', 'full')
  const remove = useDeleteGalvanizer()
  const [editing, setEditing] = useState<Galvanizer | 'new' | null>(null)

  const stats = useMemo(() => {
    const m = new Map<number, { trips: number; kg: number }>()
    for (const t of tasks) {
      if (t.galvanizerId == null || t.status === 'Từ chối') continue
      const s = m.get(t.galvanizerId) ?? { trips: 0, kg: 0 }
      s.trips++
      s.kg += t.kgAtGalv ?? 0
      m.set(t.galvanizerId, s)
    }
    return m
  }, [tasks])

  const columns: TableColumnsType<Galvanizer> = [
    { title: 'Xưởng mạ', key: 'name', render: (_, g) => <><div style={{ fontWeight: 600 }}>{g.name}</div>{g.note && <div className="sub-soft">{g.note}</div>}</> },
    { title: 'Địa chỉ', key: 'addr', render: (_, g) => g.address || <span className="text-ash">—</span> },
    { title: 'SĐT', key: 'phone', render: (_, g) => g.phone ? <span className="num">{g.phone}</span> : <span className="text-ash">—</span> },
    { title: 'Chuyến gửi mạ', key: 'trips', align: 'right', render: (_, g) => <span className="num">{stats.get(g.id)?.trips ?? 0}</span> },
    { title: 'Mạ cân nhận', key: 'kg', align: 'right', render: (_, g) => <span className="num">{fmtKg(stats.get(g.id)?.kg ?? 0)}</span> },
    { title: 'Trạng thái', key: 'st', render: (_, g) => <StatusTag status={g.active ? 'Đang hợp tác' : 'Ngừng hợp tác'} /> },
    ...(canEdit ? [{
      title: '', key: 'act', width: 92,
      render: (_: unknown, g: Galvanizer) => (
        <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<Pencil size={13} />} onClick={() => setEditing(g)} aria-label="Sửa" />
          <Popconfirm title={`Xóa ${g.name}?`} description="Xưởng đã có chuyến gửi mạ không xóa được — chuyển Ngừng hợp tác."
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => remove.mutateAsync(g.id)}>
            <Button size="small" danger icon={<Trash2 size={13} />} aria-label="Xóa" />
          </Popconfirm>
        </span>
      ),
    }] : []),
  ]

  const noGalv = tasks.filter((t) => t.galvanizerId == null && t.status !== 'Từ chối').length
  return (
    <>
      <PageHeader title="Danh mục xưởng mạ" desc="Đối tác mạ kẽm nhúng nóng — chọn xưởng khi giao thẻ đi mạ"
        extra={canEdit && <Button type="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Thêm xưởng mạ</Button>} />
      <KpiGrid>
        <Kpi tone="steel" label="Xưởng đang hợp tác" value={galvs.filter((g) => g.active).length} sub={`${galvs.length} xưởng trong danh mục`} />
        <Kpi tone="rust" label="Chuyến gửi mạ" value={[...stats.values()].reduce((s, x) => s + x.trips, 0)} sub={noGalv ? `${noGalv} chuyến chưa ghi xưởng mạ` : 'mọi chuyến đã ghi xưởng mạ'} />
        <Kpi tone="moss" label="Mạ cân nhận" value={fmtKg([...stats.values()].reduce((s, x) => s + x.kg, 0))} sub="tổng kg bên mạ xác nhận" />
      </KpiGrid>
      <div className="list-card">
        <Table<Galvanizer> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={galvs} pagination={false} scroll={{ x: 820 }}
          rowClassName={canEdit ? 'clickable-row' : undefined} onRow={(g) => ({ onClick: canEdit ? () => setEditing(g) : undefined })}
          locale={{ emptyText: 'Chưa có xưởng mạ trong danh mục.' }} />
      </div>
      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Đối ứng chi tiết từng chuyến gửi / nhận mạ: menu <b>Đối ứng gửi/nhận mạ</b>.</span>
      </p>
      {editing && <GalvanizerModal galv={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
