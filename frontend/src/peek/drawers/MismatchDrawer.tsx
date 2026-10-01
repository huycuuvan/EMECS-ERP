/* Drawer "Biên bản sai lệch" — port ERPPeek.register('sl') (steel-data.js): nội dung sai lệch, ký xác nhận (chỉ Quản lý A),
   bản in biên bản 2 chữ ký, đối tượng liên quan (chứng từ gốc + hợp đồng). */
import { App, Button } from 'antd'
import { AlertTriangle, ExternalLink, Link2, PenLine, Pencil, Printer } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMismatch } from '@/api/hooks'
import HistoryBlock from '@/components/HistoryBlock'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDT, fmtKg } from '@/lib/format'
import EditMismatchModal, { useCanEditMismatch } from '@/pages/mismatches/EditMismatchModal'
import { printDoc } from '@/pages/mismatches/print'
import { SrcChip, signedKg, useSignMismatchDialog } from '@/pages/mismatches/sign'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'
import { usePeek } from '../context'
import { PEEK_META, type PeekType } from '../meta'

function Pill({ type, id }: { type: PeekType; id: string }) {
  const m = PEEK_META[type]
  const Icon = m.icon
  return (
    <RecordLink id={id} type={type} style={{ fontFamily: 'var(--ff-sans)', fontWeight: 600 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--rule)', borderRadius: 10, background: 'var(--canvas)', color: 'var(--ink)' }}>
        <Icon size={14} />
        <span style={{ lineHeight: 1.25 }}>
          <span style={{ display: 'block', color: 'var(--ash)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.label}</span>
          <span className="mono" style={{ fontWeight: 700 }}>{id}</span>
        </span>
      </span>
    </RecordLink>
  )
}

export default function MismatchDrawer({ id }: { id: string }) {
  const { data: m, isLoading, isError } = useMismatch(id)
  const { can } = useAuth()
  const { closeAll } = usePeek()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const signDialog = useSignMismatchDialog()
  const canSign = can('sai-lech', 'full')
  const pending = m?.status === 'Chờ QL ký'
  const canEditOf = useCanEditMismatch()
  const [editing, setEditing] = useState(false)

  const onPrint = () => {
    if (!m) return
    const ok = printDoc({
      title: 'BIÊN BẢN SAI LỆCH KHỐI LƯỢNG', id: m.id, docSub: 'Bắt buộc Quản lý ký xác nhận',
      signL: 'NGƯỜI BÁO CÁO', signR: 'QUẢN LÝ A (KÝ XÁC NHẬN)',
      pairs: [
        ['Điểm phát sinh', m.source], ['Chứng từ', m.refId], ['Hợp đồng', m.contractId],
        ['Kỳ vọng', fmtKg(m.expected)], ['Thực tế', fmtKg(m.actual)], ['Chênh', signedKg(m.delta)],
        ['Lý do', m.reason], ['Diễn giải', m.reasonNote], ['Người báo', `${m.reportedBy} — ${m.dept}`],
        ['Trạng thái', m.signedBy ? `${m.status} — ${m.signedBy} lúc ${fmtDT(m.signedAt)}` : m.status],
      ],
    })
    if (!ok) message.warning('Trình duyệt chặn cửa sổ in — hãy cho phép popup.')
  }

  return (
    <PeekShell type="sl" id={id} status={m?.status} loading={isLoading} notFound={isError || (!isLoading && !m)}
      sub={m && <>{m.source} · lệch <span style={{ color: 'var(--rust-2)', fontWeight: 700 }}>{signedKg(m.delta)}</span></>}
      actions={m && <>
        {pending && canSign && (
          <Button type="primary" size="small" icon={<PenLine size={12} />} onClick={() => signDialog(m)}>Ký xác nhận</Button>
        )}
        {canEditOf(m) && <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setEditing(true)}>Sửa lý do</Button>}
        <Button size="small" ghost icon={<Printer size={12} />} onClick={onPrint}>In</Button>
        <Button size="small" ghost icon={<ExternalLink size={12} />} onClick={() => { closeAll(); navigate(`/sai-lech?open=sl:${encodeURIComponent(id)}`) }}>Mở trang</Button>
      </>}>
      {m && (
        <>
          <Sec icon={<AlertTriangle />}>Nội dung sai lệch</Sec>
          <CellGrid>
            <Cell label="Điểm phát sinh"><SrcChip source={m.source} /></Cell>
            <Cell label="Chứng từ gốc"><RecordLink id={m.refId} type={m.refType} style={{ color: 'var(--rust)' }} /></Cell>
            <Cell label="Số đúng (kỳ vọng)">{fmtKg(m.expected)}</Cell>
            <Cell label="Số thực tế">{fmtKg(m.actual)}</Cell>
            <Cell label="Chênh lệch" alert big>{signedKg(m.delta)}</Cell>
            <Cell label="Thời điểm">{fmtDT(m.date)}</Cell>
            <Cell label="Lý do (chọn từ danh mục)" wide>{m.reason}</Cell>
            {m.reasonNote && <Cell label="Diễn giải" wide>{m.reasonNote}</Cell>}
            <Cell label="Người báo cáo">{m.reportedBy} — {m.dept}</Cell>
            <Cell label="Ký xác nhận" alert={!m.signedBy}>{m.signedBy ? `${m.signedBy} lúc ${fmtDT(m.signedAt)}` : 'CHỜ QUẢN LÝ KÝ'}</Cell>
          </CellGrid>

          {pending && (
            <div style={{ border: '1px dashed var(--rule)', borderRadius: 10, padding: '12px 14px', marginTop: 12, background: 'var(--paper-2)', fontSize: 12.5 }}>
              <PenLine size={13} style={{ verticalAlign: -2 }} />{' '}
              {canSign
                ? <>Quản lý A ký xác nhận đã kiểm tra và chấp nhận lý do sai lệch. Sau khi ký, chứng từ gốc đang treo "Lệch — chờ ký" tự chuyển về <b>Đã cân</b>.</>
                : <>Biên bản đang chờ <b>Quản lý A</b> ký xác nhận — vai trò hiện tại chỉ được xem.</>}
            </div>
          )}

          <Sec icon={<Link2 />}>Đối tượng liên quan</Sec>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Pill type={m.refType} id={m.refId} />
            <Pill type="hd" id={m.contractId} />
          </div>

          <HistoryBlock type="sl" id={m.id} />
          {editing && <EditMismatchModal m={m} onClose={() => setEditing(false)} />}
        </>
      )}
    </PeekShell>
  )
}
