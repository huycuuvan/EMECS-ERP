/* Lộ trình thẻ lái xe (màn lái xe): LẤY HÀNG TẠI → GIAO ĐẾN (tên, địa chỉ + nút bản đồ, SĐT gọi được),
   xe, giờ phải có mặt, hạn trả phiếu, phiếu / chứng từ đi kèm, khối lượng theo chứng từ. */
import { MapPin, Navigation2, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { useContracts, useSeller } from '@/api/hooks'
import { useGalvanizers } from '@/api/hooksMaster'
import type { Task } from '@/api/types'
import { fmtDT, hoursOver } from '@/lib/format'
import { fmtN, isOverdueTask } from './core'
import { DLink } from './kit'

const mapUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const Tel = ({ n }: { n?: string }) => (n ? <a className="rt-tel" href={`tel:${n.replace(/[^\d+]/g, '')}`}><Phone size={12} />{n}</a> : null)

function Stop({ kind, title, address, lines }: { kind: 'from' | 'to'; title: ReactNode; address?: string; lines?: ReactNode }) {
  return (
    <div className={'rt-stop ' + kind}>
      <div className="rt-dot" />
      <div className="rt-body">
        <div className="rt-k">{kind === 'from' ? 'Lấy hàng tại' : 'Giao đến'}</div>
        <div className="rt-name">{title || <span className="rt-miss">Chưa có thông tin</span>}</div>
        {address && <div className="rt-addr"><MapPin size={12} />{address}
          <a className="rt-map" href={mapUrl(address)} target="_blank" rel="noreferrer"><Navigation2 size={12} />Bản đồ</a></div>}
        {lines}
      </div>
    </div>
  )
}

export function TaskRoute({ t }: { t: Task }) {
  const { data: galvs = [] } = useGalvanizers()
  const { data: seller } = useSeller()
  const { data: contracts = [] } = useContracts()
  const active = galvs.filter((g) => g.active)
  // thẻ cũ chưa gắn xưởng mạ: nếu công ty chỉ dùng 1 xưởng mạ thì lấy luôn xưởng đó
  const galv = galvs.find((g) => g.id === t.galvanizerId) ?? (active.length === 1 ? active[0] : undefined)
  const c = contracts.find((x) => x.id === t.contractId)
  const isMa = t.type === 'di_ma'
  const overdue = isOverdueTask(t)
  const galvStop = (kind: 'from' | 'to') => (
    <Stop kind={kind} title={galv ? (/xưởng/i.test(galv.name) ? galv.name : `Xưởng ${galv.name}`) : 'Xưởng mạ (chưa chọn)'} address={galv?.address}
      lines={galv?.phone ? <div className="rt-line"><Tel n={galv.phone} /></div> : undefined} />
  )
  const d = t.deliver
  return (
    <div className="rt">
      <div className="rt-route">
        {isMa
          ? <Stop kind="from" title={seller?.name ? `Kho công ty — ${seller.name}` : 'Kho công ty'} address={seller?.address}
              lines={seller?.phone ? <div className="rt-line"><Tel n={seller.phone} /></div> : undefined} />
          : galvStop('from')}
        {isMa ? galvStop('to') : (
          <Stop kind="to" title={d?.name} address={d?.address} lines={<>
            {(d?.receiverName || d?.receiverPhone) && <div className="rt-line">Người nhận: <b>{d?.receiverName || '—'}</b> <Tel n={d?.receiverPhone} /></div>}
            {(d?.contactName || d?.contactPhone) && <div className="rt-line">Liên hệ: <b>{d?.contactName || '—'}</b> <Tel n={d?.contactPhone} /></div>}
          </>} />
        )}
      </div>
      <div className="rt-grid">
        <div><span>Có mặt lúc</span><b>{t.arriveAt ? fmtDT(t.arriveAt) : '—'}</b></div>
        <div className={overdue ? 'bad' : ''}><span>Hạn trả phiếu</span><b>{t.fillDeadline ? fmtDT(t.fillDeadline) : '—'}{overdue ? ` · quá ${hoursOver(t.fillDeadline!)}h` : ''}</b></div>
        <div><span>Xe</span><b className="mono">{t.vehiclePlate || 'Chưa gán'}</b></div>
        <div><span>Khối lượng</span><b>{t.kgRequired ? `${fmtN(t.kgRequired)} kg` : '—'}</b></div>
        <div><span>Phiếu đi kèm</span><b>{t.refId ? <>{isMa ? 'Phiếu cân xuất ' : 'Thẻ đi mạ '}<DLink id={t.refId} /></> : 'Không gắn'}</b></div>
        <div><span>Hợp đồng</span><b><DLink kind="hd" id={t.contractId} />{c && <small> · {c.customer}</small>}</b></div>
      </div>
      {t.note && <div className="rt-note">Ghi chú: {t.note}</div>}
    </div>
  )
}
