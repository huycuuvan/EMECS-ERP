/* Drawer bút toán kho ảo chênh lệch (port ERPPeek.register('vk') của bản demo). */
import { Button } from 'antd'
import { Archive, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { useVloss } from '@/api/hooks'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT, fmtKg } from '@/lib/format'
import ResolveVlossModal from '@/pages/vloss/ResolveVlossModal'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'
import LinkPills from './task/LinkPills'

export default function VlossDrawer({ id }: { id: string }) {
  const { data: e, isLoading, isError } = useVloss(id)
  const { can } = useAuth()
  const [resolving, setResolving] = useState(false)
  if (!e) return <PeekShell type="vk" id={id} loading={isLoading} notFound={isError || !isLoading} />

  const kg = Math.abs(e.kg)
  const actions = e.status === 'Đang treo' && can('kho-ao', 'edit')
    ? <Button size="small" type="primary" icon={<CheckCheck size={13} />} onClick={() => setResolving(true)}>Xử lý</Button>
    : undefined

  return (
    <PeekShell type="vk" id={id} status={e.status} sub={`${e.source} · ${fmtKg(kg)}`} actions={actions}>
      <Sec icon={<Archive />}>Nội dung bút toán</Sec>
      <CellGrid>
        <Cell label="Nguồn chênh lệch">{e.source}</Cell>
        <Cell label="Phiếu gốc"><RecordLink id={e.refId} /></Cell>
        <Cell label="Khối lượng ném vào kho ảo" big><span className="num">{fmtKg(kg)}</span></Cell>
        <Cell label="Ngày duyệt"><span className="num">{fmtDT(e.date)}</span></Cell>
        <Cell label="Người duyệt">{e.approvedBy}</Cell>
        <Cell label="Trạng thái" alert={e.status === 'Đang treo'}>{e.status}</Cell>
        <Cell label="Ghi chú duyệt" wide>{e.note || '—'}</Cell>
        {e.resolution && <Cell label="Hướng xử lý" wide>{e.resolution} — <span className="num">{fmtDT(e.resolvedAt)}</span></Cell>}
        {e.resolvedNote && <Cell label="Ghi chú xử lý" wide>{e.resolvedNote}</Cell>}
      </CellGrid>

      <LinkPills items={[{ id: e.refId }, { id: e.contractId }]} />

      <ResolveVlossModal entry={resolving ? e : null} onClose={() => setResolving(false)} />
    </PeekShell>
  )
}
