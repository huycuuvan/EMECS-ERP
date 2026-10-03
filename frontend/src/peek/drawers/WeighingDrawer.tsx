/* Drawer Phiếu cân trạm — port ERPPeek.register('pc') trong steel-data.js:
   thông tin cân (lệch đỏ khi vượt dung sai) · ký 3 bên · ảnh phiếu ký tay (xem/tải/ảnh demo/xóa) · nhập kết quả cân · liên kết. */
import { Button } from 'antd'
import { Image as ImageIcon, Info, Link2, Pencil, Scale, Truck, Users } from 'lucide-react'
import { useState } from 'react'
import { useMeta, useTasks, useWeighing, useWeighingPhoto } from '@/api/hooks'
import HistoryBlock from '@/components/HistoryBlock'
import PhotoBlock from '@/components/PhotoBlock'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum, hoursOver } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import EditWeighingModal from '@/pages/weighings/EditWeighingModal'
import { isOverdue, PC_FILL_HOURS, useWeighingActions } from '@/pages/weighings/WeighingModals'
import { C } from '@/theme'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'

export default function WeighingDrawer({ id }: { id: string }) {
  const { data: p, isLoading, isError } = useWeighing(id)
  const { data: meta } = useMeta()
  const { data: tasks = [] } = useTasks()
  const { can } = useAuth()
  const canEdit = can('phieu-can', 'edit')
  const setPhoto = useWeighingPhoto()
  const act = useWeighingActions()
  const pct = meta?.pcTolerancePct ?? 5
  const [editing, setEditing] = useState(false)

  if (!p) return <PeekShell type="pc" id={id} loading={isLoading} notFound={!isLoading && (isError || !p)} />

  const delta = p.kgActual != null ? p.kgActual - p.kgExpected : null
  const bad = !!p.mismatchId
  const devPct = delta != null && p.kgExpected ? (delta / p.kgExpected) * 100 : 0
  const vc = tasks.find((t) => t.refId === p.id)
  const overdue = isOverdue(p)
  const deltaTxt = delta != null ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmtNum(Math.abs(delta))} kg` : ''

  const actions = canEdit && (
    <>
      {p.status === 'Chờ cân' && <Button size="small" type="primary" icon={<Scale size={13} />} onClick={() => act.fill(p)}>Nhập kết quả cân</Button>}
      {p.kgActual != null && !vc && <Button size="small" ghost icon={<Truck size={13} />} onClick={() => act.dispatch(p)}>Điều xe đi mạ</Button>}
      <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setEditing(true)}>Sửa</Button>
    </>
  )

  return (
    <PeekShell type="pc" id={p.id} status={p.status} actions={actions} sub={`HĐ ${p.contractId} · LSX ${p.lsxId}`}>
      <Sec icon={<Info />}>Thông tin cân</Sec>
      <CellGrid>
        <Cell label="Ngày cân" alert={overdue}>
          {fmtDT(p.date)}
          {overdue && <div style={{ fontSize: 11.5 }}>QUÁ HẠN — chờ {hoursOver(p.date)}h (hạn {PC_FILL_HOURS}h)</div>}
        </Cell>
        <Cell label="Người lập">{p.by}</Cell>
        <Cell label="Quản lý giao">{fmtKg(p.kgExpected)}{p.receiptId && <div className="caption" style={{ fontWeight: 400 }}>phiếu chuẩn bị <RecordLink id={p.receiptId} /></div>}</Cell>
        {p.grossKg != null && <Cell label="Xe + hàng">{fmtKg(p.grossKg)}</Cell>}
        {p.tareKg != null && <Cell label="Trọng lượng xe">{fmtKg(p.tareKg)}{p.vehiclePlate && <div className="caption mono" style={{ fontWeight: 400 }}>{p.vehiclePlate}</div>}</Cell>}
        {(p.weighInAt || p.weighOutAt) && <Cell label="Cân vào → cân ra">{p.weighInAt ? fmtDT(p.weighInAt) : '—'} → {p.weighOutAt ? fmtDT(p.weighOutAt) : '—'}</Cell>}
        {p.kgActual != null
          ? <Cell label="Trọng lượng hàng" big alert={bad}>{fmtKg(p.kgActual)}
              <div className="caption" style={{ fontWeight: 600, color: p.approved ? 'var(--moss)' : 'var(--amber)' }}>
                {p.approved ? 'Đã tính vào công nợ' : p.status === 'Lệch — chờ ký' ? 'Chờ Quản lý duyệt mới tính công nợ' : ''}</div></Cell>
          : <Cell label="KL cân thực tế" alert>
            {canEdit ? <a className="text-signal" onClick={() => act.fill(p)}>CHƯA NHẬP</a> : 'CHƯA NHẬP'}
          </Cell>}
        {delta != null && delta !== 0 && (
          <Cell label="Chênh lệch" alert={bad} extra={bad ? <span className="caption">Lệch {devPct > 0 ? '+' : ''}{devPct.toFixed(1)}% — vượt ±{pct}%{p.lossAccepted ? ' · đã chuyển kho ảo' : ''}</span> : <span className="caption">{devPct > 0 ? '+' : ''}{devPct.toFixed(1)}% · trong ±{pct}%</span>}>
            {bad && p.mismatchId ? <RecordLink id={p.mismatchId} danger>{deltaTxt} — {p.mismatchId}</RecordLink> : deltaTxt}
          </Cell>
        )}
      </CellGrid>

      <Sec icon={<Users />}>Ký 3 bên</Sec>
      <CellGrid>
        <Cell label="Bốc xếp">{p.signers.bocXep || '—'}</Cell>
        <Cell label="Thủ kho">{p.signers.kho || '—'}</Cell>
        <Cell label="Lái xe" alert={!p.signers.laiXe && p.kgActual != null}>{p.signers.laiXe || '—'}</Cell>
      </CellGrid>

      <Sec icon={<ImageIcon />}>Ảnh phiếu cân ký tay (bấm ảnh để phóng to)</Sec>
      <PhotoBlock photo={p.photo}
        onChange={canEdit ? (photo) => setPhoto.mutateAsync({ id: p.id, photo }) : undefined}
        demo={{ label: `${p.id} · ${p.contractId}`, kg: p.kgActual ?? p.kgExpected }} />

      <Sec icon={<Link2 />}>Liên kết</Sec>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <RecordLink id={p.lsxId} />
        <RecordLink id={p.contractId} />
        {vc && <span><RecordLink id={vc.id} /> <span className="caption">{vc.status}</span></span>}
        {p.mismatchId && <span><RecordLink id={p.mismatchId} danger /> <span className="caption" style={{ color: C.signal }}>sai lệch</span></span>}
      </div>

      <HistoryBlock type="pc" id={p.id} />

      {act.node}
      {editing && <EditWeighingModal p={p} onClose={() => setEditing(false)} />}
    </PeekShell>
  )
}
