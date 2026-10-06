/* 08 — Đối ứng gửi / nhận mạ kẽm: mạ thuê ngoài, chỉ đối ứng kg gửi vào = kg lấy ra + kg còn tại mạ.
   "Tất cả hợp đồng" (mặc định): tổng hợp mọi khách + bảng từng HĐ (hàng mỗi khách tách riêng, không lấy lẫn).
   Chọn 1 HĐ: 4 ô tổng + kiểm tra tự động + từng chuyến (cân xuất công ty ↔ cân đến mạ ↔ lấy từ mạ ↔ khách ký). */
import { Button, Select, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AlertTriangle, ArrowLeftFromLine, ArrowRightToLine, Check, CheckCircle2, Scale, Truck } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContract, useContracts, useTasks } from '@/api/hooks'
import type { Check as CheckT, Task, Weighing } from '@/api/types'
import { Kpi, KpiGrid, PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtDelta, fmtKg, relTime } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import CreateTaskModal from './tasks/CreateTaskModal'
import { useNow } from './tasks/logic'
import { TaskStatusTag } from './tasks/util'

const panel = { background: 'var(--canvas)', border: '1px solid var(--rule)', borderRadius: 12, padding: 18, marginBottom: 20 }
const h5 = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, marginBottom: 10 }
const miss = <span style={{ color: 'var(--signal)', fontWeight: 800, fontSize: 11.5 }}>CHƯA ĐIỀN</span>
const dash = <span className="text-ash">—</span>
const big = (v: ReactNode) => <span className="num mono" style={{ fontWeight: 600 }}>{v}</span>

function DeltaCell({ delta, mismatchId }: { delta: number | null; mismatchId: string | null }) {
  if (delta == null) return dash
  if (Math.abs(delta) <= 0.5) return <span className="text-moss mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Check size={11} />khớp</span>
  return (
    <span>
      <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700 }}>{fmtDelta(delta)}</span>
      {mismatchId && <> <RecordLink id={mismatchId} danger style={{ fontSize: 11 }} /></>}
    </span>
  )
}

const dateCell = (t: Task) => <div><span className="num">{fmtD(t.filledAt || t.departedAt || t.assignedAt)}</span><div className="caption" style={{ fontSize: 11 }}>{relTime(t.assignedAt)}</div></div>
const byAssigned = (a: Task, b: Task) => a.assignedAt.localeCompare(b.assignedAt)

