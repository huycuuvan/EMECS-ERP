/* Đơn hàng khách (port pages/02-don-hang.html): KPI, danh sách + tìm kiếm/lọc, Đơn hàng mới, Chuyển kế toán làm HĐ. */
import { Button, Input, Select, Table, type TableColumnsType } from 'antd'
import { FileSignature, Info, Paperclip, Plus, Search, Send } from 'lucide-react'
import { docName } from '@/components/DocAttach'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrdersByTag } from '@/api/hooksMaster'
import type { Order, OrderStatus } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtNum, fmtT, moneyShort, relTime } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import OrderFormModal from './orders/OrderFormModal'
import CustomerTags from './orders/CustomerTags'
import { TagFilter } from './customers/tags'
import { useAskSendKT } from './orders/useAskSendKT'
import '@/peek/drawers/contract/contract.css'

const STATUSES: OrderStatus[] = ['Chốt đơn', 'Đã chuyển kế toán', 'Đã có hợp đồng']

export default function Orders() {
  const [tag, setTag] = useState<string>()
  const { data: orders = [], isLoading } = useOrdersByTag(tag)
  const { open } = usePeek()
  const { can } = useAuth()
  const navigate = useNavigate()
  const askSend = useAskSendKT()
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [fs, setFs] = useState<string>(() => (STATUSES as string[]).includes(params.get('status') ?? '') ? params.get('status')! : '')
  const [creating, setCreating] = useState(false)
  const canEdit = can('don-hang', 'edit')

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return orders.filter((o) => {
      const itn = o.items.map((i) => i.name).join(' ')
      if (s && !(o.id + o.customer + o.code + itn).toLowerCase().includes(s)) return false
      if (fs && o.status !== fs) return false
      return true
    })
  }, [orders, q, fs])

  const pending = orders.filter((o) => o.status === 'Chốt đơn')
  const totalVal = orders.reduce((s, o) => s + (o.value || 0), 0)
  const totalKg = orders.reduce((s, o) => s + (o.totalKg || 0), 0)

  const columns: TableColumnsType<Order> = [
    {
      title: 'Mã đơn', key: 'id', width: 130,
      render: (_, o) => <><div className="mono" style={{ fontWeight: 700 }}>{o.id}</div><div className="sub-soft">{o.code}</div></>,
    },
    { title: 'Khách hàng', key: 'customer', render: (_, o) => <>{o.customer}<CustomerTags name={o.customer} customerId={o.customerId} /></> },
    {
      title: 'Ngày chốt', key: 'date', width: 120, sorter: (a, b) => a.date.localeCompare(b.date),
      render: (_, o) => <span className="num">{fmtD(o.date)}<div className="sub-soft">{relTime(o.date)}</div></span>,
    },
    {
      title: 'File ký chốt', key: 'file',
      render: (_, o) => o.file?.startsWith('/uploads/') ? (
        <a className="file-link" href={o.file} target="_blank" rel="noreferrer" title={docName(o.file)} onClick={(e) => e.stopPropagation()}>
          <Paperclip size={11} style={{ flex: 'none' }} /><span>{docName(o.file)}</span>
        </a>
      ) : <span className="text-ash" title={o.file ? `${o.file} — chưa tải bản thật lên` : undefined}>{o.file ? 'Chưa có file' : '—'}</span>,
    },
    {
      title: 'Hàng hóa', key: 'items',
      render: (_, o) => {
        const it = o.items[0]
        if (!it) return <span className="text-ash">—</span>
        return (
          <>
            <div style={{ fontWeight: 550 }}>{it.name}</div>
            <div className="sub-soft num">{fmtNum(it.qty)} {it.unit} · {fmtNum(it.kg)} kg · {fmtNum(it.price)}₫/kg</div>
            {o.items.length > 1 && <div className="sub-soft">+ {o.items.length - 1} hạng mục khác</div>}
          </>
        )
      },
    },
    {
      title: 'Giá trị', key: 'value', align: 'right', sorter: (a, b) => a.value - b.value,
      render: (_, o) => <span className="num"><b>{moneyShort(o.value)}</b><div className="sub-soft">{fmtT(o.totalKg)}</div></span>,
    },
    { title: 'Trạng thái', key: 'status', render: (_, o) => <StatusTag status={o.status} /> },
    {
      title: 'Hợp đồng', key: 'contract',
      render: (_, o) => o.contractId ? <RecordLink id={o.contractId} type="hd" style={{ color: 'var(--rust)' }} /> : <span style={{ fontSize: 11.5, color: 'var(--ash-3)' }}>Chưa có</span>,
    },
    {
      title: '', key: 'act', width: 150,
      render: (_, o) => canEdit && o.status === 'Chốt đơn' ? (
        <Button size="small" type="primary" icon={<Send size={12} />} onClick={(e) => { e.stopPropagation(); askSend(o) }}>Chuyển kế toán</Button>
      ) : null,
    },
  ]

  return (
    <>
      <PageHeader title="Đơn hàng khách"
        desc="Khách ký chốt đơn kèm file — Quản lý chuyển kế toán làm hợp đồng (nhập hạn trả HĐ + hạn giao hàng), giá theo giá thị trường ngày chốt"
        extra={<>
          <ExportButton kind="orders" params={{ status: fs }} ids={rows.map((o) => o.id)} total={orders.length} />
          <Button icon={<FileSignature size={14} />} onClick={() => navigate('/hop-dong')}>Sổ hợp đồng</Button>
          {canEdit && <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Đơn hàng mới</Button>}
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Tổng đơn tháng" value={orders.length} sub={`${orders.filter((o) => o.contractId).length} đơn đã có hợp đồng`} />
        <Kpi tone="signal" label="Chưa chuyển kế toán"
          value={<span className={pending.length ? 'text-signal' : ''}>{pending.length}</span>}
          onClick={pending.length ? () => setFs('Chốt đơn') : undefined}
          sub={pending.length
            ? <>{pending.map((o, i) => <span key={o.id}>{i > 0 && ', '}<RecordLink id={o.id} type="dh" danger /></span>)} chờ chuyển</>
            : 'mọi đơn chốt đã chuyển kế toán'} />
        <Kpi tone="amber" label="Tổng giá trị đơn" value={moneyShort(totalVal)} sub="giá chốt theo ngày ký từng đơn" />
        <Kpi tone="moss" label="Tổng khối lượng" value={fmtT(totalKg)} sub="thép gia công + mạ kẽm theo đơn" />
      </KpiGrid>

      <div className="list-card">
        <div className="filter-bar">
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã đơn, khách hàng, tên hàng..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <Select value={fs} onChange={setFs} style={{ minWidth: 200 }}
            options={[{ value: '', label: 'Tất cả trạng thái' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
          <TagFilter value={tag} onChange={setTag} />
        </div>
        <Table<Order> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={rows}
          scroll={{ x: 1100 }} pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName="clickable-row" onRow={(r) => ({ onClick: () => open('dh', r.id) })}
          locale={{ emptyText: 'Không có đơn hàng phù hợp bộ lọc.' }} />
      </div>

      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Bấm vào dòng để mở <b>hồ sơ đơn hàng</b> (trượt từ phải). Đơn mới chốt phải được chuyển kế toán —
          Quản lý nhập <b>hạn trả hợp đồng</b> (kế toán) và <b>hạn giao hàng</b> cho khách.</span>
      </p>

      {creating && <OrderFormModal onClose={() => setCreating(false)} />}
      {askSend.dialog}
    </>
  )
}
