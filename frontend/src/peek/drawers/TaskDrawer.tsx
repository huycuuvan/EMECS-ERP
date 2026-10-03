/* Drawer thẻ công việc lái xe (port ERPPeek.register('vc') của bản demo). */
import { Tag } from 'antd'
import { AlarmClock, Image as ImageIcon, Info, Scale } from 'lucide-react'
import { useMeta, useTask, useTaskPhoto } from '@/api/hooks'
import { useGalvanizers } from '@/api/hooksMaster'
import type { Task } from '@/api/types'
import HistoryBlock from '@/components/HistoryBlock'
import PhotoBlock from '@/components/PhotoBlock'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDelta, fmtDT, fmtKg, relTime } from '@/lib/format'
import TaskActions from '@/pages/tasks/TaskActions'
import { TaskAdminActions } from '@/pages/tasks/TaskEditModals'
import { countdown, hoursOverAt, isOverdue, useNow } from '@/pages/tasks/logic'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'
import LinkPills from './task/LinkPills'

export default function TaskDrawer({ id }: { id: string }) {
  const { data: t, isLoading, isError } = useTask(id)
  const { data: meta } = useMeta()
  const { can } = useAuth()
  const photoM = useTaskPhoto()
  const { data: galvs } = useGalvanizers(can('van-chuyen'))
  const now = useNow()
  if (!t) return <PeekShell type="vc" id={id} loading={isLoading} notFound={isError || !isLoading} />

  const isMa = t.type === 'di_ma'
  const tol = meta?.toleranceKg ?? 30
  const over = isOverdue(t, now)
  const canEdit = can('van-chuyen', 'edit')

  const sub = (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {t.driver} · HĐ {t.contractId} · {fmtKg(t.kgRequired)}
      {over && <Tag variant="filled" className="chip-overdue" style={{ background: 'var(--signal-soft)', color: 'var(--signal)', fontWeight: 700, borderRadius: 999, margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <AlarmClock size={11} />QUÁ HẠN ĐIỀN {hoursOverAt(t.fillDeadline!, now)}h</Tag>}
    </span>
  )

  return (
    <PeekShell type="vc" id={id} status={t.status} sub={sub} actions={<><TaskActions task={t} /><TaskAdminActions task={t} ghost /></>}>
      <Sec icon={<Info />}>Thông tin điều xe</Sec>
      <CellGrid>
        <Cell label="Loại việc">{isMa ? 'Chở hàng đi mạ kẽm' : 'Lấy hàng mạ → giao khách'}</Cell>
        <Cell label="Lái xe">{t.driver}</Cell>
        <Cell label="Xe">{t.vehiclePlate ? <span className="mono" style={{ fontWeight: 700 }}>{t.vehiclePlate}</span> : <span className="text-ash">Chưa gán xe</span>}</Cell>
        {isMa && <Cell label="Xưởng mạ">{galvs?.find((g) => g.id === t.galvanizerId)?.name ?? <span className="text-ash">—</span>}</Cell>}
        <Cell label="Giao việc lúc"><span className="num">{fmtDT(t.assignedAt)}</span></Cell>
        <Cell label="Phải có mặt lúc"><span className="num" style={{ fontWeight: 700 }}>{t.arriveAt ? fmtDT(t.arriveAt) : '—'}</span></Cell>
        {t.deliver && <>
          <Cell label="Giao cho" wide>{t.deliver.name || '—'}<div className="caption" style={{ fontWeight: 400 }}>{t.deliver.address}</div></Cell>
          <Cell label="Người nhận">{t.deliver.receiverName || '—'}{t.deliver.receiverPhone && <div className="caption num" style={{ fontWeight: 400 }}>{t.deliver.receiverPhone}</div>}</Cell>
          <Cell label="Người liên hệ">{t.deliver.contactName || '—'}{t.deliver.contactPhone && <div className="caption num" style={{ fontWeight: 400 }}>{t.deliver.contactPhone}</div>}</Cell>
        </>}
        <Cell label="Xác nhận" alert={t.status === 'Từ chối'}>
          {t.acceptedAt ? `Đồng ý lúc ${fmtDT(t.acceptedAt)}` : t.status === 'Từ chối' ? 'TỪ CHỐI' : `Chờ xác nhận ${relTime(t.assignedAt)}`}
        </Cell>
        {t.rejectReason && <Cell label="Lý do từ chối" wide alert>{t.rejectReason}</Cell>}
        {t.reason && t.status !== 'Hoàn thành' && <Cell label="Lý do lệch (lái xe)" wide alert={t.status === 'Chờ QL duyệt'}>{t.reason}{t.reasonNote ? ` — ${t.reasonNote}` : ''}</Cell>}
        {t.reason && t.status === 'Hoàn thành' && t.approvedBy && <Cell label="Phiếu lệch — đã chấp nhận" wide>{t.reason} · {t.approvedBy}</Cell>}
        {t.qlRejectReason && t.status === 'Đang chạy' && <Cell label="QL không chấp nhận" wide alert>{t.qlRejectReason} — lái xe điền lại</Cell>}
        {t.departedAt && <Cell label="Xuất phát"><span className="num">{fmtDT(t.departedAt)}</span></Cell>}
        {t.fillDeadline && (
          <Cell label="Hạn trả phiếu" alert={over}>
            <span className="num">{fmtDT(t.fillDeadline)}</span>
            {over ? ` — QUÁ HẠN ${hoursOverAt(t.fillDeadline, now)}h`
              : t.filledAt ? <span className="caption" style={{ fontWeight: 500 }}> · đã điền {fmtDT(t.filledAt)}</span>
                : <span className="text-amber" style={{ fontSize: 12 }}> · {countdown(t.fillDeadline, now)}</span>}
          </Cell>
        )}
      </CellGrid>

      <Sec icon={<Scale />}>Đối ứng số cân</Sec>
      <CellGrid>
        <Cell label="KL yêu cầu chở"><span className="num">{fmtKg(t.kgRequired)}</span></Cell>
        {isMa ? <GalvCell t={t} tol={tol} /> : <DeliveryCells t={t} />}
        {t.mismatchId && (
          <Cell label="Biên bản sai lệch" alert wide>
            <RecordLink id={t.mismatchId} danger /> <span className="caption" style={{ fontWeight: 500 }}>— lệch vượt dung sai ±{tol} kg, bắt buộc Quản lý ký xác nhận</span>
          </Cell>
        )}
        {t.lossAccepted && <Cell label="Kho ảo" wide><span className="text-moss">Phần lệch đã được Quản lý cho phép — chuyển kho ảo</span></Cell>}
      </CellGrid>

      <Sec icon={<ImageIcon />}>{isMa ? 'Ảnh phiếu cân xưởng mạ (mạ in, lái xe ký)' : 'Ảnh phiếu giao nhận (ký mạ + ký khách)'}</Sec>
      <PhotoBlock photo={t.photo}
        onChange={canEdit ? (photo) => photoM.mutateAsync({ id: t.id, photo }) : undefined}
        demo={{ label: isMa ? `Phiếu cân xưởng mạ · ${t.id}` : `Phiếu giao nhận · ${t.id}`, kg: (isMa ? t.kgAtGalv : t.kgDelivered) ?? t.kgRequired }}
        emptyText={t.departedAt ? 'Chưa có ảnh đính kèm — bắt buộc chụp phiếu ký tay.' : 'Chưa có ảnh — tài xế tải lên sau khi xuất phát.'} />

      {t.note && <div style={{ marginTop: 10 }}><CellGrid><Cell label="Ghi chú" wide>{t.note}</Cell></CellGrid></div>}

      <LinkPills items={[
        { id: t.contractId },
        { id: t.refId, extra: t.refId?.startsWith('VC') ? 'chuyến gửi mạ' : 'phiếu cân xuất' },
        { id: t.mismatchId, extra: 'sai lệch', danger: true },
      ]} />

      <HistoryBlock type="vc" id={t.id} />
    </PeekShell>
  )
}

function GalvCell({ t, tol }: { t: Task; tol: number }) {
  if (t.kgAtGalv == null) return <Cell label="Số cân bên mạ xác nhận" alert={!!t.departedAt}>CHƯA ĐIỀN</Cell>
  const d = t.kgAtGalv - t.kgRequired
  const bad = Math.abs(d) > tol
  return (
    <>
      <Cell label="Số cân bên mạ xác nhận" alert={bad} big={!bad}><span className="num">{fmtKg(t.kgAtGalv)}</span></Cell>
      {d !== 0 && <Cell label="Chênh lệch" alert={bad}><span className="num">{fmtDelta(d)}</span></Cell>}
    </>
  )
}

function DeliveryCells({ t }: { t: Task }) {
  const d = t.kgPicked != null && t.kgDelivered != null ? t.kgDelivered - t.kgPicked : null
  return (
    <>
      <Cell label="Ký nhận với bên mạ" alert={t.kgPicked == null && !!t.departedAt}>
        {t.kgPicked != null ? <span className="num">{fmtKg(t.kgPicked)}</span> : 'CHƯA ĐIỀN'}
      </Cell>
      <Cell label="Khách ký nhận" alert={t.kgDelivered == null ? !!t.departedAt : t.kgDelivered !== t.kgPicked} big={t.kgDelivered != null && t.kgDelivered === t.kgPicked}>
        {t.kgDelivered != null ? <span className="num">{fmtKg(t.kgDelivered)}</span> : 'CHƯA ĐIỀN'}
      </Cell>
      {d != null && d !== 0 && <Cell label="Khách ký vs mạ ký" alert><span className="num">{fmtDelta(d)}</span></Cell>}
    </>
  )
}
