/* Xóa bản ghi (chỉ Quản lý): xác nhận + lý do bắt buộc. Máy chủ chặn nếu còn chứng từ phía sau và báo cần xóa gì trước. */
import { useQueryClient } from '@tanstack/react-query'
import { App, Button, Input } from 'antd'
import { Trash2 } from 'lucide-react'
import { api, errorMessage } from '@/api/client'
import { useAuth } from '@/lib/auth'
import { MODAL_Z } from '@/peek/drawers/contract/utils'

export function useDeleteRecord() {
  const { modal, message } = App.useApp()
  const qc = useQueryClient()
  return async (url: string, label: string, onDone?: () => void, preview?: { kind: string; id: string }) => {
    // xem trước: không xóa được thì báo luôn lý do; xóa được thì liệt kê những gì bị xóa kèm
    let plan: { block: string | null; cascade: string[] } = { block: null, cascade: [] }
    if (preview) {
      try { plan = (await api.get(`/delete-preview/${preview.kind}/${encodeURIComponent(preview.id)}`)).data } catch { /* vẫn hỏi xác nhận */ }
    }
    if (plan.block) {
      modal.warning({ title: `Chưa xóa được ${label}`, zIndex: MODAL_Z + 10, content: plan.block, okText: 'Đã hiểu' })
      return
    }
    let reason = ''
    modal.confirm({
      title: `Xóa ${label}?`, zIndex: MODAL_Z + 10, icon: <Trash2 size={20} color="var(--signal)" />,
      okText: 'Xóa', okButtonProps: { danger: true }, cancelText: 'Hủy',
      content: (
        <>
          <p style={{ margin: '0 0 8px' }}>Xóa là <b>không lấy lại được</b>.</p>
          {plan.cascade.length > 0 && (
            <div style={{ margin: '0 0 8px', padding: '8px 10px', background: 'var(--signal-soft)', borderRadius: 8, fontSize: 13 }}>
              Xóa kèm: <b>{plan.cascade.join(' · ')}</b>
            </div>
          )}
          <Input.TextArea autoFocus rows={2} placeholder="Lý do xóa (bắt buộc) — VD: tạo nhầm, trùng phiếu"
            onChange={(e) => { reason = e.target.value }} />
        </>
      ),
      onOk: async () => {
        if (!reason.trim()) { message.error('Nhập lý do xóa'); throw new Error('reason') }
        try {
          await api.delete(url, { data: { reason: reason.trim() } })
        } catch (e) {
          message.error(errorMessage(e))
          throw e
        }
        message.success(`Đã xóa ${label}`)
        qc.invalidateQueries()
        onDone?.()
      },
    })
  }
}

/** Nút xóa nhỏ — chỉ hiện với Quản lý. */
export function DeleteButton({ url, label, onDone, ghost, text = 'Xóa', preview }: {
  url: string; label: string; onDone?: () => void; ghost?: boolean; text?: string; preview?: { kind: string; id: string }
}) {
  const { hasRole } = useAuth()
  const del = useDeleteRecord()
  if (!hasRole('admin')) return null
  return (
    <Button size="small" danger ghost={ghost} icon={<Trash2 size={12} />} onClick={(e) => { e.stopPropagation(); del(url, label, onDone, preview) }}>
      {text}
    </Button>
  )
}
