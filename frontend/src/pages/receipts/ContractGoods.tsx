/* Hàng hóa của hợp đồng (theo đơn hàng) ở phiếu chuẩn bị hàng: tên, ĐVT, SL đơn, KL/1 bộ, tổng KL, SL đã chuẩn bị (lũy kế).
   Có `qtys` + `onQty` → thêm cột nhập SL lần này; KL lần này = SL × KL/1 bộ, cộng dồn thành tổng KL của phiếu. */
import { InputNumber } from 'antd'
import { useContracts, useOrder, useReceipts } from '@/api/hooks'
import type { ID, OrderItem } from '@/api/types'
import { fmtKg, fmtNum } from '@/lib/format'
import '@/pages/orders/orderForm.css'
import { NUM } from '@/lib/numberInput'

export const perUnit = (i: OrderItem) => i.kgPerUnit || (i.qty ? i.kg / i.qty : 0)

export function useContractGoods(contractId?: ID) {
  const { data: contracts = [] } = useContracts()
  const c = contracts.find((x) => x.id === contractId)
  const { data: order } = useOrder(c?.orderId)
  const { data: rcs = [] } = useReceipts()
  const mine = rcs.filter((r) => r.contractId === contractId)
  const received = mine.reduce((s, r) => s + (Number(r.kg) || 0), 0)
  const doneQty: Record<number, number> = {}
  for (const r of mine) for (const l of r.items ?? []) doneQty[l.itemId] = (doneQty[l.itemId] ?? 0) + l.qty
  return { c, order, received, doneQty }
}

export default function ContractGoods({ contractId, qtys, onQty }: {
  contractId?: ID; qtys?: Record<number, number | null>; onQty?: (itemId: number, v: number | null) => void
}) {
  const { c, order, received, doneQty } = useContractGoods(contractId)
  if (!contractId || !order) return null
  const edit = !!onQty
  const thisKg = order.items.reduce((s, i) => s + (qtys?.[i.id!] || 0) * perUnit(i), 0)
  const thisQty = order.items.reduce((s, i) => s + (qtys?.[i.id!] || 0), 0)
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="caption" style={{ marginBottom: 6 }}>
        Hàng hóa hợp đồng <b className="mono">{c?.number || order.id}</b> · {order.customer} — đã chuẩn bị lũy kế{' '}
        <b>{fmtKg(received)}</b> / {fmtKg(order.totalKg)}{edit && ' · nhập số lượng chuẩn bị lần này, hệ thống tự cộng thành tổng KL'}
      </div>
      <div className="of-wrap">
        <table className="of-table view" style={{ minWidth: edit ? 720 : 560 }}>
          <colgroup>
            <col style={{ width: 36 }} /><col /><col style={{ width: 52 }} /><col style={{ width: 70 }} /><col style={{ width: 66 }} />
            <col style={{ width: 86 }} /><col style={{ width: 80 }} />
            {edit && <><col style={{ width: 96 }} /><col style={{ width: 90 }} /></>}
          </colgroup>
          <thead><tr>
            <th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th className="r">SL đơn</th><th className="r">KL/1 bộ</th><th className="r">Tổng KL</th>
            <th className="r">Đã chuẩn bị</th>
            {edit && <><th className="r">SL lần này</th><th className="r">KL lần này</th></>}
          </tr></thead>
          <tbody>
            {order.items.map((i, k) => {
              const q = qtys?.[i.id!] ?? null
              const left = Math.max(0, i.qty - (doneQty[i.id!] ?? 0))
              return (
                <tr key={i.id ?? k}>
                  <td className="c">{k + 1}</td><td>{i.name}</td><td>{i.unit}</td>
                  <td className="r">{fmtNum(i.qty)}</td><td className="r">{fmtNum(perUnit(i))}</td><td className="r">{fmtNum(i.kg)}</td>
                  <td className="r">{fmtNum(doneQty[i.id!] ?? 0)}</td>
                  {edit && <>
                    <td className="r" style={{ padding: '3px 4px' }}>
                      <InputNumber<number> {...NUM} size="small" min={0} value={q} placeholder={left ? `còn ${fmtNum(left)}` : '0'}
                        status={q != null && q > left ? 'warning' : undefined} style={{ width: '100%' }}
                        onChange={(v) => onQty!(i.id!, v)} />
                    </td>
                    <td className="r"><b>{q ? fmtNum(Math.round(q * perUnit(i) * 1000) / 1000) : '—'}</b></td>
                  </>}
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr>
            <td colSpan={5} className="c">TỔNG</td><td className="r">{fmtNum(order.totalKg)}</td><td />
            {edit && <><td className="r">{fmtNum(thisQty)}</td><td className="r">{fmtNum(Math.round(thisKg * 1000) / 1000)}</td></>}
          </tr></tfoot>
        </table>
      </div>
    </div>
  )
}
