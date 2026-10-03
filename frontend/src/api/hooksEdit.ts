/* Hooks: sửa chứng từ có lịch sử, giao lại thẻ / phát lại lệnh, xem lịch sử, xuất Excel (.xlsx).
   Mutation tự toast (thông điệp do server trả về, gồm kết quả sai lệch) + invalidate toàn bộ cache (trừ meta). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { useState } from 'react'
import { api, errorMessage } from './client'
import type { ID, Lsx, Mismatch, Receipt, Task, Weighing } from './types'
import type {
  Edited, EditOutcome, ExportKind, ExportParams, FieldChange, HistoryEntity, LsxEdit, LsxReissue, MismatchEdit,
  ReceiptEdit, TaskEdit, TaskReassign, WeighingEdit,
} from './typesEdit'

export const qkEdit = { history: (type: HistoryEntity, id: ID) => ['history', type, id] }

/** Lịch sử chỉnh sửa của 1 bản ghi — mới nhất trước. */
export const useHistory = (type: HistoryEntity, id?: ID | null) =>
  useQuery({ queryKey: qkEdit.history(type, id!), queryFn: () => api.get<FieldChange[]>(`/history/${type}/${id}`).then((r) => r.data), enabled: !!id })

/** Mutation sửa: toast theo editOutcome (lập biên bản mới → cảnh báo, không đổi gì → thông tin). */
function useEditAction<TVars, TRes extends { editOutcome: EditOutcome }>(fn: (v: TVars) => Promise<TRes>) {
  const qc = useQueryClient()
  const { message } = App.useApp()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'meta' })
      const o = r.editOutcome
      if (!o.changed.length) message.info(o.message || 'Không có thay đổi')
      else if (o.mismatchAction === 'created') message.warning(o.message, 6)
      else message.success(o.message, o.mismatchAction ? 5 : 3)
    },
    onError: (e) => { message.error(errorMessage(e)) },
  })
}

const patch = <T,>(url: string, body: object) => api.patch<T>(url, body).then((r) => r.data)
const post = <T,>(url: string, body: object) => api.post<T>(url, body).then((r) => r.data)

export const useEditWeighing = () => useEditAction(({ id, ...v }: WeighingEdit) => patch<Edited<Weighing>>(`/weighings/${id}`, v))
export const useEditReceipt = () => useEditAction(({ id, ...v }: ReceiptEdit) => patch<Edited<Receipt>>(`/receipts/${id}`, v))
export const useEditTask = () => useEditAction(({ id, ...v }: TaskEdit) => patch<Edited<Task>>(`/tasks/${id}`, v))
export const useEditMismatch = () => useEditAction(({ id, ...v }: MismatchEdit) => patch<Edited<Mismatch>>(`/mismatches/${id}`, v))
export const useEditLsx = () => useEditAction(({ id, ...v }: LsxEdit) => patch<Edited<Lsx>>(`/lsx/${id}`, v))
export const useReassignTask = () => useEditAction(({ id, ...v }: TaskReassign) => post<Edited<Task>>(`/tasks/${id}/reassign`, v))
export const useReissueLsx = () => useEditAction(({ id, ...v }: LsxReissue) => post<Edited<Lsx>>(`/lsx/${id}/reissue`, v))

/* ---------------------------------------------------------------- xuất Excel */
function fileNameOf(cd: string | undefined, fallback: string) {
  if (!cd) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star) { try { return decodeURIComponent(star[1].trim()) } catch { /* bỏ qua */ } }
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  return plain ? plain[1].trim() : fallback
}

/** Lỗi khi responseType=blob: body là Blob → đọc JSON để lấy detail tiếng Việt. */
export async function blobError(e: unknown): Promise<string> {
  const data = (e as { response?: { data?: unknown } })?.response?.data
  if (data instanceof Blob) {
    try {
      const j = JSON.parse(await data.text())
      if (typeof j?.detail === 'string') return j.detail
    } catch { /* bỏ qua */ }
  }
  return errorMessage(e)
}

/** Tải file .xlsx (kèm token đăng nhập qua axios) rồi lưu về máy. */
export async function downloadXlsx(kind: ExportKind, params: ExportParams = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const d = new Date()
  return downloadFile(`/export/${kind}.xlsx`,
    `${kind}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`, clean)
}

/** Tải 1 file từ API (kèm token) rồi lưu về máy; tên file lấy từ Content-Disposition. */
export async function downloadFile(path: string, fallbackName: string, params?: object) {
  const res = await api.get<Blob>(path, { params, responseType: 'blob' })
  const name = fileNameOf(res.headers['content-disposition'] as string | undefined, fallbackName)
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

/** Hook xuất Excel: trạng thái đang tải + toast kết quả. */
export function useExportXlsx() {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const run = async (kind: ExportKind, params?: ExportParams) => {
    setLoading(true)
    try {
      const name = await downloadXlsx(kind, params)
      message.success(`Đã xuất ${name}`)
    } catch (e) {
      message.error(await blobError(e))
    } finally {
      setLoading(false)
    }
  }
  return { run, loading }
}
