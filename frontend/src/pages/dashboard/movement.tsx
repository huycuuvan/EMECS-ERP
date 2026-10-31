/* Nhật ký chứng từ (movementLog): bộ lọc kỳ + hợp đồng + loại phiếu và bảng — dùng ở Dashboard và Báo cáo. */
import { Button, DatePicker, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useContracts } from '@/api/hooks'
import { MV_OK, type MovementRow } from '@/api/types'
import { fmtDT, fmtKg } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { Chip, KindBadge, type ChipTone } from './common'

export const KINDS = ['Chuẩn bị hàng', 'Cân xuất đi mạ', 'Nhập xưởng mạ', 'Giao khách'] as const

export interface MovementFilter { range: [Dayjs | null, Dayjs | null] | null; contractId?: string; kind?: string }

/** Chuyển bộ lọc sang tham số API (ISO có múi giờ — backend so sánh với datetime aware). */
export function filterParams(f: MovementFilter) {
  return {
    contractId: f.contractId || undefined,
    from: f.range?.[0] ? f.range[0].startOf('day').toISOString() : undefined,
    to: f.range?.[1] ? f.range[1].endOf('day').toISOString() : undefined,
  }
}

export function useMovementFilter() {
  const [f, setF] = useState<MovementFilter>({ range: null })
  return { f, setF, params: useMemo(() => filterParams(f), [f]) }
}

export function MovementFilterBar({ f, setF, showKind = true }: { f: MovementFilter; setF: (f: MovementFilter) => void; showKind?: boolean }) {
  const { data: contracts } = useContracts()
  const preset = (days: number | 'all') => {
    if (days === 'all') return setF({ ...f, range: null })
    const to = dayjs()
    setF({ ...f, range: [to.subtract(days - 1, 'day'), to] })
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      <DatePicker.RangePicker value={f.range} format="DD/MM/YYYY" allowEmpty={[true, true]} placeholder={['Từ ngày', 'Đến ngày']}
        onChange={(v) => setF({ ...f, range: v ? [v[0], v[1]] : null })} style={{ borderRadius: 999 }} />
      <Button size="small" shape="round" onClick={() => preset(7)}>7 ngày</Button>
      <Button size="small" shape="round" onClick={() => preset(30)}>30 ngày</Button>
      <Button size="small" shape="round" onClick={() => preset('all')}>Tất cả</Button>
      <Select allowClear placeholder="Tất cả hợp đồng" value={f.contractId} onChange={(v) => setF({ ...f, contractId: v })} style={{ minWidth: 240 }}
        options={(contracts ?? []).map((c) => ({ value: c.id, label: `${c.id} — ${c.customer}` }))} popupMatchSelectWidth={false} />
      {showKind && (
        <Select allowClear placeholder="Tất cả loại phiếu" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} style={{ minWidth: 180 }}
          options={KINDS.map((k) => ({ value: k, label: k }))} />
      )}
    </div>
  )
}

export type Tier = 'ptn' | 'pc' | 'ma' | 'giao'
const TIER_OF: Record<string, Tier> = { 'Chuẩn bị hàng': 'ptn', 'Cân xuất đi mạ': 'pc', 'Nhập xưởng mạ': 'ma', 'Giao khách': 'giao' }
/** Phiếu CHƯA CHỐT của 1 tầng gộp theo trạng thái (kg = số đã điền, chưa điền thì kg tạm: số trên xe / số giao). */
export interface TierPending { state: string; kg: number; n: number }

/** Tổng kg theo tầng — CHỈ phiếu đã chốt (đạt / Quản lý đã duyệt). Phiếu chờ cân, đang trên xe, chờ Quản lý duyệt,
    QL từ chối… không cộng vào tổng mà gom vào `pending` để hiện riêng dưới ô tầng (anh Thắng 31/10). */
