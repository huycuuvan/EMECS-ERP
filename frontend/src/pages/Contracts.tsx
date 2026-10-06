/* Hợp đồng & Tạm ứng (màn kế toán): KPI tạm ứng / tiền về chờ duyệt / công nợ · danh sách (bước hợp đồng, ngày hoàn thành,
   hạn trả HĐ, hạn giao hàng, tạm ứng, lũy kế giao — tiền) · thao tác theo 4 bước: Soạn thảo → Đã gửi khách hàng → Đã nhận về →
   Đã hoàn thành · + Tiền về (chờ Quản lý duyệt) · Xuất Excel · Đơn hàng chờ làm HĐ. */
import { Button, Input, Select, Table, Tag, type TableColumnsType } from 'antd'
import { AlarmClock, AlertTriangle, CheckCircle2, FilePen, Info, Search, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTasks } from '@/api/hooks'
import { useContractsByTag } from '@/api/hooksMaster'
import { type CompleteInfo, type Contract, type ContractRow, type ContractStatus } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtNum, fmtT, moneyShort } from '@/lib/format'
import { usePeek } from '@/peek/context'
import { PaymentModal } from '@/peek/drawers/contract/modals'
import { useContractFlow } from '@/peek/drawers/contract/useContractFlow'
import RecordLink from '@/peek/RecordLink'
import { aggregateRows } from './contracts/aggregate'
import MiniProg, { type ProgTone } from './contracts/MiniProg'
import CustomerTags from './orders/CustomerTags'
import { TagFilter } from './customers/tags'
import '@/peek/drawers/contract/contract.css'

