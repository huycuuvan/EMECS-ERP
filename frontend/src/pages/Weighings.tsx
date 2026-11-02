/* Trạm cân · Phiếu cân — port pages/06-phieu-can.html:
   KPI · danh sách phiếu cân (KL theo lệnh vs KL cân thực, ảnh phiếu, ký 3 bên, quá hạn 4h) ·
   1 quy tắc cho mọi phiếu cân tại trạm: hụt ≤ 5% → Đạt; hụt > 5% hoặc dư → kho nhập lý do, Quản lý Duyệt / Từ chối.
   (±30 kg là dung sai riêng khi xưởng mạ cân nhận / khách ký nhận — xem Thẻ lái xe, không áp ở trạm cân.)
   tạo phiếu cân xuất từ LSX/PTN · nhập kết quả cân · điều xe đi mạ.
   02/11 (anh Thắng): bỏ cột trạng thái cân; mỗi phiếu có cột Cân tại mạ + Cân giao khách để thấy nguồn gốc đi hàng của
   từng đơn (giao khách lấy hàng của HĐ tại mạ, phân bổ theo thứ tự chuyến: chuyến đến mạ trước giao trước); dải tổng
   theo chặng: chờ cân → cân tại xưởng → đang trên xe tới mạ (đã cân xưởng, mạ chưa cân) → cân tại mạ → giao khách. */
import { Button, Card, Input, Select, Table, Tooltip, type TableColumnsType } from 'antd'
import { Image as ImageIcon, ImageOff, Info, Scale, Search, Truck } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { useContracts, useMeta, useTasks, useWeighings } from '@/api/hooks'
import type { Task, Weighing } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum, fmtT, hoursOver, relTime, custOrder } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'
import { WeighActions } from './receipts/WeighApproval'
import { isMissing, isOverdue, PC_FILL_HOURS, useWeighingActions } from './weighings/WeighingModals'

const sub = { color: C.ash, fontSize: 11, marginTop: 2 }
const sameMonth = (iso?: string | null) => {
  if (!iso) return false
  const d = new Date(iso), n = new Date()
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}

