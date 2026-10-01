/* Hộp xác nhận "Ký xác nhận sai lệch" của Quản lý (dùng ở tab Sai lệch, trang Điều hành và sheet chi tiết). */
import { App } from 'antd'
import { useSignMismatch } from '@/api/hooks'
import type { Mismatch } from '@/api/types'
import { fmtN, signed } from './core'

export function useSignFlow() {
  const { modal } = App.useApp()
  const sign = useSignMismatch()
  return (mm: Mismatch) => modal.confirm({
    title: `Ký xác nhận sai lệch ${mm.id}`,
    content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        <b>{mm.source}</b> · chứng từ {mm.refId} · HĐ {mm.contractId}<br />
        Kỳ vọng <b>{fmtN(mm.expected)} kg</b> → thực tế <b>{fmtN(mm.actual)} kg</b> (<b style={{ color: 'var(--signal)' }}>{signed(mm.delta)} kg</b>)<br />
        Lý do: <b>{mm.reason}</b>{mm.reasonNote ? ` — ${mm.reasonNote}` : ''}<br />
        Người báo: {mm.reportedBy} ({mm.dept})<br /><br />
        Ký xác nhận nghĩa là Quản lý A <b>chấp nhận lý do</b> và chốt số liệu này vào sổ đối ứng.
      </div>
    ),
    okText: 'Ký xác nhận', cancelText: 'Để sau',
    onOk: () => sign.mutateAsync(mm.id),
  })
}

