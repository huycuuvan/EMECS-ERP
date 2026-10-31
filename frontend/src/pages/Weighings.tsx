/* Trạm cân · Phiếu cân — port pages/06-phieu-can.html:
   KPI · danh sách phiếu cân (KL theo lệnh vs KL cân thực, ảnh phiếu, ký 3 bên, quá hạn 4h) ·
   1 quy tắc cho mọi phiếu cân tại trạm: hụt ≤ 5% → Đạt; hụt > 5% hoặc dư → kho nhập lý do, Quản lý Duyệt / Từ chối.
   (±30 kg là dung sai riêng khi xưởng mạ cân nhận / khách ký nhận — xem Thẻ lái xe, không áp ở trạm cân.)
   tạo phiếu cân xuất từ LSX/PTN · nhập kết quả cân · điều xe đi mạ.
   31/10 (anh Thắng: trạng thái trạm cân chưa rõ): mỗi phiếu hiện hành trình KL — trên xe (cân trạm) → mạ cân → khách ký
   (giao khách tính theo hợp đồng); dải tổng theo chặng ở đầu trang theo bộ lọc hợp đồng. */
import { Button, Card, Input, Select, Table, Tooltip, type TableColumnsType } from 'antd'
import { Image as ImageIcon, ImageOff, Info, Scale, Search, Truck } from 'lucide-react'
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useContracts, useMeta, useTasks, useWeighings } from '@/api/hooks'
import type { Task, Weighing } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum, fmtT, hoursOver, relTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'
import { WeighActions, WeighResult } from './receipts/WeighApproval'
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
  const taskOf = (pcId: string) => tasks.find((t) => t.type === 'di_ma' && t.refId === pcId)
  const hdOptions = useMemo(() => {
    const seen = new Set<string>()
    all.forEach((p) => seen.add(p.contractId))
    return [...seen].map((id) => ({ value: id, label: id + (cmap[id] ? ` — ${cmap[id].customer}` : '') }))
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
    { title: 'Hành trình KL (trên xe → mạ cân)', key: 'trip', width: 210, render: (_, p) => <TripCell p={p} t={taskOf(p.id)} /> },
    { title: 'KL theo lệnh xuất', key: 'exp', align: 'right', render: (_, p) => <span className="mono num" style={{ fontWeight: 600 }}>{fmtKg(p.kgExpected)}</span> },
    {
      title: 'KL cân thực', key: 'act', align: 'right',
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
      title: 'Trạng thái cân', key: 'st',
      render: (_, p) => (p.kgActual != null && p.status !== 'Lệch — chờ ký' ? <WeighResult p={p} /> : (
        <div>
          <StatusTag status={p.status} style={p.status === 'Lệch — chờ ký' ? { animation: 'blink-signal 1.6s ease-in-out infinite' } : undefined} />
          {p.status === 'Lệch — chờ ký' && p.mismatchId && (
            <div style={sub}><RecordLink id={p.mismatchId} danger style={{ fontSize: 11 }}>Biên bản {p.mismatchId}</RecordLink></div>
          )}
        </div>
      )),
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

/* ---------------------------------------------------------------- hành trình khối lượng */
const tripLine = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, lineHeight: 1.6 } as const

/** 1 phiếu cân: KL trên xe (số cân trạm) → KL mạ cân nhận (thẻ đi mạ) kèm chênh / trạng thái chuyến. */
function TripCell({ p, t }: { p: Weighing; t?: Task }) {
  const onTruck = p.kgActual ?? null
  let ma: ReactNode
  if (onTruck == null) ma = <span className="text-ash">chưa cân</span>
  else if (!t) ma = <span className="text-ash">chưa điều xe</span>
  else if (t.kgAtGalv == null) ma = <span style={{ color: C.amber, fontWeight: 600 }}>{t.status === 'Đang chạy' ? 'đang trên xe tới mạ' : `xe chưa xuất phát (${t.driver})`}</span>
  else {
    const d = t.kgAtGalv - (t.kgRequired || onTruck)
    ma = <span><b className="num">{fmtKg(t.kgAtGalv)}</b>{Math.abs(d) > 0.5 && <span className="num" style={{ color: t.status === 'Hoàn thành' ? C.ash : C.signal, marginLeft: 4 }}>({d > 0 ? '+' : '−'}{fmtNum(Math.abs(d))})</span>}
      {t.status === 'Chờ QL duyệt' && <div style={{ color: C.amber, fontWeight: 600 }}>chờ QL duyệt</div>}</span>
  }
  return (
    <div style={{ minWidth: 180 }}>
      <div style={tripLine}><span className="text-ash">Trên xe</span>{onTruck != null ? <b className="num">{fmtKg(onTruck)}</b> : <span className="text-ash">—</span>}</div>
      <div style={tripLine}><span className="text-ash">Mạ cân</span><span style={{ textAlign: 'right' }}>{ma}</span></div>
    </div>
  )
}

/** Dải tổng theo chặng (theo bộ lọc hợp đồng): cân xuất lên xe → đang trên xe tới mạ → mạ cân nhận → lấy từ mạ → khách ký nhận. */
function LegStrip({ tasks, weighings, contractId }: { tasks: Task[]; weighings: Weighing[]; contractId: string }) {
  const inHd = <T extends { contractId: string }>(x: T) => !contractId || x.contractId === contractId
  const ws = weighings.filter(inHd)
  const diMa = tasks.filter((t) => t.type === 'di_ma' && t.status !== 'Từ chối' && inHd(t))
  const giao = tasks.filter((t) => t.type === 'giao_khach' && t.status !== 'Từ chối' && inHd(t))
  const sum = <T,>(arr: T[], f: (x: T) => number | null | undefined) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)
  const legs = [
    { label: 'Cân xuất lên xe', v: sum(ws, (p) => p.kgActual), cap: `${ws.filter((p) => p.kgActual != null).length} phiếu đã cân tại trạm`, color: C.ink },
    { label: 'Đang trên xe tới mạ', v: sum(diMa.filter((t) => t.kgAtGalv == null), (t) => t.kgRequired), cap: `${diMa.filter((t) => t.kgAtGalv == null).length} chuyến mạ chưa cân nhận`, color: C.amber },
    { label: 'KL cân bên mạ', v: sum(diMa, (t) => t.kgAtGalv), cap: `mạ xác nhận · ${diMa.filter((t) => t.status === 'Chờ QL duyệt').length} phiếu lệch chờ QL duyệt`, color: C.rust },
    { label: 'Lấy từ mạ (ký với mạ)', v: sum(giao, (t) => t.kgPicked), cap: `${giao.filter((t) => t.kgPicked != null).length} chuyến giao khách`, color: C.steel },
    { label: 'KL cân giao cho khách', v: sum(giao, (t) => t.kgDelivered), cap: 'khách ký nhận — tính công nợ', color: C.moss },
  ]
  return (
    <Card styles={{ body: { padding: 14 } }} style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        Khối lượng theo chặng {contractId ? <>— HĐ <RecordLink id={contractId} style={{ color: C.rust }} /></> : '— tất cả hợp đồng'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {legs.map((l, i) => (
          <div key={l.label} style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: '8px 12px', background: 'var(--paper)', position: 'relative' }}>
            <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ash }}>{i + 1}. {l.label}</div>
            <div className="mono num" style={{ fontSize: 15, fontWeight: 700, color: l.color, marginTop: 2 }}>{fmtKg(l.v)}</div>
            <div style={{ fontSize: 11, color: C.ash }}>{l.cap}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}
