/* Drawer Hợp đồng (port ERPPeek.register('hd') của steel-data.js) — 3 màn hình:
   (1) Tổng quan · (2) Hàng giao ⇄ Tiền về (tài khoản chữ T) · (3) Luân chuyển thép (nguồn = phân bổ + sổ số dư chạy).
   Thanh 4 bước kế toán (Đã soạn thảo → Đã gửi khách hàng → Đã nhận về → Đã hoàn thành) · ngày hoàn thành ·
   Thao tác: Soạn thảo / Tải Word · chuyển bước · + Tiền về (chờ QL duyệt) · Phát lệnh SX · Sửa. */
import { App, Button, Steps } from 'antd'
import { ArrowLeftRight, BadgeCheck, Banknote, CalendarPlus, CircleCheckBig, Download, Factory, FilePen, Info, Pencil, Scale, Send } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { blobError, downloadFile } from '@/api/hooksEdit'
import { CONTRACT_STEPS } from '@/api/types'
import { CompleteChip } from '@/components/ui'
import { useContract, useLedger } from '@/api/hooks'
import HistoryBlock from '@/components/HistoryBlock'
import { useAuth } from '@/lib/auth'
import { fmtNum, fmtT } from '@/lib/format'
import PeekShell from '../PeekShell'
import FlowTab from './contract/FlowTab'
import { ContractEditModal, LsxFromContractModal, PaymentModal } from './contract/modals'
import { useContractFlow } from './contract/useContractFlow'
import { committedKg } from './contract/utils'
import MoneyTab from './contract/MoneyTab'
import OverviewTab from './contract/OverviewTab'
import PaymentApprovals from './contract/PaymentApprovals'
import ExtensionsBlock, { canAskExtension, useAskExtension } from './contract/Extensions'
import RelatedLinks from './contract/RelatedLinks'
import './contract/contract.css'

type Dialog = 'edit' | 'pay' | 'lsx' | null

const TABS = [
  { label: 'Tổng quan', icon: <Info size={13} /> },
  { label: 'Hàng giao ⇄ Tiền về', icon: <ArrowLeftRight size={13} /> },
  { label: 'Luân chuyển thép', icon: <Scale size={13} /> },
]