export default function Weighings() {
  const { open } = usePeek()
  const { can, hasRole } = useAuth()
  const isQl = hasRole('admin')
  const canEdit = can('phieu-can', 'edit')
  const { data: meta } = useMeta()
  const pct = meta?.pcTolerancePct ?? 5
  const { data: all = [], isLoading } = useWeighings()
  const { data: contracts = [] } = useContracts()
  const { data: tasks = [] } = useTasks()
  const act = useWeighingActions()
  const [q, setQ] = useState('')
  const [fh, setFh] = useState('')
  const [fs, setFs] = useState('')

  const cmap = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c])), [contracts])
  const taskOf = (pcId: string) => tasks.find((t) => t.type === 'di_ma' && t.refId === pcId && t.status !== 'Từ chối')
  const giaoOf = useMemo(() => allocDelivered(all, tasks), [all, tasks])
  const hdOptions = useMemo(() => {
    const seen = new Set<string>()
    all.forEach((p) => seen.add(p.contractId))
    return [...seen].map((id) => ({ value: id, label: id + (cmap[id] ? ` — ${custOrder(cmap[id])}` : '') }))
  }, [all, cmap])

  const rows = useMemo(() => [...all].sort((a, b) => (b.date || '').localeCompare(a.date || '')).filter((p) => {
    if (fh && p.contractId !== fh) return false
    if (fs === 'miss') { if (!isMissing(p)) return false } else if (fs === 'overdue') { if (!isOverdue(p)) return false } else if (fs === 'Chờ QL duyệt') { if (!waitQl(p)) return false } else if (fs && p.status !== fs) return false
    if (q && `${p.id} ${p.contractId} ${p.lsxId} ${p.by || ''}`.toLowerCase().indexOf(q.toLowerCase()) < 0) return false
    return true
  }), [all, fh, fs, q])

  /* KPI */
  const doneMonth = all.filter((p) => p.kgActual != null && sameMonth(p.date))
  const kgMonth = doneMonth.reduce((s, p) => s + Number(p.kgActual), 0)
  const waitQl = (p: Weighing) => p.status === 'Chờ QL duyệt' || p.status === 'Lệch — chờ ký'  // 'Lệch — chờ ký': phiếu cũ trước khi gộp quy tắc
  const lech = all.filter(waitQl).length
  const miss = all.filter(isMissing).length
  const overdue = all.filter(isOverdue).length

  const stop = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f() }

  const columns: TableColumnsType<Weighing> = [
    { title: 'Mã phiếu', key: 'id', render: (_, p) => <span className="mono" style={{ fontWeight: 600 }}>{p.id}</span> },
    {
      title: 'Ngày', key: 'date',
      render: (_, p) => {
        const od = isOverdue(p)
        return (
          <div className={od ? 'text-signal' : undefined}>
            <span className="num">{fmtDT(p.date)}</span>
            <div style={{ ...sub, ...(od ? { color: C.signal, fontWeight: 700 } : {}) }}>
              {od ? <a className="text-signal" onClick={stop(() => open('pc', p.id))}>QUÁ HẠN · chờ {hoursOver(p.date)}h (hạn {PC_FILL_HOURS}h)</a> : relTime(p.date)}
            </div>
          </div>
        )
      },
    },
    { title: 'Hợp đồng', key: 'hd', render: (_, p) => <RecordLink id={p.contractId} style={{ color: C.rust, fontSize: 12 }} /> },
    { title: 'Lệnh SX', key: 'lsx', render: (_, p) => <RecordLink id={p.lsxId} style={{ color: C.rust, fontSize: 12 }} /> },
    { title: 'KL theo lệnh xuất', key: 'exp', align: 'right', render: (_, p) => <span className="mono num" style={{ fontWeight: 600 }}>{fmtKg(p.kgExpected)}</span> },
    {
      title: 'KL cân tại xưởng (lên xe)', key: 'act', align: 'right',
      render: (_, p) => {
        if (p.kgActual == null) return <span className="text-signal" style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: '.04em' }}>CHƯA CÂN</span>
        const bad = p.status !== 'Đã cân'
        return <span className="mono num" style={{ fontWeight: bad ? 800 : 600, color: bad ? C.signal : undefined }}>{fmtKg(p.kgActual)}</span>
      },
    },
    {
      title: 'Chênh', key: 'delta', align: 'right',
      render: (_, p) => {
        if (p.kgActual == null) return <span style={sub}>—</span>
        const d = p.kgActual - p.kgExpected
        if (d === 0) return <span className="mono text-moss">±0</span>
        const dev = p.kgExpected ? (d / p.kgExpected) * 100 : 0
        const bad = d > 0 || -dev > pct  // dư, hoặc hụt quá 5%
        const txt = `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))} kg`
        const pctTxt = <div style={sub}>{dev > 0 ? '+' : ''}{dev.toFixed(1)}%</div>
        if (!bad) return <span className="mono text-moss">{txt}{pctTxt}</span>
        return p.mismatchId
          ? <RecordLink id={p.mismatchId} danger style={{ fontWeight: 700 }}>{txt}</RecordLink>
          : <span className="mono text-signal" style={{ fontWeight: 700 }}>{txt}{pctTxt}</span>
      },
    },
    {
      title: 'Cân tại mạ', key: 'ma', align: 'right', width: 130,
      render: (_, p) => <MaCell p={p} t={taskOf(p.id)} />,
    },
    {
      title: 'Cân giao khách', key: 'giao', align: 'right', width: 130,
      render: (_, p) => {
        const a = giaoOf[p.id]
        if (!a) return <span style={sub}>—</span>
        return <span>{a.kg > 0.5 ? <b className="mono num">{fmtKg(a.kg)}</b> : <span style={sub}>chưa giao</span>}
          {a.left > 0.5 && <div style={sub}>còn tại mạ {fmtKg(a.left)}</div>}</span>
      },
    },
    {
      title: 'Ảnh phiếu ký 3 bên', key: 'photo',
      render: (_, p) => (p.hasPhoto
        ? <Tooltip title="Bấm dòng để xem ảnh phiếu"><span className="text-moss" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}><ImageIcon size={13} /> Đã có ảnh</span></Tooltip>
        : <span className="text-signal" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}><ImageOff size={12} /> Thiếu ảnh</span>),
    },
    {
      title: 'Người cân · lái xe', key: 'sign',
      render: (_, p) => (
        <div style={{ fontSize: 10.5, color: C.ash, lineHeight: 1.5 }}>
          Kho cân: <b style={{ color: C.ink, fontWeight: 600 }}>{p.kgActual != null ? p.signers.kho || '—' : '—'}</b><br />
          Lái xe: {p.signers.laiXe ? <b style={{ color: C.ink, fontWeight: 600 }}>{p.signers.laiXe}</b> : <b className="text-signal">—</b>}
        </div>
      ),
    },
    {
      title: '', key: 'ops',
      render: (_, p) => {
        if (p.status === 'Chờ QL duyệt') return isQl ? <WeighActions p={p} /> : <span style={sub}>Chờ Quản lý duyệt</span>
        if (p.status === 'Chờ cân' || p.status === 'QL từ chối') return canEdit
          ? <Button size="small" type="primary" icon={<Scale size={11} />} onClick={stop(() => act.fill(p))}>{p.status === 'QL từ chối' ? 'Cân lại' : 'Nhập kết quả cân'}</Button>
          : null
        if (p.kgActual == null) return null
        const t = taskOf(p.id)
        if (t) return <RecordLink id={t.id} style={{ color: C.rust, fontSize: 11 }}><Truck size={11} style={{ verticalAlign: -2 }} /> {t.id}</RecordLink>
        // giao việc cho lái xe là việc của Quản lý (kho không điều xe)
        return isQl ? <Button size="small" icon={<Truck size={11} />} onClick={stop(() => act.dispatch(p))}>Điều xe đi mạ</Button> : null
      },
    },
  ]

  return (
    <div>
      <PageHeader title="Phiếu cân xuất hàng — ký 3 bên"
        desc={`Mọi chuyến xe rời công ty phải qua trạm cân: số kg thực + ảnh phiếu có chữ ký Bốc xếp · Thủ kho · Lái xe. Hụt ≤ ${pct}% → Đạt; hụt > ${pct}% hoặc dư → kho ghi lý do, Quản lý duyệt. (±30 kg chỉ áp khi xưởng mạ / khách cân nhận.)`}
        extra={<>
          <ExportButton kind="weighings" params={{ contract_id: fh, status: fs }} ids={rows.map((p) => p.id)} total={all.length} />
          {canEdit && <Button type="primary" icon={<Scale size={14} />} onClick={() => act.create()}>+ Phiếu cân xuất</Button>}
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Phiếu đã cân tháng" value={doneMonth.length} sub="chuyến xe đã qua trạm cân" />
        <Kpi tone="moss" label="Tổng kg cân xuất" value={fmtT(kgMonth)} sub="khối lượng thực cân trong tháng" />
        <Kpi tone="signal" label="Chờ Quản lý duyệt" value={<span className="text-signal">{lech}</span>} onClick={() => setFs('Chờ QL duyệt')}
          sub={<span className="text-signal">hụt quá {pct}% hoặc dư so với lệnh xuất</span>} />
        <Kpi tone="signal" label="Thiếu ảnh / số cân" value={<span className="text-signal">{miss}</span>} onClick={() => setFs('miss')}
          sub={<span className="text-signal">phiếu chưa đủ số kg + ảnh ký 3 bên{overdue > 0 && <> · <a className="text-signal" style={{ fontWeight: 700, textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); setFs('overdue') }}>{overdue} quá hạn {PC_FILL_HOURS}h</a></>}</span>} />
      </KpiGrid>

      <LegStrip tasks={tasks} weighings={all} contractId={fh} />

      <Card styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color={C.ash} />} placeholder="Tìm mã phiếu, hợp đồng, lệnh SX..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, borderRadius: 999 }} />
          <Select value={fh} onChange={setFh} style={{ minWidth: 220 }} options={[{ value: '', label: 'Tất cả hợp đồng' }, ...hdOptions]} />
          <Select value={fs} onChange={setFs} style={{ minWidth: 190 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              ...['Chờ cân', 'Đã cân', 'Chờ QL duyệt', 'QL từ chối'].map((s) => ({ value: s, label: s })),
              { value: 'miss', label: 'Thiếu ảnh / số cân' },
              { value: 'overdue', label: `Quá hạn ${PC_FILL_HOURS}h` },
            ]} />
        </div>
        <Table<Weighing> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 1460 }}
          locale={{ emptyText: 'Không có phiếu cân phù hợp bộ lọc.' }}
          rowClassName={(p) => 'clickable-row' + (isOverdue(p) || waitQl(p) ? ' row-alert' : '')}
          onRow={(p) => ({ onClick: () => open('pc', p.id) })} />
      </Card>

      <p className="caption" style={{ marginTop: 12 }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> Bấm dòng để mở <b>phiếu cân</b> (trượt từ phải). Số cân xuất tại công ty phải khớp số cân đến xưởng mạ từng chuyến — xe tối đa <b>10 tấn/chuyến</b>.
      </p>

      {act.node}
    </div>
  )
}

