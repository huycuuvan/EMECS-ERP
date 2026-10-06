/* Kho & Trạm cân → Nguyên liệu mua vào (M04): kho nhập phiếu nguyên liệu (thép tấm, thép hình…);
   thống kê theo tháng, nhà cung cấp, mác thép và so với thành phẩm SX bàn giao kho trong kỳ. */
import { Button, DatePicker, Input, Select, Table, type TableColumnsType } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Info, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMaterials, useMaterialStats } from '@/api/hooksMaster'
import type { MaterialReceipt, StatGroup } from '@/api/typesMaster'
import { DeleteButton } from '@/components/DeleteRecord'
import { Kpi, KpiGrid, PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtKg, fmtNum, fmtT } from '@/lib/format'
import { HBar } from './dashboard/charts'
import { Grid, Panel } from './dashboard/common'
import MaterialFormModal from './materials/MaterialFormModal'
import '@/peek/drawers/contract/contract.css'

const PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: '30 ngày qua', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
  { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { label: '3 tháng qua', value: [dayjs().subtract(3, 'month'), dayjs()] },
  { label: 'Năm nay', value: [dayjs().startOf('year'), dayjs()] },
]

/** Cột dọc theo tháng (SVG thuần, không thư viện chart). */
function MonthBars({ data }: { data: StatGroup[] }) {
  if (!data.length) return <p className="caption">Không có phiếu nhập trong kỳ.</p>
  const max = Math.max(1, ...data.map((d) => d.kg))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 180, padding: '8px 4px 0' }}>
      {data.map((d) => {
        const [y, m] = d.key.split('-')
        return (
          <div key={d.key} title={`${m}/${y}: ${fmtKg(d.kg)} · ${d.count} phiếu`} style={{ flex: 1, maxWidth: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <b className="num mono" style={{ fontSize: 11.5, marginBottom: 4 }}>{fmtT(d.kg)}</b>
            <div style={{ width: '100%', height: `${Math.max(3, (d.kg / max) * 130)}px`, background: 'var(--rust)', borderRadius: '6px 6px 2px 2px' }} />
            <span className="caption num" style={{ marginTop: 6 }}>{m}/{y}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Materials() {
  const { can } = useAuth()
  const canEdit = can('nguyen-lieu', 'edit')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(PRESETS[0].value)
  const period = useMemo(() => range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : undefined, [range])
  const { data: rows = [], isLoading } = useMaterials(period)
  const { data: st } = useMaterialStats(period)
  const [q, setQ] = useState('')
  const [sup, setSup] = useState<string>()
  const [grade, setGrade] = useState<string>()
  const [editing, setEditing] = useState<MaterialReceipt | 'new' | null>(null)

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((m) => {
      if (sup && m.supplier !== sup) return false
      if (grade && m.steelGrade !== grade) return false
      if (s && !(m.id + ' ' + m.supplier + ' ' + m.spec + ' ' + m.steelGrade + ' ' + m.note).toLowerCase().includes(s)) return false
      return true
    })
  }, [rows, q, sup, grade])
  const shownKg = shown.reduce((s, m) => s + m.kg, 0)

  const columns: TableColumnsType<MaterialReceipt> = [
    { title: 'Mã phiếu', key: 'id', width: 110, render: (_, m) => <span className="mono" style={{ fontWeight: 700 }}>{m.id}</span> },
    { title: 'Ngày nhập', key: 'date', width: 110, sorter: (a, b) => a.date.localeCompare(b.date), render: (_, m) => <span className="num">{fmtD(m.date)}</span> },
    { title: 'Nhà cung cấp', key: 'sup', render: (_, m) => m.supplier },
    { title: 'Loại hàng', key: 'spec', render: (_, m) => <>{[m.steelGrade, m.spec].filter(Boolean).join(' · ') || '—'}{m.note && <div className="sub-soft">{m.note}</div>}</> },
    { title: 'KG bên cung cấp', key: 'kgs', align: 'right', render: (_, m) => m.kgSupplier != null ? <span className="num">{fmtKg(m.kgSupplier)}</span> : <span className="text-ash">—</span> },
    { title: 'KG cân thực tế', key: 'kg', align: 'right', sorter: (a, b) => a.kg - b.kg, render: (_, m) => <b className="num">{fmtKg(m.kg)}</b> },
    { title: 'Chênh', key: 'd', align: 'right', render: (_, m) => m.delta == null ? <span className="text-ash">—</span>
      : Math.abs(m.delta) <= 0.5 ? <span className="text-moss">Khớp</span>
      : <b className="num text-signal">{m.delta > 0 ? '+' : '−'}{fmtNum(Math.abs(m.delta))} kg</b> },
    { title: 'Chứng từ', key: 'photo', render: (_, m) => m.photo
      ? <a href={m.photo} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Xem ảnh</a> : <span className="text-ash">Chưa có</span> },
    { title: 'Người nhập', key: 'by', render: (_, m) => <span className="caption">{m.by}</span> },
    { title: '', key: 'del', width: 80, render: (_, m) => <DeleteButton url={`/material-receipts/${m.id}`} label={`phiếu nhập ${m.id}`} /> },
  ]

  const top = (g?: StatGroup[]) => g?.[0]
  const pct = st?.producedPct
  return (
    <>
      <PageHeader title="Nguyên liệu mua vào" desc="Kho nhập phiếu nguyên liệu (thép tấm, thép hình, thép ống…) — thống kê theo tháng, nhà cung cấp, mác thép"
        extra={canEdit && <Button type="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>Nhập nguyên liệu</Button>} />

      <div className="filter-bar">
        <DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} format="DD/MM/YYYY"
          presets={PRESETS} allowClear placeholder={['Từ ngày', 'Đến ngày']} />
        <span className="caption">{range ? 'Số liệu trong kỳ đã chọn' : 'Toàn bộ thời gian'}</span>
      </div>

      <KpiGrid>
        <Kpi tone="rust" label="Nguyên liệu nhập" value={fmtT(st?.totalKg)} sub={`${st?.count ?? 0} phiếu nhập trong kỳ`} />
        <Kpi tone="steel" label="Nhà cung cấp chính" value={top(st?.bySupplier) ? fmtT(top(st?.bySupplier)!.kg) : '—'}
          sub={top(st?.bySupplier)?.key ?? 'chưa có phiếu'} onClick={top(st?.bySupplier) ? () => setSup(top(st?.bySupplier)!.key) : undefined} />
        <Kpi tone="amber" label="Mác thép nhiều nhất" value={top(st?.byGrade)?.key ?? '—'}
          sub={top(st?.byGrade) ? `${fmtT(top(st?.byGrade)!.kg)} · ${top(st?.byGrade)!.count} phiếu` : ''}
          onClick={top(st?.byGrade) ? () => setGrade(top(st?.byGrade)!.key) : undefined} />
        <Kpi tone="moss" label="SX hoàn thành / nguyên liệu nhập" value={pct == null ? '—' : `${pct}%`}
          sub={`SX bàn giao kho ${fmtT(st?.producedKg)} · nhập ${fmtT(st?.totalKg)}`} />
      </KpiGrid>

      <Grid min={320}>
        <Panel title="Nhập theo tháng" sub="Tổng khối lượng nguyên liệu nhập mỗi tháng (tấn)"><MonthBars data={st?.byMonth ?? []} /></Panel>
        <Panel title="Theo nhà cung cấp" sub="kg nhập trong kỳ">
          {st?.bySupplier.length ? <HBar color="#4b5563" items={st.bySupplier.map((g) => ({ label: `${g.key} (${g.count})`, value: g.kg }))} /> : <p className="caption">—</p>}
        </Panel>
        <Panel title="Theo mác thép" sub="kg nhập trong kỳ">
          {st?.byGrade.length ? <HBar color="#d11a24" items={st.byGrade.map((g) => ({ label: `${g.key} (${g.count})`, value: g.kg }))} /> : <p className="caption">—</p>}
        </Panel>
        <Panel title="Nguyên liệu nhập vs SX hoàn thành" sub="SX hoàn thành = thành phẩm xưởng bàn giao kho (phiếu chuẩn bị hàng) trong kỳ">
          <HBar color="#1e6b3a" items={[
            { label: 'Nguyên liệu nhập', value: st?.totalKg ?? 0 },
            { label: 'SX hoàn thành bàn giao kho', value: st?.producedKg ?? 0 },
          ]} />
          <p className="caption" style={{ margin: '10px 0 0' }}>Chênh lệch = nguyên liệu còn tồn / đang gia công, bavia – phế liệu. Chỉ là thống kê, chưa quản lý nhập–xuất–tồn nguyên liệu.</p>
        </Panel>
      </Grid>

      <div className="list-card">
        <div className="filter-bar">
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã phiếu, NCC, quy cách, ghi chú..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <Select allowClear placeholder="Tất cả nhà cung cấp" value={sup} onChange={setSup} style={{ minWidth: 220 }}
            options={(st?.bySupplier ?? []).map((g) => ({ value: g.key, label: g.key }))} />
          <Select allowClear placeholder="Tất cả mác thép" value={grade} onChange={setGrade} style={{ minWidth: 160 }}
            options={(st?.byGrade ?? []).map((g) => ({ value: g.key, label: g.key }))} />
          <span className="caption" style={{ marginLeft: 'auto' }}>{shown.length} phiếu · <b className="num">{fmtKg(shownKg)}</b></span>
        </div>
        <Table<MaterialReceipt> rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={shown} scroll={{ x: 1000 }}
          pagination={shown.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          rowClassName={canEdit ? 'clickable-row' : undefined} onRow={(m) => ({ onClick: canEdit ? () => setEditing(m) : undefined })}
          locale={{ emptyText: 'Không có phiếu nhập nguyên liệu trong kỳ.' }} />
      </div>
      <p className="list-foot">
        <Info size={13} style={{ marginTop: 2, flex: 'none' }} />
        <span>Thủ kho nhập phiếu khi nguyên liệu về xưởng (theo phiếu cân / hóa đơn NCC). Bấm dòng để sửa phiếu.</span>
      </p>
      {editing && <MaterialFormModal item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
