/* Drawer Đơn hàng khách (port ERPPeek.register('dh') của steel-data.js): thông tin đơn, hàng hóa, tổng giá trị,
   liên kết hợp đồng. Thao tác: Sửa (useUpdateOrder) · Chuyển kế toán (đơn đang "Chốt đơn"). */
import { App, Button } from 'antd'
import { Info, Package, Paperclip, Pencil, Send } from 'lucide-react'
import { useState } from 'react'
import { useOrder } from '@/api/hooks'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtKg, fmtNum, fmtT, money } from '@/lib/format'
import OrderFormModal from '@/pages/orders/OrderFormModal'
import CustomerTags from '@/pages/orders/CustomerTags'
import { useAskSendKT } from '@/pages/orders/useAskSendKT'
import PeekShell from '../PeekShell'
import RelatedLinks from './contract/RelatedLinks'
import './contract/contract.css'

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

          <Sec icon={<Package />}>Hàng hóa</Sec>
          <table className="pk-items">
            <thead><tr><th>Hạng mục</th><th className="r">SL</th><th className="r">Khối lượng</th><th className="r">Đơn giá/kg</th><th className="r">Thành tiền</th></tr></thead>
            <tbody>
              {o.items.map((i, k) => (
                <tr key={i.id ?? k}>
                  <td>{i.name}</td>
                  <td className="r">{fmtNum(i.qty)} {i.unit}</td>
                  <td className="r">{fmtKg(i.kg)}</td>
                  <td className="r">{fmtNum(i.price)}₫</td>
                  <td className="r">{money(Math.round(i.kg * i.price))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <CellGrid>
              <Cell label="Tổng giá trị" big wide>
                <span style={{ color: 'var(--rust)' }}>{money(o.value)}</span>
                <span className="caption" style={{ fontWeight: 500, marginLeft: 10 }}>{fmtKg(o.totalKg)}</span>
              </Cell>
            </CellGrid>
          </div>
          {!o.contractId && (
            <p className="caption" style={{ marginTop: 10 }}>
              Đơn chưa có hợp đồng — sau khi chuyển kế toán, kế toán có <b>05 ngày</b> để trả hợp đồng cho khách.
            </p>
          )}

          <RelatedLinks pills={[{ type: 'hd', id: o.contractId }]} />

          {editing && <OrderFormModal order={o} onClose={() => setEditing(false)} />}
        </>
      )}
    </PeekShell>
  )
}
