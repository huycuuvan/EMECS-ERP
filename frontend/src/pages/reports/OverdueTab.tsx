/* Tab 2 — Quá hạn & thiếu số liệu: KPI + danh sách nhóm theo phòng ban → người. */
import { App, Button, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BellRing, Siren, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useOverdueDocs } from '@/api/hooks'
import type { OverdueDoc } from '@/api/types'
import { Kpi, KpiGrid } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { Panel } from '../dashboard/common'

type Row = (OverdueDoc & { group?: false; key: string }) | { group: true; key: string; label: string; count: number }

export default function OverdueTab() {
  const { data, isLoading } = useOverdueDocs()
  const { can } = useAuth()
  const { open } = usePeek()
  const { message } = App.useApp()
  const od = useMemo(() => data ?? [], [data])
  const canRemind = can('bao-cao', 'full')

  const { worst, worstN, rows } = useMemo(() => {
    const byPerson: Record<string, number> = {}
    od.forEach((o) => { byPerson[o.person] = (byPerson[o.person] || 0) + 1 })
    const worst = Object.keys(byPerson).sort((a, b) => byPerson[b] - byPerson[a])[0]
    // nhóm PHÒNG BAN → NGƯỜI
    const groups: Record<string, OverdueDoc[]> = {}
    od.forEach((o) => { (groups[`${o.dept} — ${o.person}`] ||= []).push(o) })
    const rows: Row[] = []
    Object.keys(groups).sort().forEach((k) => {
      rows.push({ group: true, key: 'g:' + k, label: k, count: groups[k].length })
      groups[k].forEach((o) => rows.push({ ...o, group: false, key: o.type + o.id }))
    })
    return { worst, worstN: worst ? byPerson[worst] : 0, rows }
  }, [od])
  const maxItem = od[0] // đã sort nặng nhất trước

  const span = (r: Row, first = false) => (r.group ? { colSpan: first ? 7 : 0, style: { background: 'var(--paper-2)', padding: '8px 12px' } } : {})
  const columns: ColumnsType<Row> = [
    {
      title: 'Loại thẻ/phiếu', key: 'kind', onCell: (r) => span(r, true),
      render: (_, r) => r.group
        ? <b style={{ fontSize: 12 }}><Users size={13} style={{ verticalAlign: -2 }} /> {r.label} ({r.count} mục quá hạn)</b>
        : r.kind,
    },
    { title: 'Mã', key: 'id', onCell: (r) => span(r), render: (_, r) => !r.group && <RecordLink id={r.id} type={r.type} danger /> },
    { title: 'Hợp đồng', key: 'hd', onCell: (r) => span(r), render: (_, r) => !r.group && <RecordLink id={r.contractId} type="hd" style={{ color: 'var(--rust)' }} /> },
    { title: 'Thiếu gì', key: 'missing', onCell: (r) => span(r), render: (_, r) => !r.group && <span className="text-signal" style={{ fontWeight: 600 }}>Thiếu {r.missing}</span> },
    { title: 'Hạn điền', key: 'deadline', onCell: (r) => span(r), render: (_, r) => !r.group && <span className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.deadline)}</span> },
    {
      title: 'Quá hạn', key: 'over', onCell: (r) => span(r),
      render: (_, r) => !r.group && (
        <span className="chip-overdue text-signal" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}><Siren size={12} style={{ verticalAlign: -2 }} /> QUÁ HẠN {r.hoursOver}h</span>
      ),
    },
    {
      title: '', key: 'act', onCell: (r) => span(r),
      render: (_, r) => !r.group && (
        <Button size="small" icon={<BellRing size={12} />} disabled={!canRemind}
          onClick={(e) => { e.stopPropagation(); message.success(`Đã nhắc ${r.person} qua chuông thông báo về ${r.kind} ${r.id}`) }}>Nhắc qua chuông</Button>
      ),
    },
  ]

  return (
    <>
      <KpiGrid>
        <Kpi tone="signal" label="Tổng mục quá hạn" value={<span className={od.length ? 'text-signal' : ''}>{isLoading ? '—' : od.length}</span>}
          sub={<span className="text-signal">thẻ/phiếu chưa điền số kg hoặc ảnh</span>} />
        <Kpi tone="rust" label="Người vi phạm nhiều nhất" value={worst || '—'}
          sub={<span style={{ color: 'var(--rust)' }}>{worst ? `${worstN} mục quá hạn chưa xử lý` : 'không có vi phạm'}</span>} />
        <Kpi tone="amber" label="Giờ quá hạn lớn nhất" value={<span className={maxItem ? 'text-signal' : ''}>{maxItem ? `${maxItem.hoursOver}h` : '0h'}</span>}
          sub={<span className="text-amber">{maxItem ? `${maxItem.kind} ${maxItem.id} — ${maxItem.person}` : 'không có mục nào'}</span>}
          onClick={maxItem ? () => open(maxItem.type, maxItem.id) : undefined} />
      </KpiGrid>
      <Panel title="Danh sách quá hạn — nhóm theo phòng ban, từng người">
        <Table<Row> size="small" rowKey="key" columns={columns} dataSource={rows} loading={isLoading} pagination={false} scroll={{ x: 860 }}
          rowClassName={(r) => (r.group ? 'grp-head' : 'clickable-row')}
          onRow={(r) => (r.group ? {} : { onClick: () => open(r.type, r.id) })}
          locale={{ emptyText: <div style={{ padding: 32, color: 'var(--moss)' }}><b>✓ Không còn thẻ/phiếu quá hạn.</b> Toàn bộ số kg và ảnh phiếu đã điền đủ.</div> }} />
        {!canRemind && <p className="caption" style={{ margin: '10px 0 0' }}>Chỉ Quản lý A được gửi nhắc việc.</p>}
      </Panel>
    </>
  )
}
