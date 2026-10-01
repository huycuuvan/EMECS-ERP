/* 11 — Kho ảo chênh lệch: nơi "ném" mọi phần rơi rớt / lệch cân đã được Quản lý cho phép — treo tới khi xử lý dứt điểm. */
import { Button, Input, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AlertTriangle, ArchiveRestore, BarChart3, Clock, Info, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePendingDeltas, useVlossList } from '@/api/hooks'
import type { VLoss } from '@/api/types'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT, fmtKg } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import ResolveVlossModal from './vloss/ResolveVlossModal'
import { SrcChip } from './vloss/SrcChip'
import ThrowModal from './vloss/ThrowModal'

const panel = { background: 'var(--canvas)', border: '1px solid var(--rule)', borderRadius: 12, padding: 18 }
const SOURCES = ['Trạm cân công ty', 'Cân tại xưởng mạ', 'Giao khách']
const sumKg = (arr: VLoss[]) => arr.reduce((s, e) => s + Math.abs(Number(e.kg) || 0), 0)

export default function VirtualLoss() {
  const { data: all = [], isLoading } = useVlossList()
  const { data: pending = [] } = usePendingDeltas()
  const { can } = useAuth()
  const { open } = usePeek()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [src, setSrc] = useState<string>()
  const [st, setSt] = useState<string>()
  const [throwing, setThrowing] = useState(false)
  const [resolving, setResolving] = useState<VLoss | null>(null)
  const canResolve = can('kho-ao', 'edit') // Quản lý A + Thủ kho (giới hạn)
  const canApprove = can('kho-ao', 'full') // chỉ Quản lý A cho phép rơi rớt

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((e) => {
      if (s && !(e.id + e.refId + e.contractId + (e.note || '')).toLowerCase().includes(s)) return false
      if (src && e.source !== src) return false
      if (st && e.status !== st) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [all, q, src, st])

  const treo = all.filter((e) => e.status === 'Đang treo')
  const xong = all.filter((e) => e.status === 'Đã xử lý')

  const columns: ColumnsType<VLoss> = [
    { title: 'Bút toán', dataIndex: 'id', render: (_, e) => <div><span className="mono" style={{ fontWeight: 700 }}>{e.id}</span><div className="caption num" style={{ fontSize: 11 }}>{fmtDT(e.date)}</div></div> },
    { title: 'Nguồn chênh', dataIndex: 'source', render: (v: string) => <SrcChip src={v} /> },
    { title: 'Phiếu gốc', dataIndex: 'refId', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'KL rơi rớt', dataIndex: 'kg', align: 'right', render: (v: number) => <span className="num mono" style={{ fontWeight: 700, color: 'var(--steel)' }}>{fmtKg(Math.abs(v))}</span> },
    { title: 'Người duyệt · ghi chú', dataIndex: 'approvedBy', width: 260, render: (_, e) => <div><b style={{ fontSize: 12 }}>{e.approvedBy}</b><div className="caption" style={{ fontSize: 11 }}>{e.note}</div></div> },
    { title: 'Trạng thái', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { title: 'Hướng xử lý', dataIndex: 'resolution', render: (_, e) => e.resolution
      ? <div style={{ fontSize: 11.5 }}>{e.resolution}<div className="caption num" style={{ fontSize: 11 }}>{fmtDT(e.resolvedAt)}</div></div>
      : <span style={{ color: 'var(--ash-3)' }}>—</span> },
    ...(canResolve ? [{ key: 'act', render: (_: unknown, e: VLoss) => e.status === 'Đang treo'
      ? <Button size="small" type="primary" onClick={(ev) => { ev.stopPropagation(); setResolving(e) }} style={{ whiteSpace: 'nowrap' }}>Xử lý</Button>
      : null }] : []),
  ]

  return (
    <div>
      <PageHeader title="Kho ảo chênh lệch"
        desc={'Nơi "ném" mọi phần rơi rớt / lệch cân đã được Quản lý cho phép — treo tại đây cho tới khi xử lý dứt điểm'}
        extra={<>
          {can('bao-cao') && <Button icon={<BarChart3 size={14} />} onClick={() => nav('/bao-cao')}>Báo cáo đối ứng</Button>}
          <Button type={canApprove ? 'primary' : 'default'} icon={<ArchiveRestore size={14} />} onClick={() => setThrowing(true)}>
            {canApprove ? 'Ném chênh lệch vào kho' : 'Xem chênh lệch chưa duyệt'}
          </Button>
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Đang treo trong kho ảo" value={fmtKg(sumKg(treo))} sub={`${treo.length} bút toán chờ xử lý dứt điểm`} onClick={() => setSt('Đang treo')} />
        <Kpi tone="signal" label="Chênh lệch chưa ném vào" value={<span className={pending.length ? 'text-signal' : ''}>{pending.length}</span>}
          sub="phiếu có lệch chưa được QL cho phép" onClick={() => setThrowing(true)} />
        <Kpi tone="moss" label="Đã xử lý dứt điểm" value={fmtKg(sumKg(xong))} sub={`${xong.length} bút toán đã thanh lý / bồi thường / trừ lương`} onClick={() => setSt('Đã xử lý')} />
        <Kpi tone="amber" label="Tổng rơi rớt lũy kế" value={fmtKg(sumKg(all))} sub={`${all.length} bút toán lũy kế toàn hệ thống`} onClick={() => setSt(undefined)} />
      </KpiGrid>

      {pending.length > 0 && (
        <div onClick={() => setThrowing(true)} className="clickable"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--signal-soft)', border: '1px solid rgba(138,31,31,.35)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: 'var(--signal)', cursor: 'pointer', fontSize: 13 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <b>{pending.length} phiếu có lệch chưa ném vào kho ảo</b> — tổng {fmtKg(pending.reduce((s, d) => s + Math.abs(d.delta), 0))}:{' '}
            {pending.slice(0, 5).map((d, i) => <span key={d.refType + d.id}>{i > 0 && ', '}<RecordLink id={d.id} danger /></span>)}{pending.length > 5 && '…'}
          </span>
          <Button size="small" danger>{canApprove ? 'Xem & duyệt' : 'Xem'}</Button>
        </div>
      )}

      <div style={panel}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã bút toán, phiếu gốc, hợp đồng..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <Select allowClear placeholder="Mọi nguồn chênh" value={src} onChange={setSrc} style={{ minWidth: 180 }} options={SOURCES.map((s) => ({ value: s, label: s }))} />
          <Select allowClear placeholder="Mọi trạng thái" value={st} onChange={setSt} style={{ minWidth: 150 }}
            options={[{ value: 'Đang treo', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} />Đang treo</span> }, { value: 'Đã xử lý', label: 'Đã xử lý' }]} />
        </div>
        <Table<VLoss> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns} scroll={{ x: 1000 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'Kho ảo trống — chưa có chênh lệch nào được ném vào.' }}
          rowClassName="clickable-row" onRow={(e) => ({ onClick: () => open('vk', e.id) })} />
      </div>

      <p className="caption" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Nguyên tắc: mọi kg lệch ngoài dung sai đều phải hoặc <b>nằm trong kho ảo</b> (đã được QL cho phép) hoặc <b>đỏ trên báo cáo</b>.
          Nhờ đó tổng đối ứng luôn hợp lý: <b>Cân xuất = Mạ nhận + Trên xe + Kho ảo</b>.</span>
      </p>

      <ThrowModal open={throwing} onClose={() => setThrowing(false)} />
      <ResolveVlossModal entry={resolving} onClose={() => setResolving(null)} />
    </div>
  )
}
