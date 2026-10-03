/* Hợp đồng & Tạm ứng (port pages/03-hop-dong.html — trang tham chiếu của demo):
   KPI · danh sách (hạn trả HĐ, tạm ứng, lũy kế giao — tiền) · tìm kiếm + lọc trạng thái + lọc hạn ·
   thao tác dòng Đã trả HĐ / Đã ký / + Tiền về · Xuất Excel (.xlsx từ server, theo bộ lọc) · Đơn hàng chờ làm HĐ. */
import { Button, Input, Select, Table, Tag, type TableColumnsType } from 'antd'
import { AlertTriangle, CheckCircle2, Info, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTasks } from '@/api/hooks'
import { useContractsByTag } from '@/api/hooksMaster'
import type { Contract, ContractRow, ContractStatus } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { AdvChip, DueChip, Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtNum, fmtT, moneyShort } from '@/lib/format'
import { usePeek } from '@/peek/context'
import { PaymentModal } from '@/peek/drawers/contract/modals'
import { useContractFlow } from '@/peek/drawers/contract/useContractFlow'
import RecordLink from '@/peek/RecordLink'
import { aggregateRows } from './contracts/aggregate'
import MiniProg, { type ProgTone } from './contracts/MiniProg'
import CustomerTags from './orders/CustomerTags'
import { TagFilter } from './customers/tags'
import '@/peek/drawers/contract/contract.css'

const STATUSES: ContractStatus[] = ['Soạn thảo', 'Đã trả khách', 'Đã ký', 'Đang triển khai', 'Hoàn thành']
type Quick = '' | 'active' | 'adv' | 'debt'
const QUICK_LABEL: Record<Exclude<Quick, ''>, string> = {
  active: 'Đang triển khai / đã ký', adv: 'Đã ký — chưa về tạm ứng', debt: 'Khách còn nợ theo hàng đã giao',
}

