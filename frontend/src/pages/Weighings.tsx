/* Trạm cân · Phiếu cân — port pages/06-phieu-can.html:
   KPI · danh sách phiếu cân (KL theo lệnh vs KL cân thực, chênh đỏ khi vượt dung sai, ảnh phiếu, ký 3 bên, quá hạn 4h) ·
   tạo phiếu cân xuất từ LSX/PTN · nhập kết quả cân · điều xe đi mạ. */
import { Button, Card, Input, Select, Table, Tooltip, type TableColumnsType } from 'antd'
import { Image as ImageIcon, ImageOff, Info, Scale, Search, Truck } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { useContracts, useMeta, useTasks, useWeighings } from '@/api/hooks'
import type { Weighing } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum, fmtT, hoursOver, relTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'
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
  const tol = meta?.toleranceKg ?? 30
  const { data: all = [], isLoading } = useWeighings()
  const { data: contracts = [] } = useContracts()
  const { data: tasks = [] } = useTasks({ type: 'di_ma' })
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
    if (fs === 'miss') { if (!isMissing(p)) return false } else if (fs === 'overdue') { if (!isOverdue(p)) return false } else if (fs && p.status !== fs) return false
    if (q && `${p.id} ${p.contractId} ${p.lsxId} ${p.by || ''}`.toLowerCase().indexOf(q.toLowerCase()) < 0) return false
    return true
  }), [all, fh, fs, q])

  /* KPI */
  const doneMonth = all.filter((p) => p.kgActual != null && sameMonth(p.date))
  const kgMonth = doneMonth.reduce((s, p) => s + Number(p.kgActual), 0)
  const lech = all.filter((p) => p.status === 'Lệch — chờ ký').length
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
      title: 'KL cân thực', key: 'act', align: 'right',
      render: (_, p) => {
        if (p.kgActual == null) return <span className="text-signal" style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: '.04em' }}>CHƯA CÂN</span>
        const bad = Math.abs(p.kgActual - p.kgExpected) > tol
        return <span className="mono num" style={{ fontWeight: bad ? 800 : 600, color: bad ? C.signal : undefined }}>{fmtKg(p.kgActual)}</span>
      },
    },
    {
      title: 'Chênh', key: 'delta', align: 'right',
      render: (_, p) => {
        if (p.kgActual == null) return <span style={sub}>—</span>
        const d = p.kgActual - p.kgExpected
        if (d === 0) return <span className="mono text-moss">±0</span>
        const bad = Math.abs(d) > tol
        const txt = `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))} kg`
        if (!bad) return <span className="mono text-moss">{txt}</span>
        return p.mismatchId
          ? <RecordLink id={p.mismatchId} danger style={{ fontWeight: 700 }}>{txt}</RecordLink>
          : <span className="mono text-signal" style={{ fontWeight: 700 }}>{txt}</span>
      },
    },
    {
      title: 'Ảnh phiếu', key: 'photo',
      render: (_, p) => (p.hasPhoto
        ? <Tooltip title="Bấm dòng để xem ảnh phiếu"><span className="text-moss" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}><ImageIcon size={13} /> Đã có ảnh</span></Tooltip>
        : <span className="text-signal" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}><ImageOff size={12} /> Thiếu ảnh</span>),
    },
    {
      title: 'Ký 3 bên', key: 'sign',
      render: (_, p) => (
        <div style={{ fontSize: 10.5, color: C.ash, lineHeight: 1.5 }}>
          Bốc xếp: <b style={{ color: C.ink, fontWeight: 600 }}>{p.signers.bocXep || '—'}</b><br />
          Kho: <b style={{ color: C.ink, fontWeight: 600 }}>{p.signers.kho || '—'}</b><br />
          Lái xe: {p.signers.laiXe ? <b style={{ color: C.ink, fontWeight: 600 }}>{p.signers.laiXe}</b> : <b className="text-signal">—</b>}
        </div>
      ),
    },
    {
      title: 'Trạng thái', key: 'st',
      render: (_, p) => (
        <div>
          <StatusTag status={p.status} style={p.status === 'Lệch — chờ ký' ? { animation: 'blink-signal 1.6s ease-in-out infinite' } : undefined} />
          {p.status === 'Lệch — chờ ký' && p.mismatchId && (
            <div style={sub}><RecordLink id={p.mismatchId} danger style={{ fontSize: 11 }}>Biên bản {p.mismatchId}</RecordLink></div>
          )}
        </div>
      ),
    },
    {
      title: '', key: 'ops',
      render: (_, p) => {
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
        desc={`Mọi chuyến xe rời công ty phải qua trạm cân: số kg thực + ảnh phiếu có chữ ký Bốc xếp · Thủ kho · Lái xe. Lệch quá ±${tol} kg → báo động sai lệch.`}
        extra={<>
          <ExportButton kind="weighings" params={{ contract_id: fh, status: fs }} ids={rows.map((p) => p.id)} total={all.length} />
          {canEdit && <Button type="primary" icon={<Scale size={14} />} onClick={() => act.create()}>+ Phiếu cân xuất</Button>}
        </>} />

      <KpiGrid>
        <Kpi tone="steel" label="Phiếu đã cân tháng" value={doneMonth.length} sub="chuyến xe đã qua trạm cân" />
        <Kpi tone="moss" label="Tổng kg cân xuất" value={fmtT(kgMonth)} sub="khối lượng thực cân trong tháng" />
        <Kpi tone="signal" label="Phiếu lệch" value={<span className="text-signal">{lech}</span>} onClick={() => setFs('Lệch — chờ ký')}
          sub={<span className="text-signal">lệch quá ±{tol} kg — chờ Quản lý ký</span>} />
        <Kpi tone="signal" label="Thiếu ảnh / số cân" value={<span className="text-signal">{miss}</span>} onClick={() => setFs('miss')}
          sub={<span className="text-signal">phiếu chưa đủ số kg + ảnh ký 3 bên{overdue > 0 && <> · <a className="text-signal" style={{ fontWeight: 700, textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); setFs('overdue') }}>{overdue} quá hạn {PC_FILL_HOURS}h</a></>}</span>} />
      </KpiGrid>

      <Card styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color={C.ash} />} placeholder="Tìm mã phiếu, hợp đồng, lệnh SX..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, borderRadius: 999 }} />
          <Select value={fh} onChange={setFh} style={{ minWidth: 220 }} options={[{ value: '', label: 'Tất cả hợp đồng' }, ...hdOptions]} />
          <Select value={fs} onChange={setFs} style={{ minWidth: 190 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              ...['Chờ cân', 'Đã cân', 'Lệch — chờ ký'].map((s) => ({ value: s, label: s })),
              { value: 'miss', label: 'Thiếu ảnh / số cân' },
              { value: 'overdue', label: `Quá hạn ${PC_FILL_HOURS}h` },
            ]} />
        </div>
        <Table<Weighing> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 1250 }}
          locale={{ emptyText: 'Không có phiếu cân phù hợp bộ lọc.' }}
          rowClassName={(p) => 'clickable-row' + (isOverdue(p) || p.status === 'Lệch — chờ ký' ? ' row-alert' : '')}
          onRow={(p) => ({ onClick: () => open('pc', p.id) })} />
      </Card>

      <p className="caption" style={{ marginTop: 12 }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> Bấm dòng để mở <b>phiếu cân</b> (trượt từ phải). Số cân xuất tại công ty phải khớp số cân đến xưởng mạ từng chuyến — xe tối đa <b>10 tấn/chuyến</b>.
      </p>

      {act.node}
    </div>
  )
}
