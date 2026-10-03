/* Phiếu tiếp nhận thành phẩm — port pages/05-tiep-nhan.html:
   KPI · danh sách phiếu (lọc HĐ, tìm kiếm) · lập phiếu từ LSX (chặn vượt số SX báo) · gợi ý tạo phiếu cân xuất đi mạ. */
import { App, Button, Card, Input, Select, Table, type TableColumnsType } from 'antd'
import { Info, PackagePlus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useContracts, useDashboard, useReceipts } from '@/api/hooks'
import type { Receipt } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader } from '@/components/ui'
import { fmtDT, fmtKg, fmtT, relTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'
import CreateReceiptModal from './receipts/CreateReceiptModal'
import { useWeighingActions } from './weighings/WeighingModals'

const sub = { color: C.ash, fontSize: 11, marginTop: 2 }
const sameMonth = (iso?: string | null) => {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}

export default function Receipts() {
  const { modal } = App.useApp()
  const { open } = usePeek()
  const { can } = useAuth()
  const canEdit = can('tiep-nhan', 'edit')
  const canWeigh = can('phieu-can', 'edit')
  const { data: all = [], isLoading } = useReceipts()
  const { data: contracts = [] } = useContracts()
  const { data: dash } = useDashboard()
  const wAct = useWeighingActions()
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [fh, setFh] = useState('')

  const cmap = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c])), [contracts])
  const hdOptions = useMemo(() => {
    const seen = new Set<string>()
    all.forEach((r) => seen.add(r.contractId))
    return [...seen].map((id) => ({ value: id, label: id + (cmap[id] ? ` — ${cmap[id].customer}` : '') }))
  }, [all, cmap])

  const rows = useMemo(() => [...all].sort((a, b) => (b.date || '').localeCompare(a.date || '')).filter((r) => {
    if (fh && r.contractId !== fh) return false
    if (q && `${r.id} ${r.lsxId} ${r.contractId} ${r.note || ''} ${r.by || ''}`.toLowerCase().indexOf(q.toLowerCase()) < 0) return false
    return true
  }), [all, fh, q])

  /* KPI */
  const inMonth = all.filter((r) => sameMonth(r.date))
  const kgMonth = inMonth.reduce((s, r) => s + (Number(r.kg) || 0), 0)
  const withStock = (dash?.contracts ?? []).filter((g) => g.stockKg > 0)
  const stockAll = withStock.reduce((s, g) => s + g.stockKg, 0)

  const onCreated = (r: Receipt) => {
    if (!canWeigh) return
    modal.confirm({
      title: `Đã lập phiếu ${r.id}`,
      content: <span>Nhận {fmtKg(r.kg)} từ <b>{r.lsxId}</b>. Tạo phiếu cân xuất đi mạ cho lô hàng này?</span>,
      okText: 'Tạo phiếu cân', cancelText: 'Để sau',
      onOk: () => wAct.create({ lsxId: r.lsxId, receiptId: r.id }),
    })
  }

  const columns: TableColumnsType<Receipt> = [
    { title: 'Mã phiếu', key: 'id', render: (_, r) => <span className="mono" style={{ fontWeight: 600 }}>{r.id}</span> },
    { title: 'Lệnh SX', key: 'lsx', render: (_, r) => <RecordLink id={r.lsxId} style={{ color: C.rust, fontSize: 12 }} /> },
    { title: 'Hợp đồng', key: 'hd', render: (_, r) => <RecordLink id={r.contractId} style={{ color: C.rust, fontSize: 12 }} /> },
    { title: 'Ngày giờ', key: 'date', render: (_, r) => <div><span className="num">{fmtDT(r.date)}</span><div style={sub}>{relTime(r.date)}</div></div> },
    { title: 'Khối lượng', key: 'kg', align: 'right', render: (_, r) => <span className="mono num" style={{ fontWeight: 700 }}>{fmtKg(r.kg)}</span> },
    { title: 'Người lập', key: 'by', render: (_, r) => <div>{r.by || '—'}<div style={sub}>Kho</div></div> },
    { title: 'Ghi chú', key: 'note', render: (_, r) => <span style={{ color: C.ash, fontSize: 12, maxWidth: 260, display: 'inline-block' }}>{r.note || '—'}</span> },
  ]

  return (
    <div>
      <PageHeader title="Phiếu tiếp nhận thành phẩm"
        desc="Kho lập phiếu nhận thành phẩm từ sản xuất theo lệnh SX — đối chiếu với số kg xưởng đã báo hoàn thành"
        extra={<>
          <ExportButton kind="receipts" params={{ contract_id: fh }} ids={rows.map((r) => r.id)} total={all.length} />
          {canEdit && <Button type="primary" icon={<PackagePlus size={14} />} onClick={() => setCreating(true)}>+ Phiếu tiếp nhận</Button>}
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Phiếu trong tháng" value={inMonth.length} sub="phiếu tiếp nhận kho đã lập" />
        <Kpi tone="moss" label="KG tiếp nhận tháng" value={fmtT(kgMonth)} sub="thành phẩm nhập kho từ sản xuất" />
        <Kpi tone="amber" label="Tồn kho chờ cân" value={fmtKg(stockAll)} sub="toàn công ty: kho nhận − đã cân xuất" />
        <Kpi tone="signal" label="Hợp đồng có tồn" value={<span className="text-signal">{withStock.length}</span>}
          sub={withStock.length
            ? <span className="text-signal">HĐ còn tồn — cần cân xuất đi mạ: {withStock.map((g, i) => <span key={g.contract.id}>{i > 0 && ' · '}<RecordLink id={g.contract.id} danger /></span>)}</span>
            : <span className="text-signal">không còn tồn kho chờ cân</span>} />
      </KpiGrid>

      <Card styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color={C.ash} />} placeholder="Tìm mã phiếu, lệnh SX, hợp đồng, ghi chú..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, borderRadius: 999 }} />
          <Select value={fh} onChange={setFh} style={{ minWidth: 240 }} options={[{ value: '', label: 'Tất cả hợp đồng' }, ...hdOptions]} />
        </div>
        <Table<Receipt> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 1000 }}
          locale={{ emptyText: 'Chưa có phiếu tiếp nhận phù hợp bộ lọc.' }}
          rowClassName="clickable-row" onRow={(r) => ({ onClick: () => open('ptn', r.id) })} />
      </Card>

      <p className="caption" style={{ marginTop: 12 }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> Bấm vào dòng để mở <b>phiếu tiếp nhận</b> (trượt từ phải). Kho không được nhận vượt số kg sản xuất đã báo hoàn thành trên lệnh SX.
      </p>

      {creating && <CreateReceiptModal onClose={() => setCreating(false)} onCreated={onCreated} />}
      {wAct.node}
    </div>
  )
}