/* ---------------------------------------------------------------- khối lượng theo chặng */
/** Cân tại mạ của 1 phiếu: số mạ cân nhận (kèm chênh) hoặc trạng thái chuyến khi mạ chưa cân. */
function MaCell({ p, t }: { p: Weighing; t?: Task }) {
  if (p.kgActual == null) return <span style={sub}>chưa cân tại xưởng</span>
  if (!t) return <span style={sub}>chưa điều xe</span>
  if (t.kgAtGalv == null)
    return <span style={{ color: C.amber, fontWeight: 600, fontSize: 11.5 }}>{t.status === 'Đang chạy' ? 'đang trên xe tới mạ' : 'xe chưa xuất phát'}</span>
  const d = t.kgAtGalv - p.kgActual
  return (
    <span>
      <b className="mono num">{fmtKg(t.kgAtGalv)}</b>
      {Math.abs(d) > 0.5 && <div style={{ ...sub, color: t.status === 'Hoàn thành' ? C.ash : C.signal }}>{d > 0 ? '+' : '−'}{fmtNum(Math.abs(d))} kg so với xưởng</div>}
      {t.status === 'Chờ QL duyệt' && <div style={{ ...sub, color: C.amber, fontWeight: 600 }}>chờ QL duyệt</div>}
    </span>
  )
}