export default function ContractDrawer({ id }: { id: string }) {
  const { data: g, isLoading, isError } = useContract(id)
  const { data: L } = useLedger(id)
  const { can, hasRole } = useAuth()
  const flow = useContractFlow()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [tab, setTab] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)

  const c = g?.contract
  const canEdit = can('hop-dong', 'edit')
  const canLsx = hasRole('admin') // server: chỉ Quản lý phát lệnh SX
  const canPay = !!c && canEdit  // tiền về độc lập với bước hợp đồng (có thể về trước khi soạn xong)
  const lsxRemain = g && c ? c.totalKg - committedKg(g.lsxs) : 0
  const showReturned = !!c && canEdit && c.status === 'Đã soạn thảo'
  const showSigned = !!c && canEdit && c.status === 'Đã gửi khách hàng'
  const showDone = !!c && canEdit && c.status === 'Đã nhận về'
  const showLsx = !!c && canLsx && lsxRemain > 0  // phát lệnh SX độc lập với bước hợp đồng
  const step = c ? CONTRACT_STEPS.indexOf(c.status) : -1
  const askExt = useAskExtension()
  const extPending = !!g?.extensions.some((e) => e.status === 'Chờ duyệt')
  const showExt = !!c && !!g && canEdit && canAskExtension(c, g.complete, extPending)
  const word = () => c && downloadFile(`/contracts/${c.id}/document.docx`, `Hop-dong_${c.id}.docx`).catch(async (e) => message.error(await blobError(e)))

  const actions = c && canEdit
    ? <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setDialog('edit')}>Sửa</Button>
    : undefined

  return (
    <PeekShell type="hd" id={id} status={c?.status} loading={isLoading} notFound={isError || (!isLoading && !g)} actions={actions}
      sub={c ? `${c.customer} · ${fmtNum(c.totalQty)} ${c.unit} · ${fmtT(c.totalKg)}` : undefined}>
      {g && c && (
        <>
          <div className="hd-steps">
            <Steps size="small" current={step < 0 ? 0 : c.status === 'Đã hoàn thành' ? 4 : step + 1}
              status={c.status === 'Chờ soạn thảo' ? 'wait' : 'process'}
              items={CONTRACT_STEPS.map((s) => ({ title: s }))} />
            <div className="hd-steps-meta">
              <span>Số HĐ <b className="mono">{c.number || '—'}</b></span>
              <span>Hạn trả HĐ <CompleteChip info={g.complete} /></span>
              <span>Hạn giao hàng <CompleteChip info={g.deliver} /></span>
            </div>
          </div>

          {(canEdit || showLsx) && (
            <div className="hd-actbar">
              <span className="lbl">Thao tác</span>
              {canEdit && (
                <Button size="small" type={c.status === 'Chờ soạn thảo' ? 'primary' : 'default'} icon={<FilePen size={13} />}
                  onClick={() => navigate(`/hop-dong/${c.id}/soan-thao`)}>
                  {c.status === 'Chờ soạn thảo' ? 'Soạn thảo hợp đồng' : c.status === 'Đã soạn thảo' || c.status === 'Đã gửi khách hàng' ? 'Sửa bản hợp đồng' : 'Xem bản hợp đồng'}
                </Button>
              )}
              {c.draftedAt && <Button size="small" icon={<Download size={13} />} onClick={word}>Tải Word</Button>}
              {showReturned && <Button size="small" icon={<Send size={13} />} onClick={() => flow.askReturned(c)}>Đã gửi khách hàng</Button>}
              {showSigned && <Button size="small" icon={<BadgeCheck size={13} />} onClick={() => flow.askSigned(c)}>Đã nhận về</Button>}
              {showDone && <Button size="small" icon={<CircleCheckBig size={13} />} onClick={() => flow.askCompleted(c, g)}>Đã hoàn thành</Button>}
              {showExt && <Button size="small" danger={g.complete.state === 'overdue'} icon={<CalendarPlus size={13} />} onClick={() => askExt(c)}>Xin gia hạn</Button>}
              {canPay && <Button size="small" type="primary" icon={<Banknote size={13} />} onClick={() => setDialog('pay')}>+ Tiền về</Button>}
              {showLsx && (
                <>
                  <Button size="small" icon={<Factory size={13} />} onClick={() => setDialog('lsx')}>Phát lệnh SX</Button>
                  <span className="caption">còn {fmtNum(lsxRemain)} kg chưa phát lệnh</span>
                </>
              )}
            </div>
          )}

          <ExtensionsBlock list={g.extensions} />
          <PaymentApprovals payments={c.payments} />

          <div className="hdtabs">
            {TABS.map((t, i) => (
              <button key={t.label} type="button" className={'hdtab' + (tab === i ? ' active' : '')} onClick={() => setTab(i)}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {tab === 0 && <OverviewTab g={g} onGoFlow={() => setTab(2)} onPay={canPay ? () => setDialog('pay') : undefined} />}
          {tab === 1 && <MoneyTab g={g} />}
          {tab === 2 && <FlowTab g={g} L={L} />}

          <RelatedLinks pills={[
            { type: 'dh', id: c.orderId },
            ...g.lsxs.map((x) => ({ type: 'lsx' as const, id: x.id, extra: x.status })),
            ...g.mismatches.map((m) => ({ type: 'sl' as const, id: m.id, extra: m.status })),
          ]} />

          <HistoryBlock type="hd" id={c.id} />

          {dialog === 'edit' && <ContractEditModal contract={c} onClose={() => setDialog(null)} />}
          {dialog === 'pay' && <PaymentModal contract={c} onClose={() => setDialog(null)} />}
          {dialog === 'lsx' && <LsxFromContractModal contract={c} lsxs={g.lsxs} onClose={() => setDialog(null)} />}
        </>
      )}
    </PeekShell>
  )
}