export default function GalvReconcile() {
  const { data: contracts = [] } = useContracts()
  const { data: diMa = [] } = useTasks({ type: 'di_ma' })
  const { data: giao = [] } = useTasks({ type: 'giao_khach' })
  const [params, setParams] = useSearchParams()
  const { open } = usePeek()
  const { hasRole } = useAuth()
  const now = useNow()
  const [creating, setCreating] = useState(false)

  // chỉ các HĐ đã có chuyến gửi mạ
  const galvContracts = useMemo(() => {
    const ids = new Set(diMa.map((t) => t.contractId))
    return contracts.filter((c) => ids.has(c.id))
  }, [contracts, diMa])
  const hd = params.get('hd')
  const cid = hd && galvContracts.some((c) => c.id === hd) ? hd : null  // null = tất cả hợp đồng
  const { data: g, isLoading } = useContract(cid)
  const pcById = useMemo(() => new Map<string, Weighing>((g?.weighings ?? []).map((p) => [p.id, p])), [g])
  const canAssign = hasRole('admin') // server: chỉ Quản lý giao thẻ

  const sendCols: ColumnsType<Task> = [
    { title: 'Mã thẻ', dataIndex: 'id', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'Ngày', key: 'd', render: (_, t) => dateCell(t) },
    { title: 'Tài xế', dataIndex: 'driver' },
    { title: 'KG cân công ty', key: 'cty', align: 'right', render: (_, t) => {
      const pc = t.refId ? pcById.get(t.refId) : undefined
      return <div>{pc?.kgActual != null ? big(fmtKg(pc.kgActual)) : dash}{pc && <div style={{ fontSize: 11 }}><RecordLink id={pc.id} style={{ color: 'var(--rust)' }} /></div>}</div>
    } },
    { title: 'KG mạ xác nhận', dataIndex: 'kgAtGalv', align: 'right', render: (v: number | null) => (v != null ? big(fmtKg(v)) : miss) },
    { title: 'Chênh', key: 'delta', align: 'right', render: (_, t) => {
      const pc = t.refId ? pcById.get(t.refId) : undefined
      const kgCty = pc?.kgActual ?? null
      return <DeltaCell delta={t.kgAtGalv != null && kgCty != null ? t.kgAtGalv - kgCty : null} mismatchId={t.mismatchId} />
    } },
    { title: 'Trạng thái', dataIndex: 'status', render: (_, t) => <TaskStatusTag t={t} now={now} /> },
  ]
  const pickCols: ColumnsType<Task> = [
    { title: 'Mã thẻ', dataIndex: 'id', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'Ngày', key: 'd', render: (_, t) => dateCell(t) },
    { title: 'Tài xế', dataIndex: 'driver' },
    { title: 'KG ký với mạ', dataIndex: 'kgPicked', align: 'right', render: (v: number | null) => (v != null ? big(fmtKg(v)) : miss) },
    { title: 'KG khách ký', dataIndex: 'kgDelivered', align: 'right', render: (v: number | null) => (v != null ? big(fmtKg(v)) : miss) },
    { title: 'Chênh', key: 'delta', align: 'right', render: (_, t) => (
      <DeltaCell delta={t.kgPicked != null && t.kgDelivered != null ? t.kgDelivered - t.kgPicked : null} mismatchId={t.mismatchId} />) },
    { title: 'Trạng thái', dataIndex: 'status', render: (_, t) => <TaskStatusTag t={t} now={now} /> },
  ]

  const select = (
    <Select value={cid ?? ALL} onChange={(v) => setParams(v === ALL ? {} : { hd: v }, { replace: true })} style={{ minWidth: 320 }}
      showSearch={{ optionFilterProp: 'label' }}
      options={[{ value: ALL, label: `Tất cả hợp đồng (${galvContracts.length})` },
        ...galvContracts.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer}` }))]} />
  )
  const header = (
    <PageHeader title="Đối ứng gửi / nhận mạ kẽm"
      desc={<>Mạ thuê ngoài — không quản lý sản xuất của bên mạ, chỉ đối ứng <b>kg gửi vào = kg lấy ra + kg còn tại mạ</b></>}
      extra={select} />
  )
  if (!cid) return <div>{header}<AllContracts contracts={galvContracts} diMa={diMa} giao={giao} onPick={(id) => setParams({ hd: id }, { replace: true })} /></div>
  if (!g) return <div>{header}{isLoading ? <Skeleton active /> : null}</div>

  const c = g.contract
  const send = [...g.tasksDiMa].sort(byAssigned)
  const pick = [...g.tasksGiao].sort(byAssigned)
  const checks = g.checks.filter((ck) => ck.label.startsWith('GỬI MẠ') || ck.label.startsWith('CÂN XUẤT'))
  const z = g.atGalvKg

  return (
    <div>
      {header}

      <KpiGrid>
        <Kpi tone="steel" label="Đã gửi vào mạ" value={<span className="mono">{fmtKg(g.sentGalvKg)}</span>}
          sub={`${g.tasksDiMa.filter((t) => t.kgAtGalv != null).length} chuyến mạ đã cân xác nhận`} />
        <Kpi tone="amber" label="Đang trên đường tới mạ" value={<span className="mono">{fmtKg(g.inTransitToGalvKg)}</span>}
          sub={g.inTransitToGalvKg > 0 ? 'xe đã nhận/đang chạy, mạ chưa xác nhận cân' : 'không có xe nào đang trên đường'} />
        <Kpi tone="moss" label="Đã lấy ra khỏi mạ" value={<span className="mono">{fmtKg(g.pickedKg)}</span>}
          sub={`${g.tasksGiao.filter((t) => t.kgPicked != null).length} chuyến đã ký nhận với mạ`} />
        <Kpi tone="rust" label="Còn tại xưởng mạ" value={<span className="mono" style={{ color: 'var(--rust-deep)', fontWeight: 800 }}>{fmtKg(z)}</span>}
          sub={z > 0 ? `hàng của HĐ ${c.id} đang nằm tại xưởng mạ` : 'đã lấy hết — không còn hàng tại mạ'} />
      </KpiGrid>

      <div style={panel}>
        <div style={h5}><Scale size={15} /> Kiểm tra đối ứng tự động</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {checks.map((ck) => <CheckLine key={ck.label} ck={ck} onOpen={() => open('hd', c.id)} />)}
        </div>
      </div>

      <div style={panel}>
        <div style={h5}><ArrowRightToLine size={15} /> Từng chuyến GỬI vào mạ <span className="caption" style={{ fontWeight: 400 }}>· {send.length} thẻ đi mạ của {c.id}</span></div>
        <Table<Task> rowKey="id" size="middle" dataSource={send} columns={sendCols} pagination={false} scroll={{ x: 820 }}
          locale={{ emptyText: 'Chưa có chuyến gửi mạ nào.' }}
          rowClassName={(t) => 'clickable-row' + (t.mismatchId ? ' row-alert' : '')} onRow={(t) => ({ onClick: () => open('vc', t.id) })} />
      </div>

      <div style={panel}>
        <div style={h5}><ArrowLeftFromLine size={15} /> Từng chuyến LẤY ra giao khách <span className="caption" style={{ fontWeight: 400 }}>· {pick.length} thẻ giao khách của {c.id}</span></div>
        <Table<Task> rowKey="id" size="middle" dataSource={pick} columns={pickCols} pagination={false} scroll={{ x: 820 }}
          locale={{ emptyText: 'Chưa có chuyến lấy hàng nào từ mạ.' }}
          rowClassName={(t) => 'clickable-row' + (t.mismatchId ? ' row-alert' : '')} onRow={(t) => ({ onClick: () => open('vc', t.id) })} />
      </div>

      <div style={{ ...panel, marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 17, fontWeight: 600 }}>
          <span>Gửi <BalNum>{fmtKg(g.sentGalvKg)}</BalNum></span>
          <span>−</span>
          <span>Lấy <BalNum>{fmtKg(g.pickedKg)}</BalNum></span>
          <span>=</span>
          <span>Còn tại mạ <BalNum color={z > 0 ? 'var(--rust-deep)' : 'var(--moss)'}>{fmtKg(z)}</BalNum></span>
          {z > 0
            ? <span style={{ color: 'var(--rust-deep)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Truck size={14} /> cần điều xe đi lấy</span>
            : <span style={{ color: 'var(--moss)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> đã lấy hết</span>}
          {z > 0 && canAssign && <Button size="small" type="primary" icon={<Truck size={13} />} onClick={() => setCreating(true)} style={{ marginLeft: 'auto' }}>Điều xe đi lấy</Button>}
        </div>
        <p className="caption" style={{ marginTop: 8, marginBottom: 0 }}>
          {z > 0
            ? `Hàng của HĐ ${c.id} còn nằm tại xưởng mạ — sang trang "Thẻ công việc lái xe" bấm "+ Giao việc cho lái xe" (loại Giao khách) để điều xe đi lấy ${fmtKg(z)}.`
            : `Đối ứng gửi/nhận mạ của HĐ ${c.id} đã đóng vòng — mọi kg gửi vào đều đã lấy ra giao khách.`}
        </p>
      </div>

      {canAssign && <CreateTaskModal open={creating} onClose={() => setCreating(false)} initial={{ type: 'giao_khach', contractId: c.id }} />}
    </div>
  )
}

const ALL = '__all__'

interface Row { id: string; customer: string; sent: number; nSent: number; transit: number; picked: number; nPicked: number; delivered: number; left: number; pending: number }

/** Tổng hợp tất cả hợp đồng đã gửi mạ: mỗi dòng = hàng của 1 khách tại mạ (không cộng lẫn). */
function AllContracts({ contracts, diMa, giao, onPick }: {
  contracts: { id: string; customer: string }[]; diMa: Task[]; giao: Task[]; onPick: (id: string) => void
}) {
  const rows: Row[] = contracts.map((c) => {
    const s = diMa.filter((t) => t.contractId === c.id)
    const p = giao.filter((t) => t.contractId === c.id)
    const done = s.filter((t) => t.kgAtGalv != null), got = p.filter((t) => t.kgPicked != null)
    const sent = done.reduce((a, t) => a + (t.kgAtGalv ?? 0), 0)
    const picked = got.reduce((a, t) => a + (t.kgPicked ?? 0), 0)
    return {
      id: c.id, customer: c.customer, sent, nSent: done.length,
      transit: s.filter((t) => t.kgAtGalv == null && t.status !== 'Từ chối').reduce((a, t) => a + t.kgRequired, 0),
      picked, nPicked: got.length, delivered: got.reduce((a, t) => a + (t.kgDelivered ?? 0), 0), left: sent - picked,
      pending: p.filter((t) => t.kgPicked == null && t.status !== 'Từ chối').length,
    }
  }).sort((a, b) => b.left - a.left)
  const sum = (k: 'sent' | 'transit' | 'picked' | 'delivered' | 'left') => rows.reduce((a, r) => a + r[k], 0)
  const cols: ColumnsType<Row> = [
    { title: 'Hợp đồng', dataIndex: 'id', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)' }} /> },
    { title: 'Khách hàng', dataIndex: 'customer' },
    { title: 'Đã gửi vào mạ', key: 'sent', align: 'right', render: (_, r) => <div>{big(fmtKg(r.sent))}<div className="caption" style={{ fontSize: 11 }}>{r.nSent} chuyến</div></div> },
    { title: 'Đang tới mạ', dataIndex: 'transit', align: 'right', render: (v: number) => (v > 0 ? big(fmtKg(v)) : dash) },
    { title: 'Đã lấy ra', key: 'picked', align: 'right', render: (_, r) => <div>{big(fmtKg(r.picked))}<div className="caption" style={{ fontSize: 11 }}>{r.nPicked} chuyến{r.pending ? ` · ${r.pending} đang đi lấy` : ''}</div></div> },
    { title: 'Khách ký nhận', dataIndex: 'delivered', align: 'right', render: (v: number) => big(fmtKg(v)) },
    { title: 'Còn tại mạ', dataIndex: 'left', align: 'right', sorter: (a, b) => a.left - b.left, render: (v: number) => (
      v < -0.5 ? <span className="mono" style={{ color: 'var(--signal)', fontWeight: 800 }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {fmtKg(v)} lấy quá</span>
        : <span className="mono num" style={{ fontWeight: 800, color: v > 0.5 ? 'var(--rust-deep)' : 'var(--moss)' }}>{v > 0.5 ? fmtKg(v) : 'đã lấy hết'}</span>) },
  ]
  return (
    <>
      <KpiGrid>
        <Kpi tone="steel" label="Đã gửi vào mạ" value={<span className="mono">{fmtKg(sum('sent'))}</span>} sub={`${rows.length} hợp đồng · ${rows.reduce((a, r) => a + r.nSent, 0)} chuyến mạ đã cân`} />
        <Kpi tone="amber" label="Đang trên đường tới mạ" value={<span className="mono">{fmtKg(sum('transit'))}</span>} sub="mạ chưa xác nhận cân" />
        <Kpi tone="moss" label="Đã lấy ra khỏi mạ" value={<span className="mono">{fmtKg(sum('picked'))}</span>} sub={`khách ký nhận ${fmtKg(sum('delivered'))}`} />
        <Kpi tone="rust" label="Còn tại xưởng mạ" value={<span className="mono" style={{ color: 'var(--rust-deep)', fontWeight: 800 }}>{fmtKg(sum('left'))}</span>}
          sub={`${rows.filter((r) => r.left > 0.5).length} hợp đồng còn hàng tại mạ`} />
      </KpiGrid>
      <div style={panel}>
        <div style={h5}><Scale size={15} /> Hàng tại mạ theo từng hợp đồng / khách <span className="caption" style={{ fontWeight: 400 }}>· hàng mỗi khách tách riêng, chỉ lấy trong phần của HĐ đó — bấm dòng để xem từng chuyến</span></div>
        <Table<Row> rowKey="id" size="middle" dataSource={rows} columns={cols} pagination={false} scroll={{ x: 900 }}
          locale={{ emptyText: 'Chưa có hợp đồng nào gửi mạ.' }}
          rowClassName={(r) => 'clickable-row' + (r.left < -0.5 ? ' row-alert' : '')} onRow={(r) => ({ onClick: () => onPick(r.id) })}
          summary={() => rows.length > 1 ? (
            <Table.Summary.Row style={{ fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={2}>Tổng {rows.length} hợp đồng</Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{big(fmtKg(sum('sent')))}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{big(fmtKg(sum('transit')))}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{big(fmtKg(sum('picked')))}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{big(fmtKg(sum('delivered')))}</Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">{big(fmtKg(sum('left')))}</Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null} />
      </div>
    </>
  )
}

function BalNum({ children, color }: { children: ReactNode; color?: string }) {
  return <span className="mono num" style={{ fontSize: 24, fontWeight: 800, color }}>{children}</span>
}

function CheckLine({ ck, onOpen }: { ck: CheckT; onOpen: () => void }) {
  const base = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 12.5 }
  if (ck.ok) {
    return (
      <div style={{ ...base, background: 'var(--moss-soft)', color: 'var(--moss)' }}>
        <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
        <span><b>{ck.label}</b> — {ck.aLbl} {fmtKg(ck.a)} = {ck.bLbl} {fmtKg(ck.b)} · khớp tuyệt đối</span>
      </div>
    )
  }
  return (
    <div style={{ ...base, background: 'var(--signal-soft)', color: 'var(--signal)', fontWeight: 700, cursor: 'pointer' }} onClick={onOpen} title="Mở hợp đồng để xem chi tiết đối ứng">
      <AlertTriangle size={15} style={{ flexShrink: 0 }} />
      <span><b>{ck.label}</b> — {ck.aLbl} {fmtKg(ck.a)} vs {ck.bLbl} {fmtKg(ck.b)} · LỆCH {fmtDelta(ck.delta)} — {ck.note}</span>
    </div>
  )
}