/** Giao khách lấy hàng của HĐ tại mạ (không theo chuyến) → phân bổ KL khách ký nhận của HĐ lần lượt cho các chuyến
    đã cân tại mạ, chuyến đến mạ trước giao trước. Trả về {mã phiếu cân: {kg đã giao, kg còn tại mạ}}. */
function allocDelivered(ws: Weighing[], tasks: Task[]) {
  const out: Record<string, { kg: number; left: number }> = {}
  // còn tại mạ tính theo số LẤY khỏi mạ (lệch lấy ↔ khách ký đã vào kho ảo, không phải hàng còn tại mạ)
  const byHd = new Map<string, number>(), pickHd = new Map<string, number>()
  tasks.filter((t) => t.type === 'giao_khach' && t.kgDelivered != null).forEach((t) => {
    byHd.set(t.contractId, (byHd.get(t.contractId) ?? 0) + Number(t.kgDelivered))
    pickHd.set(t.contractId, (pickHd.get(t.contractId) ?? 0) + Number(t.kgPicked ?? t.kgDelivered))
  })
  const trips = ws.map((p) => ({ p, t: tasks.find((t) => t.type === 'di_ma' && t.refId === p.id && t.kgAtGalv != null) }))
    .filter((x): x is { p: Weighing; t: Task } => !!x.t)
    .sort((a, b) => (a.t.filledAt || a.p.date || '').localeCompare(b.t.filledAt || b.p.date || ''))
  for (const { p, t } of trips) {
    const ma = Number(t.kgAtGalv)
    const rest = byHd.get(p.contractId) ?? 0, prest = pickHd.get(p.contractId) ?? 0
    const kg = Math.min(rest, ma), picked = Math.min(prest, ma)
    byHd.set(p.contractId, rest - kg)
    pickHd.set(p.contractId, prest - picked)
    out[p.id] = { kg, left: ma - picked }
  }
  return out
}

