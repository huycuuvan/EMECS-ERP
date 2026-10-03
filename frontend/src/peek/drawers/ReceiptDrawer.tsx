/* Drawer Chuẩn bị hàng — port ERPPeek.register('ptn') trong steel-data.js:
   thông tin phiếu · đối chiếu với số SX báo trên lệnh · phiếu cân xuất từ cùng lệnh · tạo phiếu cân xuất (kho). */
import { Button } from 'antd'
import { Info, Link2, Pencil, Scale, Factory } from 'lucide-react'
import { useState } from 'react'
import { useLsx, useReceipt, useReceipts, useWeighings } from '@/api/hooks'
import HistoryBlock from '@/components/HistoryBlock'
import { Cell, CellGrid, Sec, StatusTag } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import EditReceiptModal from '@/pages/receipts/EditReceiptModal'
import { stockOfLsx, useWeighingActions } from '@/pages/weighings/WeighingModals'
import { WeighActions, WeighResult } from '@/pages/receipts/WeighApproval'
import { C } from '@/theme'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'

export default function ReceiptDrawer({ id }: { id: string }) {
  const { data: r, isLoading, isError } = useReceipt(id)
  const { data: x } = useLsx(r?.lsxId)
  const { data: rcs = [] } = useReceipts()
  const { data: allPcs = [] } = useWeighings()
  const { can } = useAuth()
  const canWeigh = can('phieu-can', 'edit')
  const canEditR = can('tiep-nhan', 'edit')
  const wAct = useWeighingActions()
  const [editing, setEditing] = useState(false)

  if (!r) return <PeekShell type="ptn" id={id} loading={isLoading} notFound={!isLoading && (isError || !r)} />

  const lsxRcs = rcs.filter((z) => z.lsxId === r.lsxId)
  const recKg = lsxRcs.reduce((s, z) => s + (Number(z.kg) || 0), 0)
  const pcs = allPcs.filter((p) => p.lsxId === r.lsxId).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const stock = stockOfLsx(r.lsxId, lsxRcs, pcs)
  const overSx = x ? recKg - x.kgDone : 0

  return (
    <PeekShell type="ptn" id={r.id} status="Đã tiếp nhận" sub={`LSX ${r.lsxId} → kho`}
      actions={<>
        {canWeigh && stock > 0 && <Button size="small" type="primary" icon={<Scale size={13} />} onClick={() => wAct.create({ lsxId: r.lsxId, receiptId: r.id })}>Tạo phiếu cân xuất</Button>}
        {canEditR && <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setEditing(true)}>Sửa</Button>}
      </>}>
      <Sec icon={<Info />}>Thông tin phiếu</Sec>
      <CellGrid>
        <Cell label="Ngày chuẩn bị">{fmtDT(r.date)}</Cell>
        <Cell label="Người lập">{r.by}<div className="caption" style={{ fontWeight: 400 }}>Kho</div></Cell>
        {r.qty > 0 && !r.items?.length && <Cell label="Số lượng">{fmtNum(r.qty)} SP</Cell>}
        <Cell label="Khối lượng" big>{fmtKg(r.kg)}</Cell>
        <Cell label="Lệnh SX"><RecordLink id={r.lsxId} style={{ color: C.rust }} />{x && <div className="caption" style={{ fontWeight: 400 }}>{x.name}</div>}</Cell>
        <Cell label="Hợp đồng"><RecordLink id={r.contractId} style={{ color: C.rust }} /></Cell>
        <Cell label="Ghi chú" wide>{r.note || '—'}</Cell>
      </CellGrid>
      {(() => {
        const w = allPcs.find((p) => p.receiptId === r.id)
        return w ? (
          <>
            <Sec icon={<Scale />}>Cân xuất · {w.id}</Sec>
            <CellGrid>
              <Cell label="Tài xế (QL chỉ định)">{w.signers.laiXe || '—'}{w.vehiclePlate && <div className="caption mono" style={{ fontWeight: 400 }}>{w.vehiclePlate}</div>}</Cell>
              <Cell label="Kết quả cân" wide><WeighResult p={w} /></Cell>
            </CellGrid>
            <div style={{ marginTop: 8 }}><WeighActions p={w} onWeigh={(p) => wAct.fill(p)} /></div>
          </>
        ) : null
      })()}
      {!!r.items?.length && (
        <table className="pk-items" style={{ marginTop: 10 }}>
          <thead><tr><th>Mặt hàng</th><th className="r">Số lượng</th><th className="r">KL/1 bộ</th><th className="r">Khối lượng</th></tr></thead>
          <tbody>
            {r.items.map((l) => (
              <tr key={l.itemId}><td>{l.name}</td><td className="r">{fmtNum(l.qty)} {l.unit}</td><td className="r">{fmtNum(l.kgPerUnit)}</td><td className="r"><b>{fmtKg(l.kg)}</b></td></tr>
            ))}
            <tr><td><b>Tổng</b></td><td className="r"><b>{fmtNum(r.qty)}</b></td><td /><td className="r"><b>{fmtKg(r.kg)}</b></td></tr>
          </tbody>
        </table>
      )}

      {x && <>
        <Sec icon={<Factory />}>Đối chiếu với lệnh sản xuất</Sec>
        <CellGrid>
          <Cell label="SX đã báo xong">{fmtKg(x.kgDone)}<div className="caption" style={{ fontWeight: 400 }}>/ {fmtKg(x.kgPlan)} kế hoạch</div></Cell>
          <Cell label="Kho đã nhận lũy kế" alert={overSx > 0.5}>
            {overSx > 0.5
              ? <RecordLink id={x.id} danger>{fmtKg(recKg)} — VƯỢT {fmtKg(overSx)}</RecordLink>
              : fmtKg(recKg)}
            <div className="caption" style={{ fontWeight: 400 }}>{lsxRcs.length} phiếu chuẩn bị hàng</div>
          </Cell>
          <Cell label="Tồn kho chờ cân (theo lệnh)" wide>
            <span style={{ color: stock > 0 ? C.amber : C.moss }}>{stock > 0 ? fmtKg(stock) : 'Đã cân xuất hết ✓'}</span>
          </Cell>
        </CellGrid>
      </>}

      <Sec icon={<Scale />}>Phiếu cân xuất từ lệnh {r.lsxId}</Sec>
      {pcs.length ? (
        <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, background: C.canvas, overflow: 'hidden' }}>
          {pcs.map((p, i) => {
            const d = p.kgActual != null ? p.kgActual - p.kgExpected : null
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${C.ruleHair}` : undefined, fontSize: 12.5 }}>
                <RecordLink id={p.id} danger={p.status === 'Lệch — chờ ký'} />
                <span className="caption">{fmtDT(p.date)}</span>
                <span style={{ flex: 1 }} />
                <span className="num">{fmtKg(p.kgExpected)} → {p.kgActual != null
                  ? <b style={{ color: p.status === 'Lệch — chờ ký' ? C.signal : undefined }}>{fmtKg(p.kgActual)}</b>
                  : <RecordLink id={p.id} danger>CHƯA CÂN</RecordLink>}
                  {d != null && Math.abs(d) > 0.5 && <span className="text-signal" style={{ marginLeft: 6, fontWeight: 700 }}>({d > 0 ? '+' : '−'}{fmtNum(Math.abs(d))})</span>}
                </span>
                <StatusTag status={p.status} />
              </div>
            )
          })}
        </div>
      ) : <div className="photo-empty">Chưa có phiếu cân xuất nào từ lệnh này.</div>}

      <Sec icon={<Link2 />}>Liên kết</Sec>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <RecordLink id={r.lsxId} /><RecordLink id={r.contractId} />
      </div>

      <HistoryBlock type="ptn" id={r.id} />

      {wAct.node}
      {editing && <EditReceiptModal r={r} onClose={() => setEditing(false)} />}
    </PeekShell>
  )
}
