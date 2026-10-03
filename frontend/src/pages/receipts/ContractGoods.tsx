/* Hàng hóa của hợp đồng (theo đơn hàng): tên, ĐVT, số lượng, KL/1 bộ, tổng KL — hiện khi chọn hợp đồng ở phiếu tiếp nhận,
   kèm lũy kế kho đã tiếp nhận của hợp đồng. */
import { useContracts, useOrder, useReceipts } from '@/api/hooks'
import type { ID } from '@/api/types'
import { fmtKg, fmtNum } from '@/lib/format'
import '@/pages/orders/orderForm.css'

export function useContractGoods(contractId?: ID) {
  const { data: contracts = [] } = useContracts()
  const c = contracts.find((x) => x.id === contractId)
  const { data: order } = useOrder(c?.orderId)
  const { data: rcs = [] } = useReceipts()
  const received = rcs.filter((r) => r.contractId === contractId).reduce((s, r) => s + (Number(r.kg) || 0), 0)
  return { c, order, received }
}

export default function ContractGoods({ contractId }: { contractId?: ID }) {
  const { c, order, received } = useContractGoods(contractId)
  if (!contractId || !order) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="caption" style={{ marginBottom: 6 }}>
        Hàng hóa hợp đồng <b className="mono">{c?.number || order.id}</b> · {order.customer} — kho đã tiếp nhận lũy kế{' '}
        <b>{fmtKg(received)}</b> / {fmtKg(order.totalKg)}
      </div>
      <div className="of-wrap">
        <table className="of-table view" style={{ minWidth: 520 }}>
          <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 56 }} /><col style={{ width: 80 }} /><col style={{ width: 76 }} /><col style={{ width: 100 }} /></colgroup>
          <thead><tr><th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th className="r">Số lượng</th><th className="r">KL/1 bộ</th><th className="r">Tổng KL (kg)</th></tr></thead>
          <tbody>
            {order.items.map((i, k) => (
              <tr key={i.id ?? k}>
                <td className="c">{k + 1}</td><td>{i.name}</td><td>{i.unit}</td>
                <td className="r">{fmtNum(i.qty)}</td><td className="r">{i.kgPerUnit ? fmtNum(i.kgPerUnit) : '—'}</td><td className="r">{fmtNum(i.kg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5} className="c">TỔNG</td><td className="r">{fmtNum(order.totalKg)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  )
}