export function tierTotals(rows: MovementRow[]) {
  const t = { ptn: 0, pc: 0, ma: 0, giao: 0 }
  const pending: Record<Tier, TierPending[]> = { ptn: [], pc: [], ma: [], giao: [] }
  rows.forEach((r) => {
    const k = TIER_OF[r.kind]
    if (!k) return
    if (!r.state || r.state === MV_OK) { t[k] += Number(r.kg) || 0; return }
    if (r.state === 'Lái xe từ chối') return
    let g = pending[k].find((p) => p.state === r.state)
    if (!g) pending[k].push(g = { state: r.state, kg: 0, n: 0 })
    g.kg += Number(r.kg ?? r.kgPlan) || 0
    g.n += 1
  })
  return { ...t, pending }
}

export const stateTone = (s: string): ChipTone =>
  s === MV_OK ? 'ok' : /từ chối/i.test(s) ? 'over' : s === 'Chờ QL duyệt' || s === 'Đang trên xe' ? 'soon' : 'fine'

/** Các dòng "Chờ QL duyệt 9.900 kg (1)" dưới ô tầng. */
export function PendingLines({ list }: { list: TierPending[] }) {
  if (!list.length) return null
  return (
    <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
      {list.map((p) => (
        <div key={p.state} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, flexWrap: 'wrap' }}>
          <Chip tone={stateTone(p.state)}>{p.state}</Chip>
          <span className="mono num" style={{ fontWeight: 600 }}>{fmtKg(p.kg)}</span>
          <span className="text-ash">({p.n})</span>
        </div>
      ))}
    </div>
  )
}

export function MovementTable({ rows, loading, nullText = 'CHƯA ĐIỀN', whoTitle = 'Người', emptyText = 'Không có phiếu nào trong kỳ / bộ lọc này.' }: {
  rows: MovementRow[]; loading?: boolean; nullText?: string; whoTitle?: string; emptyText?: string
}) {
  const { open } = usePeek()
  const columns: ColumnsType<MovementRow> = [
    { title: 'Ngày giờ', dataIndex: 'date', width: 110, render: (d) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDT(d)}</span> },
    { title: 'Loại phiếu', dataIndex: 'kind', width: 140, render: (k) => <KindBadge kind={k} /> },
    { title: 'Mã phiếu', dataIndex: 'id', width: 110, render: (id, r) => <RecordLink id={id} type={r.type} style={{ color: 'var(--rust)' }} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', width: 120, render: (id) => <RecordLink id={id} type="hd" /> },
    {
      title: 'Khối lượng', dataIndex: 'kg', align: 'right', width: 120,
      render: (kg, r) => kg != null ? <b className="num mono" style={r.state && r.state !== MV_OK ? { color: 'var(--amber)' } : undefined}>{fmtKg(kg)}</b> : <>
        <span className="text-signal" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{nullText}</span>
        {r.kgPlan != null && <div className="caption num" style={{ whiteSpace: 'nowrap' }}>~{fmtKg(r.kgPlan)}</div>}
      </>,
    },
    { title: 'Trạng thái', dataIndex: 'state', width: 130, render: (s?: string) => s ? <Chip tone={stateTone(s)}>{s}</Chip> : null },
    { title: 'Diễn giải', dataIndex: 'desc', render: (d) => <span style={{ fontSize: 12, color: 'var(--ash)' }}>{d}</span> },
    { title: whoTitle, dataIndex: 'who', render: (w) => <span style={{ fontSize: 12 }}>{w}</span> },
  ]
  return (
    <Table<MovementRow> size="small" rowKey={(r) => r.type + r.id + r.kind} columns={columns} dataSource={rows} loading={loading}
      rowClassName={(r) => 'clickable-row' + (r.kg == null ? ' row-alert' : '')} onRow={(r) => ({ onClick: () => open(r.type, r.id) })}
      pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 950 }}
      locale={{ emptyText: <div style={{ padding: 24, color: 'var(--ash)' }}>{emptyText}</div> }} />
  )
}
