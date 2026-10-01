/* Hộp thoại "Quản lý ký xác nhận biên bản sai lệch" — dùng ở trang Sai lệch, Dashboard và drawer SL. */
import { App } from 'antd'
import { Factory, MapPin, PackageCheck, PenLine, Scale, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSignMismatch } from '@/api/hooks'
import type { Mismatch } from '@/api/types'
import { fmtDT, fmtKg } from '@/lib/format'

/** Modal mở từ drawer phải nằm trên chồng drawer (zIndex 1000 + 10/lớp). */
export const MODAL_Z = 1500

/** Chênh có dấu: +40 kg / −120 kg */
export const signedKg = (d: number) => (d > 0 ? '+' : d < 0 ? '−' : '') + fmtKg(Math.abs(d))

export const SRC: Record<string, { icon: LucideIcon; bg: string; fg: string; color: string }> = {
  'Trạm cân công ty': { icon: Scale, bg: 'var(--steel-soft)', fg: 'var(--steel)', color: '#4a5560' },
  'Cân tại xưởng mạ': { icon: Factory, bg: 'var(--rust-soft)', fg: 'var(--rust)', color: '#c5400a' },
  'Giao khách': { icon: PackageCheck, bg: 'var(--moss-soft)', fg: 'var(--moss)', color: '#2f5d3a' },
}
export function SrcChip({ source }: { source: string }) {
  const m = SRC[source] ?? { icon: MapPin, bg: 'var(--steel-soft)', fg: 'var(--steel)' }
  const Icon = m.icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: m.bg, color: m.fg }}>
      <Icon size={11} />{source}
    </span>
  )
}

const F = ({ l, children, wide }: { l: string; children: ReactNode; wide?: boolean }) => (
  <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
    <div style={{ color: 'var(--ash)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{l}</div>
    <div style={{ fontWeight: 600, marginTop: 1 }}>{children}</div>
  </div>
)

/** Trả về hàm mở modal ký. Chỉ gọi khi người dùng có quyền ký (admin). */
export function useSignMismatchDialog() {
  const { modal } = App.useApp()
  const sign = useSignMismatch()
  return (m: Mismatch) => {
    if (m.status !== 'Chờ QL ký') return
    modal.confirm({
      title: `Ký xác nhận biên bản sai lệch ${m.id}`,
      icon: null,
      width: 560,
      zIndex: MODAL_Z,
      okText: 'Ký xác nhận',
      cancelText: 'Để sau',
      content: (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12.5, marginTop: 8 }}>
            <F l="Biên bản"><span className="mono">{m.id}</span></F>
            <F l="Điểm phát sinh">{m.source}</F>
            <F l="Chứng từ gốc"><span className="mono">{m.refId} · HĐ {m.contractId}</span></F>
            <F l="Ngày ghi nhận">{fmtDT(m.date)}</F>
            <F l="Kỳ vọng"><span className="num">{fmtKg(m.expected)}</span></F>
            <F l="Thực tế"><span className="num">{fmtKg(m.actual)}</span></F>
            <F l="Chênh lệch"><span className="num text-signal">{signedKg(m.delta)}</span></F>
            <F l="Người báo">{m.reportedBy} — {m.dept}</F>
            <F l="Lý do (dropdown)" wide>
              {m.reason}
              {m.reasonNote && <div style={{ color: 'var(--ash)', fontSize: 11.5, fontWeight: 400, marginTop: 2 }}>{m.reasonNote}</div>}
            </F>
          </div>
          <div style={{ border: '1px dashed var(--rule)', borderRadius: 10, padding: '12px 14px', marginTop: 12, background: 'var(--paper-2)', fontSize: 12.5 }}>
            <PenLine size={13} style={{ verticalAlign: -2 }} />{' '}
            <b>Quản lý A ký xác nhận đã kiểm tra và chấp nhận lý do sai lệch</b> nêu trên. Sau khi ký, chứng từ gốc đang treo
            trạng thái "Lệch — chờ ký" sẽ tự chuyển về <b>Đã cân</b>.
          </div>
        </div>
      ),
      // lỗi đã được useAction toast — nuốt để không ném unhandled rejection
      onOk: () => sign.mutateAsync(m.id).catch(() => undefined),
    })
  }
}
