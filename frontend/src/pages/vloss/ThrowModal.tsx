/* "Ném chênh lệch vào kho" — liệt kê mọi lệch chưa duyệt trên toàn hệ thống (pending deltas);
   Quản lý bấm "Ném vào kho" = cho phép phần lệch (ký luôn biên bản sai lệch chờ ký) → tạo bút toán kho ảo. */
import { Button, Input, Modal, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArchiveRestore } from 'lucide-react'
import { useState } from 'react'
import { useAcceptLoss, usePendingDeltas } from '@/api/hooks'
import type { PendingDelta } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { fmtDelta, fmtKg } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { SrcChip } from './SrcChip'

export default function ThrowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: list = [], isLoading } = usePendingDeltas()
  const { can } = useAuth()
  const canApprove = can('kho-ao', 'full')
  const [target, setTarget] = useState<PendingDelta | null>(null)

  const columns: ColumnsType<PendingDelta> = [
    { title: 'Nguồn', dataIndex: 'source', render: (v: string) => <SrcChip src={v} /> },
    { title: 'Phiếu', dataIndex: 'id', render: (v: string, d) => <div><RecordLink id={v} style={{ color: 'var(--rust)' }} />{d.mismatchId && <div><RecordLink id={d.mismatchId} danger style={{ fontSize: 11 }} /></div>}</div> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (v: string) => <RecordLink id={v} /> },
    { title: 'Kỳ vọng', dataIndex: 'expected', align: 'right', render: (v: number) => <span className="num">{fmtKg(v)}</span> },
    { title: 'Thực tế', dataIndex: 'actual', align: 'right', render: (v: number) => <span className="num">{fmtKg(v)}</span> },
    { title: 'Chênh', dataIndex: 'delta', align: 'right', render: (v: number) => <span className="num" style={{ color: 'var(--signal)', fontWeight: 700 }}>{fmtDelta(v)}</span> },
    ...(canApprove ? [{ key: 'act', render: (_: unknown, d: PendingDelta) => (
      <Button size="small" type="primary" icon={<ArchiveRestore size={12} />} onClick={() => setTarget(d)} style={{ whiteSpace: 'nowrap' }}>Ném vào kho</Button>) }] : []),
  ]

  return (
    <Modal open={open} onCancel={onClose} width={860} zIndex={1200}
      title={`Ném chênh lệch vào kho ảo — ${list.length} phiếu có lệch chưa duyệt`}
      footer={<Button onClick={onClose}>Đóng</Button>}>
      {/* bấm mã phiếu → đóng modal để thấy drawer (như demo) */}
      <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest('.id-link')) onClose() }}>
      <Table<PendingDelta> rowKey={(d) => d.refType + d.id} size="small" loading={isLoading} dataSource={list} columns={columns}
        pagination={false} scroll={{ x: 720, y: '50vh' }}
        locale={{ emptyText: <span className="text-moss" style={{ fontWeight: 600 }}>Không còn chênh lệch nào chưa duyệt — toàn hệ thống sạch ✓</span> }} />
      </div>
      <p className="caption" style={{ marginTop: 10, marginBottom: 0 }}>
        "Ném vào kho" = Quản lý CHO PHÉP phần lệch này; biên bản sai lệch chờ ký sẽ được ký luôn.
        {!canApprove && <b style={{ color: 'var(--signal)' }}> Chỉ Quản lý A được duyệt ném vào kho ảo.</b>}
      </p>
      <AcceptModal target={target} onClose={() => setTarget(null)} />
    </Modal>
  )
}

/** Xác nhận cho phép & ném vào kho ảo một phiếu. Dùng riêng được (vd. bấm trực tiếp từ bảng chênh lệch chờ duyệt). */
export function AcceptModal({ target, onClose }: { target: PendingDelta | null; onClose: () => void }) {
  const m = useAcceptLoss()
  const [note, setNote] = useState('')
  const close = () => { setNote(''); onClose() }
  return (
    <Modal open={!!target} zIndex={1300} title={target ? `Cho phép & ném vào kho ảo — ${target.id}` : ''}
      okText="OK — ném vào kho ảo" cancelText="Hủy" confirmLoading={m.isPending} onCancel={close}
      onOk={() => m.mutateAsync({ refType: target!.refType, refId: target!.id, note: note.trim() || undefined }).then(close)}>
      {target && <>
        <p>Quản lý xác nhận cho phép phần chênh <b className="text-signal">{fmtDelta(target.delta)}</b> của <b>{target.id}</b> ({target.source}, HĐ {target.contractId}) và chuyển vào kho ảo để treo theo dõi.</p>
        <label className="caption">Ghi chú duyệt</label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: bavia rơi khi bốc xếp, đã kiểm tra camera" />
      </>}
    </Modal>
  )
}