/** Dải tổng theo chặng (theo bộ lọc hợp đồng). */
function LegStrip({ tasks, weighings, contractId }: { tasks: Task[]; weighings: Weighing[]; contractId: string }) {
  const inHd = <T extends { contractId: string }>(x: T) => !contractId || x.contractId === contractId
  const ws = weighings.filter(inHd)
  const weighed = new Set(ws.filter((p) => p.kgActual != null).map((p) => p.id))
  const diMa = tasks.filter((t) => t.type === 'di_ma' && t.status !== 'Từ chối' && inHd(t))
  const giao = tasks.filter((t) => t.type === 'giao_khach' && t.status !== 'Từ chối' && inHd(t))
  const sum = <T,>(arr: T[], f: (x: T) => number | null | undefined) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)
  const waiting = ws.filter((p) => p.kgActual == null)
  // trên xe tới mạ = ĐÃ cân tại xưởng, mạ CHƯA cân (lệnh mới giao, xe chưa đóng hàng thì chưa tính)
  const onTruck = diMa.filter((t) => t.kgAtGalv == null && (!t.refId || weighed.has(t.refId)))
  const legs = [
    { label: 'Khối lượng chờ cân', v: sum(waiting, (p) => p.kgExpected), cap: `${waiting.length} lệnh chuẩn bị hàng chưa cân tại xưởng`, color: C.steel },
    { label: 'Đã cân tại xưởng (lên xe)', v: sum(ws, (p) => p.kgActual), cap: `${weighed.size} phiếu đã cân tại trạm`, color: C.ink },
    { label: 'Đang trên xe tới mạ', v: sum(onTruck, (t) => t.kgRequired), cap: `${onTruck.length} chuyến đã cân xưởng, mạ chưa cân`, color: C.amber },
    { label: 'Cân tại mạ', v: sum(diMa, (t) => t.kgAtGalv), cap: `mạ xác nhận${diMa.some((t) => t.status === 'Chờ QL duyệt') ? ` · ${diMa.filter((t) => t.status === 'Chờ QL duyệt').length} phiếu lệch chờ QL duyệt` : ''}`, color: C.rust },
    { label: 'Cân giao khách', v: sum(giao, (t) => t.kgDelivered), cap: `khách ký nhận · lấy từ mạ ${fmtKg(sum(giao, (t) => t.kgPicked))}`, color: C.moss },
  ]
  return (
    <Card styles={{ body: { padding: 14 } }} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        Khối lượng theo chặng {contractId ? <>— HĐ <RecordLink id={contractId} style={{ color: C.rust }} /></> : '— tất cả hợp đồng'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {legs.map((l, i) => (
          <div key={l.label} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '8px 12px', background: 'var(--paper)' }}>
            <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ash }}>{i + 1}. {l.label}</div>
            <div className="mono num" style={{ fontSize: 15, fontWeight: 700, color: l.color, marginTop: 2 }}>{fmtKg(l.v)}</div>
            <div style={{ fontSize: 11, color: C.ash }}>{l.cap}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