export default function Contracts() {
  const [tag, setTag] = useState<string>()
  const { data: contracts = [], isLoading } = useContractsByTag(tag)
  const { data: giao = [] } = useTasks({ type: 'giao_khach' })
  const { open } = usePeek()
  const { can } = useAuth()
  const navigate = useNavigate()
  const flow = useContractFlow()
  const [q, setQ] = useState('')
  const [fs, setFs] = useState('')
  const [fd, setFd] = useState('')
  const [quick, setQuick] = useState<Quick>('')
  const [paying, setPaying] = useState<Contract | null>(null)
  const canEdit = can('hop-dong', 'edit')

  const agg = useMemo(() => aggregateRows(contracts, giao), [contracts, giao])

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return contracts.filter((c) => {
      if (s && !(c.id + c.customer + c.code + c.orderId).toLowerCase().includes(s)) return false
      if (fs && c.status !== fs) return false
      if (fd && c.due.state !== fd) return false
      if (quick === 'active' && c.status !== 'Đang triển khai' && c.status !== 'Đã ký') return false
      if (quick === 'adv' && c.adv.state !== 'missing') return false
      if (quick === 'debt' && !((agg[c.id]?.debt ?? 0) > 0)) return false
      return true
    })
  }, [contracts, agg, q, fs, fd, quick])

  /* ---- KPI ---- */
  const kpi = useMemo(() => {
    let over = 0, due = 0, advMiss = 0, advSum = 0, debtSum = 0
    for (const c of contracts) {
      if (c.due.state === 'overdue') over++
      else if (c.due.state === 'due') due++
      if (c.adv.state === 'missing') { advMiss++; advSum += c.advance.required - (c.advance.received || 0) }
      const d = agg[c.id]?.debt ?? 0
      if (d > 0) debtSum += d
    }
    const active = contracts.filter((c) => c.status === 'Đang triển khai' || c.status === 'Đã ký').length
    return { over, due, advMiss, advSum, debtSum, active }
  }, [contracts, agg])
  const overdueList = contracts.filter((c) => c.due.state === 'overdue')

  const rowActions = (c: ContractRow) => {
    if (!canEdit) return null
    const btns = []
    if (!c.returnedAt) btns.push(<Button key="r" size="small" onClick={(e) => { e.stopPropagation(); flow.askReturned(c) }}>Đã trả HĐ</Button>)
    else if (!c.signDate) btns.push(<Button key="s" size="small" onClick={(e) => { e.stopPropagation(); flow.askSigned(c) }}>Đã ký</Button>)
    if (c.signDate && c.status !== 'Hoàn thành') btns.push(<Button key="p" size="small" type="primary" onClick={(e) => { e.stopPropagation(); setPaying(c) }}>+ Tiền về</Button>)
    return <div style={{ display: 'flex', gap: 6 }}>{btns}</div>
  }

  const columns: TableColumnsType<ContractRow> = [
    {
      title: 'Hợp đồng', key: 'id', width: 150, fixed: 'left',
      render: (_, c) => (
        <>
          <div className="mono" style={{ fontWeight: 700 }}>{c.id}</div>
          <div className="sub-soft">Đơn <RecordLink id={c.orderId} type="dh" style={{ color: 'var(--rust)', fontWeight: 600 }} /> · {c.code}</div>
        </>
      ),
    },
    {
      title: 'Khách hàng', key: 'customer',
      render: (_, c) => <>{c.customer}<CustomerTags name={c.customer} customerId={c.customerId} /><div className="sub-soft num">{fmtNum(c.totalQty)} {c.unit} · {fmtT(c.totalKg)}</div></>,
    },
    {
      title: 'Giá trị', key: 'value', align: 'right', sorter: (a, b) => a.value - b.value,
      render: (_, c) => <span className="num"><b>{moneyShort(c.value)}</b><div className="sub-soft">{fmtNum(c.unitPrice)}₫/kg</div></span>,
    },
    {
      title: 'Hạn trả HĐ (05 ngày)', key: 'due', sorter: (a, b) => (a.returnedAt ? 1e6 : a.due.days) - (b.returnedAt ? 1e6 : b.due.days),
      render: (_, c) => <DueChip due={c.due} />,
    },
    {
      title: 'Tạm ứng', key: 'adv',
      render: (_, c) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {c.adv.state === 'missing' && <AlertTriangle size={12} color="var(--signal)" />}
          {c.adv.state === 'ok' && <CheckCircle2 size={12} color="var(--moss)" />}
          <AdvChip adv={c.adv} />
        </span>
      ),
    },
    {
      title: 'Giao hàng lũy kế', key: 'deliv',
      render: (_, c) => {
        const g = agg[c.id]
        return <MiniProg pct={g?.pctDelivered ?? 0} tone="warn" top={`${fmtT(g?.deliveredKg)} / ${fmtT(c.totalKg)}`} bottom={`${g?.trips ?? 0} chuyến đã giao`} />
      },
    },
    {
      title: 'Tiền về lũy kế', key: 'paid',
      render: (_, c) => {
        const g = agg[c.id]
        if (!g) return null
        const tone: ProgTone = g.pctPaid >= g.pctDelivered ? 'success' : g.pctPaid >= g.pctDelivered - 15 ? 'warn' : 'danger'
        return <MiniProg pct={g.pctPaid} tone={tone} top={`${moneyShort(g.paidTotal)} / ${moneyShort(c.value)}`}
          bottom={g.debt > 0 ? `Khách nợ ${moneyShort(g.debt)}` : 'Tiền về trước hàng'} />
      },
    },
    { title: 'Trạng thái', key: 'status', render: (_, c) => <StatusTag status={c.status} /> },
    { title: '', key: 'act', width: 170, render: (_, c) => rowActions(c) },
  ]

  return (
    <>
      <PageHeader title="Hợp đồng & Tạm ứng"
        desc="Kế toán làm hợp đồng trong 05 ngày · theo dõi tạm ứng & lũy kế hàng — tiền"
        extra={<>
          <ExportButton kind="contracts" params={{ status: fs, due: fd }} ids={rows.map((c) => c.id)} total={contracts.length} />
          <Button type="primary" icon={<ShoppingCart size={14} />} onClick={() => navigate('/don-hang?status=' + encodeURIComponent('Chốt đơn'))}>Đơn hàng chờ làm HĐ</Button>
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Đang triển khai" value={kpi.active} sub="hợp đồng có lệnh SX / giao hàng"
          onClick={() => setQuick(quick === 'active' ? '' : 'active')} />
        <Kpi tone="signal" label="Hạn trả hợp đồng"
          value={<span className={kpi.over + kpi.due > 0 ? 'text-signal' : ''}>{kpi.over + kpi.due}</span>}
          onClick={kpi.over ? () => setFd(fd === 'overdue' ? '' : 'overdue') : kpi.due ? () => setFd(fd === 'due' ? '' : 'due') : undefined}
          sub={<>
            {kpi.over} quá hạn{overdueList.length > 0 && <> ({overdueList.map((c, i) => <span key={c.id}>{i > 0 && ', '}<RecordLink id={c.id} type="hd" danger /></span>)})</>}
            {' · '}{kpi.due} đến hạn (≤1 ngày)
          </>} />
        <Kpi tone="amber" label="Tạm ứng chưa về"
          value={<span className={kpi.advSum > 0 ? 'text-signal' : ''}>{moneyShort(kpi.advSum)}</span>}
          onClick={kpi.advMiss ? () => setQuick(quick === 'adv' ? '' : 'adv') : undefined}
          sub={`${kpi.advMiss} hợp đồng đã ký chưa về tạm ứng`} />
        <Kpi tone="moss" label="Đối ứng hàng — tiền" value={moneyShort(kpi.debtSum)} sub="khách còn nợ theo hàng đã giao"
          onClick={kpi.debtSum > 0 ? () => setQuick(quick === 'debt' ? '' : 'debt') : undefined} />
      </KpiGrid>

      <div className="list-card">
        <div className="filter-bar">
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã HĐ, khách hàng, mã đơn..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <Select value={fs} onChange={setFs} style={{ minWidth: 180 }}
            options={[{ value: '', label: 'Tất cả trạng thái' }, ...STATUSES.map((s) => ({ value: s, label: s }))]} />
          <Select value={fd} onChange={setFd} style={{ minWidth: 190 }}
            options={[
              { value: '', label: 'Hạn trả HĐ: tất cả' }, { value: 'overdue', label: 'Quá hạn trả' },
              { value: 'due', label: 'Đến hạn (≤1 ngày)' }, { value: 'ok', label: 'Đã trả khách' },
            ]} />
          <TagFilter value={tag} onChange={setTag} />
          {quick && <Tag closable onClose={() => setQuick('')} color="volcano" style={{ margin: 0 }}>{QUICK_LABEL[quick]}</Tag>}
        </div>
        <Table<ContractRow> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={rows}
          scroll={{ x: 1280 }} pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName={(c) => 'clickable-row' + (c.due.state === 'overdue' ? ' row-alert' : '')}
          onRow={(r) => ({ onClick: () => open('hd', r.id) })}
          locale={{ emptyText: 'Không có hợp đồng phù hợp bộ lọc.' }} />
      </div>

      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Bấm vào dòng để mở <b>hồ sơ đối ứng hợp đồng</b> (trượt từ phải): 3 số cân đối chiếu, lũy kế giao — tiền, chứng từ liên kết.</span>
      </p>

      {paying && <PaymentModal contract={paying} onClose={() => setPaying(null)} />}
    </>
  )
}