const STATUSES: ContractStatus[] = ['Chờ soạn thảo', 'Đã soạn thảo', 'Đã gửi khách hàng', 'Đã nhận về', 'Đã hoàn thành']
type Quick = '' | 'pay' | 'adv' | 'debt' | 'late'
const QUICK_LABEL: Record<Exclude<Quick, ''>, string> = {
  pay: 'Có tiền về chờ Quản lý duyệt', adv: 'Đã nhận về — chưa về tạm ứng', debt: 'Khách còn nợ theo hàng đã giao',
  late: 'Sắp tới / quá hạn hoàn thành',
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
      if (fd && c.complete.state !== fd && c.deliver.state !== fd) return false
      if (quick === 'pay' && !(c.pendingPayment > 0)) return false
      if (quick === 'late' && !LATE.has(c.complete.state) && !LATE.has(c.deliver.state)) return false
      if (quick === 'adv' && c.adv.state !== 'missing') return false
      if (quick === 'debt' && !((agg[c.id]?.debt ?? 0) > 0)) return false
      return true
    })
  }, [contracts, agg, q, fs, fd, quick])

  /* ---- KPI ---- */
  const kpi = useMemo(() => {
    let advMiss = 0, advSum = 0, debtSum = 0, payN = 0, paySum = 0, late = 0
    for (const c of contracts) {
      if (c.adv.state === 'missing') { advMiss++; advSum += c.advance.required - (c.advance.received || 0) }
      const d = agg[c.id]?.debt ?? 0
      if (d > 0) debtSum += d
      if (c.pendingPayment > 0) { payN++; paySum += c.pendingPayment }
      if (LATE.has(c.complete.state) || LATE.has(c.deliver.state)) late++
    }
    return { advMiss, advSum, debtSum, payN, paySum, late }
  }, [contracts, agg])

  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f() }
  const rowActions = (c: ContractRow) => {
    if (!canEdit) return null
    const btns = []
    const draftLbl = c.status === 'Chờ soạn thảo' ? 'Soạn HĐ' : 'Bản HĐ'
    btns.push(<Button key="d" size="small" type={c.status === 'Chờ soạn thảo' ? 'primary' : 'default'} icon={<FilePen size={12} />}
      onClick={stop(() => navigate(`/hop-dong/${c.id}/soan-thao`))}>{draftLbl}</Button>)
    if (c.status === 'Đã soạn thảo') btns.push(<Button key="r" size="small" onClick={stop(() => flow.askReturned(c))}>Đã gửi KH</Button>)
    if (c.status === 'Đã gửi khách hàng') btns.push(<Button key="s" size="small" onClick={stop(() => flow.askSigned(c))}>Đã nhận về</Button>)
    // tiền về độc lập với bước hợp đồng — khách có thể chuyển trước khi soạn / ký xong
    btns.push(<Button key="p" size="small" type={c.status === 'Đã nhận về' ? 'primary' : 'default'} onClick={stop(() => setPaying(c))}>+ Tiền về</Button>)
    return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{btns}</div>
  }

  const columns: TableColumnsType<ContractRow> = [
    {
      title: 'Hợp đồng', key: 'id', width: 160, fixed: 'left',
      render: (_, c) => (
        <>
          <div className="mono" style={{ fontWeight: 700 }}>{c.id}</div>
          <div className="sub-soft">Đơn <RecordLink id={c.orderId} type="dh" style={{ color: 'var(--rust)', fontWeight: 600 }} /> · {c.code}</div>
        </>
      ),
    },
    {
      title: 'Khách hàng', key: 'customer', width: 220,
      render: (_, c) => <>{c.customer}<CustomerTags name={c.customer} customerId={c.customerId} /><div className="sub-soft num">{fmtNum(c.totalQty)} {c.unit} · {fmtT(c.totalKg)}</div></>,
    },
    {
      title: 'Giá trị', key: 'value', width: 120, align: 'right', sorter: (a, b) => a.value - b.value,
      render: (_, c) => <span className="num"><b>{moneyShort(c.value)}</b><div className="sub-soft">{fmtNum(c.unitPrice)}₫/kg</div></span>,
    },
    {
      title: 'Hạn trả HĐ', key: 'complete', width: 140,
      sorter: (a, b) => (a.completeBy ? new Date(a.completeBy).getTime() : 9e15) - (b.completeBy ? new Date(b.completeBy).getTime() : 9e15),
      render: (_, c) => <DeadlineCell info={c.complete} date={c.completeBy} okText="Đã nhận về" />,
    },
    {
      title: 'Hạn giao hàng', key: 'deliver', width: 140,
      sorter: (a, b) => (a.deliverBy ? new Date(a.deliverBy).getTime() : 9e15) - (b.deliverBy ? new Date(b.deliverBy).getTime() : 9e15),
      render: (_, c) => <DeadlineCell info={c.deliver} date={c.deliverBy} okText="Đã giao đủ" />,
    },
    { title: 'Tạm ứng', key: 'adv', width: 190, render: (_, c) => <AdvCell c={c} /> },
    {
      title: 'Giao hàng lũy kế', key: 'deliv', width: 180,
      render: (_, c) => {
        const g = agg[c.id]
        return <MiniProg pct={g?.pctDelivered ?? 0} tone="warn" top={`${fmtT(g?.deliveredKg)} / ${fmtT(c.totalKg)}`} bottom={`${g?.trips ?? 0} chuyến đã giao`} />
      },
    },
    {
      title: 'Tiền về lũy kế', key: 'paid', width: 190,
      render: (_, c) => {
        const g = agg[c.id]
        if (!g) return null
        const tone: ProgTone = g.pctPaid >= g.pctDelivered ? 'success' : g.pctPaid >= g.pctDelivered - 15 ? 'warn' : 'danger'
        return <MiniProg pct={g.pctPaid} tone={tone} top={`${moneyShort(g.paidTotal)} / ${moneyShort(c.value)}`}
          bottom={<>{g.debt > 0 ? `Khách nợ ${moneyShort(g.debt)}` : 'Tiền về trước hàng'}
            {c.pendingPayment > 0 && <div style={{ color: 'var(--amber)', fontWeight: 600 }}>+ {moneyShort(c.pendingPayment)} chờ duyệt</div>}</>} />
      },
    },
    { title: 'Trạng thái', key: 'status', width: 170, render: (_, c) => <StatusTag status={c.status} /> },
    { title: '', key: 'act', width: 220, render: (_, c) => rowActions(c) },
  ]

  return (
    <>
      <PageHeader title="Hợp đồng & Tạm ứng"
        desc="Kế toán soạn hợp đồng theo mẫu, khách ký trả về trước hạn trả HĐ · giao hàng trước hạn giao hàng · tiền về nhập tay, Quản lý duyệt · theo dõi lũy kế hàng — tiền"
        extra={<>
          <ExportButton kind="contracts" params={{ status: fs, due: fd }} ids={rows.map((c) => c.id)} total={contracts.length} />
          <Button type="primary" icon={<ShoppingCart size={14} />} onClick={() => navigate('/don-hang?status=' + encodeURIComponent('Chốt đơn'))}>Đơn hàng chờ làm HĐ</Button>
        </>} />

      <KpiGrid>
        <Kpi tone="amber" label="Tạm ứng chưa về"
          value={<span className={kpi.advSum > 0 ? 'text-signal' : ''}>{moneyShort(kpi.advSum)}</span>}
          onClick={kpi.advMiss ? () => setQuick(quick === 'adv' ? '' : 'adv') : undefined}
          sub={`${kpi.advMiss} hợp đồng đã nhận về chưa về tạm ứng`} />
        <Kpi tone="rust" label="Tiền về chờ duyệt" value={moneyShort(kpi.paySum)}
          onClick={kpi.payN ? () => setQuick(quick === 'pay' ? '' : 'pay') : undefined}
          sub={kpi.payN ? `${kpi.payN} hợp đồng — Quản lý duyệt mới tính vào tiền đã về` : 'không có khoản chờ duyệt'} />
        <Kpi tone="signal" label="Sắp tới / quá hạn"
          value={<span className={kpi.late > 0 ? 'text-signal' : ''}>{kpi.late}</span>}
          onClick={kpi.late ? () => setQuick(quick === 'late' ? '' : 'late') : undefined}
          sub="hợp đồng sắp tới (≤ 7 ngày) / quá hạn trả HĐ hoặc hạn giao hàng mà chưa xong" />
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
              { value: '', label: 'Hạn trả HĐ / giao hàng: tất cả' }, { value: 'overdue', label: 'Quá hạn' },
              { value: 'soon', label: 'Sắp tới hạn (≤ 7 ngày)' },
            ]} />
          <TagFilter value={tag} onChange={setTag} />
          {quick && <Tag closable onClose={() => setQuick('')} color="volcano" style={{ margin: 0 }}>{QUICK_LABEL[quick]}</Tag>}
        </div>
        <Table<ContractRow> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={rows}
          scroll={{ x: 1730 }} tableLayout="fixed" pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName={(c) => 'clickable-row' + (c.complete.state === 'overdue' || c.deliver.state === 'overdue' ? ' row-alert' : '')}
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

