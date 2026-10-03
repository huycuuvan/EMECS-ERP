/* 11 — Kho ảo chênh lệch: CHỈ THỐNG KÊ các khoản lệch kg Quản lý đã chấp nhận (duyệt ở màn lái xe → ghi tự động).
   Không có thao tác xử lý ở màn này. */
import { Button, Input, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BarChart3, Info, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVlossList } from '@/api/hooks'
import type { VLoss } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT, fmtKg } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { SrcChip } from './vloss/SrcChip'

const panel = { background: 'var(--canvas)', border: '1px solid var(--rule)', borderRadius: 12, padding: 18 }
const SOURCES = ['Trạm cân công ty', 'Cân tại xưởng mạ', 'Giao khách']
const sumKg = (arr: VLoss[]) => arr.reduce((s, e) => s + Math.abs(Number(e.kg) || 0), 0)
/** Công thức trên thẻ: Σ số gốc − Σ số cân sau = chênh (cộng từ công thức từng khoản). */
function CardFormula({ arr, a, b }: { arr: VLoss[]; a: string; b: string }) {
  const fs = arr.map((e) => e.formula).filter((f): f is NonNullable<VLoss['formula']> => !!f)
  if (!fs.length) return <>{arr.length} khoản</>
  const sa = fs.reduce((s, f) => s + f.a, 0), sb = fs.reduce((s, f) => s + f.b, 0), d = sa - sb
  return (
    <span style={{ display: 'block', lineHeight: 1.45 }}>
      <span style={{ display: 'block' }}>{a} <b className="num">{fmtKg(sa)}</b> − {b} <b className="num">{fmtKg(sb)}</b></span>
      <span style={{ display: 'block' }}>= <b className="num">{fmtKg(Math.abs(d))}</b> {d > 0 ? 'hụt' : d < 0 ? 'dư' : ''} · {arr.length} khoản</span>
    </span>
  )
}

export default function VirtualLoss() {
  const { data: all = [], isLoading } = useVlossList()
  const { can } = useAuth()
  const { open } = usePeek()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [src, setSrc] = useState<string>()
  const [st, setSt] = useState<string>()

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((e) => {
      if (s && !(e.id + e.refId + e.contractId + (e.note || '')).toLowerCase().includes(s)) return false
      if (src && e.source !== src) return false
      if (st && e.status !== st) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [all, q, src, st])

  const now = new Date()
  const month = all.filter((e) => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
  const bySrc = (x: string) => all.filter((e) => e.source === x)

  const columns: ColumnsType<VLoss> = [
    { title: 'Bút toán', dataIndex: 'id', render: (_, e) => <div><span className="mono" style={{ fontWeight: 700 }}>{e.id}</span><div className="caption num" style={{ fontSize: 11 }}>{fmtDT(e.date)}</div></div> },
    { title: 'Nguồn chênh', dataIndex: 'source', render: (v: string) => <SrcChip src={v} /> },
    { title: 'Phiếu gốc', dataIndex: 'refId', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'KL chênh', dataIndex: 'kg', align: 'right', render: (v: number) => <span className="num mono" style={{ fontWeight: 700, color: 'var(--steel)' }}>{fmtKg(Math.abs(v))}<div className="caption" style={{ fontSize: 11 }}>{v > 0 ? 'hụt' : v < 0 ? 'dư' : ''}</div></span> },
    { title: 'Công thức tính chênh', key: 'formula', width: 300, render: (_, e) => e.formula
      ? <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <div>{e.formula.aLabel}: <b className="num">{fmtKg(e.formula.a)}</b></div>
          <div>− {e.formula.bLabel}: <b className="num">{fmtKg(e.formula.b)}</b></div>
          <div style={{ borderTop: '1px solid var(--rule)', marginTop: 2, paddingTop: 2 }}>= <b className="num">{fmtKg(Math.abs(e.formula.delta))}</b> {e.formula.delta > 0 ? 'hụt' : e.formula.delta < 0 ? 'dư' : ''}</div>
        </div>
      : <span className="text-ash">—</span> },
    { title: 'Lý do chênh lệch', key: 'reason', width: 260, render: (_, e) => <div><div style={{ fontSize: 12.5 }}>{e.reason || e.note || '—'}</div><div className="caption" style={{ fontSize: 11 }}>Chấp nhận: {e.approvedBy}</div></div> },
    { title: 'Trạng thái', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ]

  return (
    <div>
      <PageHeader title="Kho ảo chênh lệch"
        desc="Thống kê các khoản lệch kg Quản lý đã chấp nhận ở màn lái xe — ghi tự động, không cần thao tác"
        extra={<>
          <ExportButton kind="vloss" params={{ source: src, status: st }} ids={rows.map((e) => e.id)} total={all.length} />
          {can('bao-cao') && <Button icon={<BarChart3 size={14} />} onClick={() => nav('/bao-cao')}>Báo cáo đối ứng</Button>}
        </>} />

      <KpiGrid>
        <Kpi tone="amber" label="Tổng lệch lũy kế" value={fmtKg(sumKg(all))} sub={<CardFormula arr={all} a="Σ số gốc" b="Σ số cân sau" />} onClick={() => { setSrc(undefined); setSt(undefined) }} />
        <Kpi tone="steel" label="Trong tháng này" value={fmtKg(sumKg(month))} sub={<CardFormula arr={month} a="Σ số gốc" b="Σ số cân sau" />} />
        <Kpi tone="rust" label="Cân tại xưởng mạ" value={fmtKg(sumKg(bySrc('Cân tại xưởng mạ')))} sub={<CardFormula arr={bySrc('Cân tại xưởng mạ')} a="Cân xuất" b="Mạ cân nhận" />} onClick={() => setSrc('Cân tại xưởng mạ')} />
        <Kpi tone="moss" label="Giao khách" value={fmtKg(sumKg(bySrc('Giao khách')))} sub={<CardFormula arr={bySrc('Giao khách')} a="Lấy từ mạ" b="Khách ký nhận" />} onClick={() => setSrc('Giao khách')} />
      </KpiGrid>

      <div style={panel}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã bút toán, phiếu gốc, hợp đồng..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Select allowClear placeholder="Mọi nguồn chênh" value={src} onChange={setSrc} style={{ minWidth: 180 }} options={SOURCES.map((s) => ({ value: s, label: s }))} />
          <Select allowClear placeholder="Mọi trạng thái" value={st} onChange={setSt} style={{ minWidth: 150 }}
            options={[...new Set(all.map((e) => e.status))].map((x) => ({ value: x, label: x }))} />
        </div>
        <Table<VLoss> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns} scroll={{ x: 1300 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'Chưa có khoản lệch nào được Quản lý chấp nhận.' }}
          rowClassName="clickable-row" onRow={(e) => ({ onClick: () => open('vk', e.id) })} />
      </div>

      <p className="caption" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Lái xe gửi phiếu lệch kèm lý do → Quản lý <b>chấp nhận</b> ở màn Thẻ công việc lái xe → khoản lệch tự ghi vào đây để thống kê.</span>
      </p>

    </div>
  )
}
