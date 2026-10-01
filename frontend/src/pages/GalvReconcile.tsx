/* 08 — Đối ứng gửi / nhận mạ kẽm: mạ thuê ngoài, chỉ đối ứng kg gửi vào = kg lấy ra + kg còn tại mạ.
   Theo hợp đồng (4 ô tổng + kiểm tra tự động) và theo từng chuyến (cân xuất công ty ↔ cân đến mạ ↔ lấy từ mạ ↔ khách ký). */
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
  const cid = hd && galvContracts.some((c) => c.id === hd) ? hd
    : galvContracts.some((c) => c.id === 'HD-2609-01') ? 'HD-2609-01' : galvContracts[0]?.id
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
    <Select value={cid} onChange={(v) => setParams({ hd: v }, { replace: true })} style={{ minWidth: 320 }} placeholder="Chọn hợp đồng"
      showSearch={{ optionFilterProp: 'label' }} options={galvContracts.map((c) => ({ value: c.id, label: `${c.id} — ${c.customer}` }))} />
  )
  const header = (
    <PageHeader title="Đối ứng gửi / nhận mạ kẽm"
      desc={<>Mạ thuê ngoài — không quản lý sản xuất của bên mạ, chỉ đối ứng <b>kg gửi vào = kg lấy ra + kg còn tại mạ</b></>}
      extra={select} />
  )
  if (!g) return <div>{header}{isLoading || !cid ? <Skeleton active /> : null}{!cid && !isLoading && <p className="caption">Chưa có hợp đồng nào gửi mạ.</p>}</div>

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
