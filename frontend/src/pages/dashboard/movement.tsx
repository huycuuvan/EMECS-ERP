/* Nhật ký chứng từ (movementLog): bộ lọc kỳ + hợp đồng + loại phiếu và bảng — dùng ở Dashboard và Báo cáo. */
import { Button, DatePicker, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useContracts } from '@/api/hooks'
import type { MovementRow } from '@/api/types'
import { fmtDT, fmtKg } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { KindBadge } from './common'

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

/** Tổng kg theo tầng (bỏ qua phiếu chưa điền). */
export function tierTotals(rows: MovementRow[]) {
  const t = { ptn: 0, pc: 0, ma: 0, giao: 0 }
  rows.forEach((r) => {
    const kg = Number(r.kg) || 0
    if (r.kind === 'Chuẩn bị hàng') t.ptn += kg
    else if (r.kind === 'Cân xuất đi mạ') t.pc += kg
    else if (r.kind === 'Nhập xưởng mạ') t.ma += kg
    else if (r.kind === 'Giao khách') t.giao += kg
  })
  return t
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
      render: (kg) => kg != null ? <b className="num mono">{fmtKg(kg)}</b> : <span className="text-signal" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{nullText}</span>,
    },
    { title: 'Diễn giải', dataIndex: 'desc', render: (d) => <span style={{ fontSize: 12, color: 'var(--ash)' }}>{d}</span> },
    { title: whoTitle, dataIndex: 'who', render: (w) => <span style={{ fontSize: 12 }}>{w}</span> },
  ]
  return (
    <Table<MovementRow> size="small" rowKey={(r) => r.type + r.id + r.kind} columns={columns} dataSource={rows} loading={loading}
      rowClassName={(r) => 'clickable-row' + (r.kg == null ? ' row-alert' : '')} onRow={(r) => ({ onClick: () => open(r.type, r.id) })}
      pagination={{ pageSize: 12, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 820 }}
      locale={{ emptyText: <div style={{ padding: 24, color: 'var(--ash)' }}>{emptyText}</div> }} />
  )
}