/* Ô gọn 2 dòng (dòng chính đậm + dòng phụ nhỏ) — cùng kiểu cột lũy kế, không dùng chip dài để khỏi tràn cột. */
const line1 = { fontWeight: 700, fontSize: 13, lineHeight: 1.35 } as const
const line2 = { fontSize: 11.5, lineHeight: 1.35, marginTop: 2 } as const
const LATE = new Set(['soon', 'overdue'])

/** Ô 1 mốc hạn (hạn trả HĐ / hạn giao hàng): dòng 1 ngày, dòng 2 tình trạng có màu. */
function DeadlineCell({ info: k, date, okText }: { info: CompleteInfo; date: string | null | undefined; okText: string }) {
  if (k.state === 'none' || !date) return <span className="text-ash">Chưa có ngày</span>
  const d = k.days ?? 0
  const [txt, color, icon] = k.state === 'ok' ? [okText, 'var(--moss)', <CheckCircle2 key="i" size={11} />]
    : k.state === 'overdue' ? [`QUÁ HẠN ${Math.abs(d)} ngày`, 'var(--signal)', <AlertTriangle key="i" size={11} />]
      : k.state === 'soon' ? [d <= 0 ? 'Đến hạn hôm nay' : `Còn ${d} ngày`, 'var(--amber)', <AlarmClock key="i" size={11} />]
        : [`Còn ${d} ngày`, 'var(--ash)', null]
  return (
    <div>
      <div className="num" style={line1}>{fmtD(date)}</div>
      <div className={k.state === 'overdue' ? 'chip-overdue' : undefined}
        style={{ ...line2, color, fontWeight: k.state === 'fine' ? 400 : 700, display: 'flex', alignItems: 'center', gap: 4 }}>{icon}{txt}</div>
    </div>
  )
}

function AdvCell({ c }: { c: ContractRow }) {
  const a = c.adv
  const [main, ...rest] = a.label.split(' · ')
  const color = a.state === 'ok' ? 'var(--moss)' : a.state === 'missing' ? 'var(--signal)' : a.state === 'none' ? 'var(--ash)' : 'var(--ink)'
  return (
    <div>
      <div style={{ ...line1, color, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {a.state === 'ok' && <CheckCircle2 size={12} style={{ flex: 'none', marginTop: 3 }} />}
        {a.state === 'missing' && <AlertTriangle size={12} style={{ flex: 'none', marginTop: 3 }} />}
        <span>{main}</span>
      </div>
      {rest.length > 0 && <div className="sub-soft" style={{ marginTop: 2 }}>{rest.join(' · ')}</div>}
      {a.state !== 'none' && c.advance.pct > 0 && !rest.length && <div className="sub-soft" style={{ marginTop: 2 }}>Tạm ứng {fmtNum(c.advance.pct)}%</div>}
    </div>
  )
}
