/* Danh mục → Khách hàng & nhãn (M01/M06): danh sách khách, nhãn màu do người dùng tạo và gắn (Khách thân thiết /
   Khách lẻ…), thêm / sửa khách, quản lý nhãn. Nhãn dùng để lọc Đơn hàng, Hợp đồng, Dashboard. */
import { App, Button, Input, Popconfirm, Select, Table, type TableColumnsType } from 'antd'
import { Info, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCustomers, useDeleteCustomer, useDetachTag, useTags } from '@/api/hooksMaster'
import type { Customer } from '@/api/typesMaster'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, moneyShort } from '@/lib/format'
import CustomerFormModal from './customers/CustomerFormModal'
import TagManagerModal from './customers/TagManagerModal'
import { TagChip, TagFilter } from './customers/tags'

const LOYAL = 'Khách thân thiết'
const RETAIL = 'Khách lẻ'

export default function Customers() {
  const { data: customers = [], isLoading } = useCustomers()
  const { data: tags = [] } = useTags()
  const { can } = useAuth()
  const { modal } = App.useApp()
  const detach = useDetachTag()
  const remove = useDeleteCustomer()
  const canEdit = can('khach-hang', 'full') && can('don-hang', 'full')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<number>()
  const [st, setSt] = useState<'' | 'on' | 'off'>('')
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)
  const [managing, setManaging] = useState(false)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return customers.filter((c) => {
      if (s && !(c.name + ' ' + c.shortCode + ' ' + c.contactName + ' ' + c.phone + ' ' + c.taxCode).toLowerCase().includes(s)) return false
      if (tag && !c.tags.some((t) => t.id === tag)) return false
      if (st === 'on' && !c.active) return false
      if (st === 'off' && c.active) return false
      return true
    })
  }, [customers, q, tag, st])

  const tagByName = (n: string) => tags.find((t) => t.name === n)
  const count = (n: string) => customers.filter((c) => c.tags.some((t) => t.name === n)).length
  const untagged = customers.filter((c) => !c.tags.length).length
  const kpiTag = (n: string) => { const t = tagByName(n); return t ? () => setTag(tag === t.id ? undefined : t.id) : undefined }

  const askDetach = (c: Customer, tagId: number, tagName: string) => modal.confirm({
    title: `Gỡ nhãn "${tagName}"?`, content: c.name, okText: 'Gỡ nhãn', cancelText: 'Hủy',
    onOk: () => detach.mutateAsync({ id: c.id, tagId }),
  })

  const columns: TableColumnsType<Customer> = [
    {
      title: 'Khách hàng', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, c) => (
        <>
          <div style={{ fontWeight: 600 }}>{c.name}</div>
          {c.shortCode && <div className="sub-soft mono">{c.shortCode}</div>}
          {c.tags.length > 0 && (
            <div className="cust-tags">
              {c.tags.map((t) => <TagChip key={t.id} tag={t} onClose={canEdit ? () => askDetach(c, t.id, t.name) : undefined} />)}
            </div>
          )}
        </>
      ),
    },
    {
      title: 'Liên hệ', key: 'contact',
      render: (_, c) => c.contactName || c.phone
        ? <>{c.contactName || '—'}<div className="sub-soft num">{c.phone}</div></>
        : <span className="text-ash">—</span>,
    },
    {
      title: 'MST · Địa chỉ', key: 'addr',
      render: (_, c) => c.taxCode || c.address
        ? <><span className="mono">{c.taxCode || '—'}</span><div className="sub-soft">{c.address}</div></>
        : <span className="text-ash">—</span>,
    },
    {
      title: 'Đơn hàng', key: 'orders', align: 'right', sorter: (a, b) => (a.orderValue ?? 0) - (b.orderValue ?? 0),
      render: (_, c) => c.orderCount
        ? <span className="num"><b>{c.orderCount} đơn</b> · {moneyShort(c.orderValue)}<div className="sub-soft">gần nhất {fmtD(c.lastOrderAt)}</div></span>
        : <span className="text-ash">Chưa có đơn</span>,
    },
    { title: 'Trạng thái', key: 'active', render: (_, c) => <StatusTag status={c.active ? 'Đang giao dịch' : 'Ngừng giao dịch'} /> },
    ...(canEdit ? [{
      title: '', key: 'act', width: 92,
      render: (_: unknown, c: Customer) => (
        <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<Pencil size={13} />} onClick={() => setEditing(c)} aria-label="Sửa" />
          <Popconfirm title={`Xóa khách "${c.name}"?`} description={c.orderCount ? 'Khách đã có đơn hàng — chỉ có thể chuyển Ngừng giao dịch.' : undefined}
            okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true, disabled: !!c.orderCount }} onConfirm={() => remove.mutateAsync(c.id)}>
            <Button size="small" danger icon={<Trash2 size={13} />} aria-label="Xóa" />
          </Popconfirm>
        </span>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader title="Khách hàng & nhãn"
        desc="Danh mục khách hàng — gắn nhãn Khách thân thiết / Khách lẻ (nhãn do người dùng tự tạo) để lọc đơn hàng, hợp đồng, dashboard"
        extra={canEdit && <>
          <Button icon={<Tags size={14} />} onClick={() => setManaging(true)}>Quản lý nhãn</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Thêm khách hàng</Button>
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Khách hàng" value={customers.length} sub={`${customers.filter((c) => c.active).length} đang giao dịch`} onClick={() => { setTag(undefined); setSt('') }} />
        <Kpi tone="moss" label={LOYAL} value={count(LOYAL)} sub={tagByName(LOYAL) ? 'bấm để lọc' : 'chưa tạo nhãn này'} onClick={kpiTag(LOYAL)} />
        <Kpi tone="amber" label={RETAIL} value={count(RETAIL)} sub={tagByName(RETAIL) ? 'bấm để lọc' : 'chưa tạo nhãn này'} onClick={kpiTag(RETAIL)} />
        <Kpi tone="rust" label="Chưa gắn nhãn" value={untagged} sub={`${tags.length} nhãn đang dùng`} onClick={canEdit ? () => setManaging(true) : undefined} />
      </KpiGrid>

      <div className="list-card">
        <div className="filter-bar">
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm tên khách, mã, người liên hệ, SĐT, MST..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <TagFilter value={tag} onChange={setTag} />
          <Select value={st} onChange={setSt} style={{ minWidth: 170 }}
            options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'on', label: 'Đang giao dịch' }, { value: 'off', label: 'Ngừng giao dịch' }]} />
          <span className="caption" style={{ marginLeft: 'auto' }}>{rows.length} khách</span>
        </div>
        <Table<Customer> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={rows} scroll={{ x: 960 }}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName={canEdit ? 'clickable-row' : undefined} onRow={(r) => ({ onClick: canEdit ? () => setEditing(r) : undefined })}
          locale={{ emptyText: 'Không có khách hàng phù hợp bộ lọc.' }} />
      </div>

      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Khách mới gõ tên khi tạo đơn hàng sẽ tự vào danh mục. Đổi tên khách → tên trên đơn hàng & hợp đồng liên kết đổi theo.
          Khách đã có đơn không xóa được — chuyển <b>Ngừng giao dịch</b>.</span>
      </p>

      {editing && <CustomerFormModal customer={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {managing && <TagManagerModal onClose={() => setManaging(false)} />}
    </>
  )
}
