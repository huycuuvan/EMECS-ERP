/* Drawer bút toán kho ảo chênh lệch — chỉ xem (kho ảo chỉ để thống kê). */
import { Archive } from 'lucide-react'
import { useVloss } from '@/api/hooks'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { fmtDT, fmtKg } from '@/lib/format'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'
import LinkPills from './task/LinkPills'

export default function VlossDrawer({ id }: { id: string }) {
  const { data: e, isLoading, isError } = useVloss(id)
  if (!e) return <PeekShell type="vk" id={id} loading={isLoading} notFound={isError || !isLoading} />

  const kg = Math.abs(e.kg)

  return (
    <PeekShell type="vk" id={id} status={e.status} sub={`${e.source} · ${fmtKg(kg)}`}>
      <Sec icon={<Archive />}>Nội dung bút toán</Sec>
      <CellGrid>
        <Cell label="Nguồn chênh lệch">{e.source}</Cell>
        <Cell label="Phiếu gốc"><RecordLink id={e.refId} /></Cell>
        <Cell label="Khối lượng lệch" big><span className="num">{fmtKg(kg)}</span></Cell>
        <Cell label="Ngày Quản lý chấp nhận"><span className="num">{fmtDT(e.date)}</span></Cell>
        <Cell label="Người duyệt">{e.approvedBy}</Cell>
        <Cell label="Trạng thái" alert={e.status === 'Đang treo'}>{e.status}</Cell>
        <Cell label="Ghi chú duyệt" wide>{e.note || '—'}</Cell>
        {e.resolution && <Cell label="Hướng xử lý" wide>{e.resolution} — <span className="num">{fmtDT(e.resolvedAt)}</span></Cell>}
        {e.resolvedNote && <Cell label="Ghi chú xử lý" wide>{e.resolvedNote}</Cell>}
      </CellGrid>

      <LinkPills items={[{ id: e.refId }, { id: e.contractId }]} />

    </PeekShell>
  )
}
