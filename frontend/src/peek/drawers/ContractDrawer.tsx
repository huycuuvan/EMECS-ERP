/* Drawer Hợp đồng (port ERPPeek.register('hd') của steel-data.js) — 3 màn hình:
   (1) Tổng quan · (2) Hàng giao ⇄ Tiền về (tài khoản chữ T) · (3) Luân chuyển thép (nguồn = phân bổ + sổ số dư chạy).
   Thao tác: Sửa · Đã trả HĐ · Đã ký · + Tiền về · Phát lệnh SX (theo trạng thái + quyền). */
import { Button } from 'antd'
import { ArrowLeftRight, BadgeCheck, Banknote, Factory, Info, Pencil, Scale, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useContract, useLedger } from '@/api/hooks'
import { useAuth } from '@/lib/auth'
import { fmtNum, fmtT } from '@/lib/format'
import PeekShell from '../PeekShell'
import FlowTab from './contract/FlowTab'
import { ContractEditModal, LsxFromContractModal, PaymentModal } from './contract/modals'
import { useContractFlow } from './contract/useContractFlow'
import { committedKg } from './contract/utils'
import MoneyTab from './contract/MoneyTab'
import OverviewTab from './contract/OverviewTab'
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
  const [tab, setTab] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)

  const c = g?.contract
  const canEdit = can('hop-dong', 'edit')
  const canLsx = hasRole('admin') // server: chỉ Quản lý phát lệnh SX
  const canPay = !!c && canEdit && !!c.signDate && c.status !== 'Hoàn thành'
  const lsxRemain = g && c ? c.totalKg - committedKg(g.lsxs) : 0
  const showReturned = !!c && canEdit && !c.returnedAt
  const showSigned = !!c && canEdit && !!c.returnedAt && !c.signDate
  const showLsx = !!c && canLsx && !!c.signDate && c.status !== 'Hoàn thành' && lsxRemain > 0

  const actions = c && canEdit
    ? <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setDialog('edit')}>Sửa</Button>
    : undefined

  return (
    <PeekShell type="hd" id={id} status={c?.status} loading={isLoading} notFound={isError || (!isLoading && !g)} actions={actions}
      sub={c ? `${c.customer} · ${fmtNum(c.totalQty)} ${c.unit} · ${fmtT(c.totalKg)}` : undefined}>
      {g && c && (
        <>
          {(showReturned || showSigned || canPay || showLsx) && (
            <div className="hd-actbar">
              <span className="lbl">Thao tác</span>
              {showReturned && <Button size="small" icon={<Undo2 size={13} />} onClick={() => flow.askReturned(c)}>Đã trả HĐ</Button>}
              {showSigned && <Button size="small" icon={<BadgeCheck size={13} />} onClick={() => flow.askSigned(c)}>Đã ký</Button>}
              {canPay && <Button size="small" type="primary" icon={<Banknote size={13} />} onClick={() => setDialog('pay')}>+ Tiền về</Button>}
              {showLsx && (
                <>
                  <Button size="small" icon={<Factory size={13} />} onClick={() => setDialog('lsx')}>Phát lệnh SX</Button>
                  <span className="caption">còn {fmtNum(lsxRemain)} kg chưa phát lệnh</span>
                </>
              )}
            </div>
          )}

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

          {dialog === 'edit' && <ContractEditModal contract={c} onClose={() => setDialog(null)} />}
          {dialog === 'pay' && <PaymentModal contract={c} onClose={() => setDialog(null)} />}
          {dialog === 'lsx' && <LsxFromContractModal contract={c} lsxs={g.lsxs} onClose={() => setDialog(null)} />}
        </>
      )}
    </PeekShell>
  )
}
