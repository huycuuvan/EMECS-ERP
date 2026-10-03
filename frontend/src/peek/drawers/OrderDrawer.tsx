/* Drawer Đơn hàng khách (port ERPPeek.register('dh') của steel-data.js): thông tin đơn, hàng hóa, tổng giá trị,
   liên kết hợp đồng. Thao tác: Sửa (useUpdateOrder) · Chuyển kế toán (đơn đang "Chốt đơn"). */
import { App, Button } from 'antd'
import { Download, Info, Package, Paperclip, Pencil, Send } from 'lucide-react'
import { useState } from 'react'
import { useOrder } from '@/api/hooks'
import { blobError, downloadFile } from '@/api/hooksEdit'
import HistoryBlock from '@/components/HistoryBlock'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtNum, fmtT } from '@/lib/format'
import OrderFormModal from '@/pages/orders/OrderFormModal'
import CustomerTags from '@/pages/orders/CustomerTags'
import { useAskSendKT } from '@/pages/orders/useAskSendKT'
import PeekShell from '../PeekShell'
import RelatedLinks from './contract/RelatedLinks'
import './contract/contract.css'
import '@/pages/orders/orderForm.css'

export default function OrderDrawer({ id }: { id: string }) {
  const { data: o, isLoading, isError } = useOrder(id)
  const { can } = useAuth()
  const { message } = App.useApp()
  const askSend = useAskSendKT()
  const [editing, setEditing] = useState(false)
  const canEdit = can('don-hang', 'edit')

  const actions = o && canEdit ? (
    <>
      {o.status === 'Chốt đơn' && (
        <Button size="small" type="primary" icon={<Send size={12} />} onClick={() => askSend(o)}>Chuyển kế toán</Button>
      )}
      <Button size="small" ghost icon={<Pencil size={12} />} onClick={() => setEditing(true)}>Sửa</Button>
    </>
  ) : undefined

  return (
    <PeekShell type="dh" id={id} status={o?.status} loading={isLoading} notFound={isError || (!isLoading && !o)} actions={actions}
      sub={o ? `${o.customer} · ${fmtT(o.totalKg)}` : undefined}>
      {o && (
        <>
          <Sec icon={<Info />}>Thông tin đơn</Sec>
          <CellGrid>
            <Cell label="Khách hàng" extra={<CustomerTags name={o.customer} />}>{o.customer}</Cell>
            <Cell label="Mã nội bộ">{o.code}</Cell>
            <Cell label="Ngày chốt">{fmtD(o.date)}</Cell>
            <Cell label="File đính kèm">
              {o.file ? (
                <a style={{ color: 'var(--rust)', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  onClick={() => message.info(`Demo: mở file ${o.file}`)}>
                  <Paperclip size={12} />{o.file}
                </a>
              ) : '—'}
            </Cell>
            {o.note && <Cell label="Ghi chú" wide>{o.note}</Cell>}
          </CellGrid>

          <Sec icon={<Package />} extra={
            <Button size="small" type="link" icon={<Download size={12} />} onClick={() => downloadFile(`/orders/${o.id}/excel`, `Don-hang_${o.id}.xlsx`)
              .catch(async (e) => message.error(await blobError(e)))}>Tải Excel</Button>
          }>Hàng hóa</Sec>
          <div className="of-wrap">
            <table className="of-table view">
              <colgroup>
                <col style={{ width: 40 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 76 }} /><col style={{ width: 70 }} />
                <col style={{ width: 92 }} /><col style={{ width: 80 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr><th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th className="r">Số lượng</th><th className="r">KL/1 bộ</th>
                  <th className="r">Tổng KL (kg)</th><th className="r">Đơn giá</th><th className="r">Thành tiền</th><th>Ghi chú</th></tr>
              </thead>
              <tbody>
                {o.items.map((i, k) => (
                  <tr key={i.id ?? k}>
                    <td className="c">{k + 1}</td>
                    <td>{i.name}</td>
                    <td>{i.unit}</td>
                    <td className="r">{fmtNum(i.qty)}</td>
                    <td className="r">{i.kgPerUnit ? fmtNum(i.kgPerUnit) : '—'}</td>
                    <td className="r">{fmtNum(i.kg)}</td>
                    <td className="r">{fmtNum(i.price)}</td>
                    <td className="r">{fmtNum(i.amount ?? Math.round(i.kg * i.price))}</td>
                    <td className="sub-soft" style={{ marginTop: 0 }}>{i.note}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={5} className="c">TỔNG CỘNG TRƯỚC THUẾ</td><td className="r">{fmtNum(o.totalKg)}</td><td /><td className="r">{fmtNum(o.value)}</td><td /></tr>
                <tr><td colSpan={5} className="c">THUẾ VAT {fmtNum(o.vatPct)}%</td><td /><td /><td className="r">{fmtNum(o.vatAmount)}</td><td /></tr>
                <tr className="grand"><td colSpan={5} className="c">TỔNG CỘNG SAU THUẾ</td><td /><td /><td className="r">{fmtNum(o.valueAfterVat)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
          {!o.contractId && (
            <p className="caption" style={{ marginTop: 10 }}>
              Đơn chưa có hợp đồng — sau khi chuyển kế toán, kế toán có <b>05 ngày</b> để trả hợp đồng cho khách.
            </p>
          )}

          <RelatedLinks pills={[{ type: 'hd', id: o.contractId }]} />

          <HistoryBlock type="dh" id={o.id} />

          {editing && <OrderFormModal order={o} onClose={() => setEditing(false)} />}
        </>
      )}
    </PeekShell>
  )
}
