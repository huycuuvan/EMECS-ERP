/* Diễn giải hàng của HĐ tại xưởng mạ (anh Thắng 03/11): "Hàng của <Khách – Đơn> tại xưởng mạ là X kg (hàng đen). Hàng sau
   khi mạ sẽ tăng ~3% → khoảng Y kg" — Quản lý / lái xe biết số kg sẽ lấy đi thực tế, không nhầm với số hàng đen đã gửi. */
import { useMeta } from '@/api/hooks'
import { fmtKg } from '@/lib/format'
import { useCustOrder } from './ContractRef'

/** Hệ số sau mạ (1 + 3%). */
export function useGalvGain() {
  const { data: meta } = useMeta()
  const pct = meta?.galvGainPct ?? 3
  return { pct, k: 1 + pct / 100 }
}

export default function GalvLeftNote({ cid, left, strong }: { cid: string; left: number; strong?: React.CSSProperties }) {
  const { pct, k } = useGalvGain()
  const b = strong ?? { color: 'var(--rust-deep)' }
  const who = useCustOrder(cid)
  const black = Math.round(Math.max(0, left))
  return (
    <>
      Hàng của {who ? <b>{who}</b> : null} (HĐ {cid}) tại xưởng mạ là <b style={b}>{fmtKg(black)}</b> (hàng đen).
      Hàng sau khi mạ sẽ tăng khoảng {pct}% → khoảng <b style={b}>{fmtKg(Math.round(black * k))}</b>.
    </>
  )
}
