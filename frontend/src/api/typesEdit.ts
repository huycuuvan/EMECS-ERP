// Kiểu dữ liệu cho sửa chứng từ có lịch sử, giao lại / phát lại, xuất Excel — khớp backend/app/edit_api.py.
import type { ID, Lsx, Mismatch, Receipt, Task, TaskType, Weighing } from './types'

/** Loại bản ghi có lịch sử chỉnh sửa. */
export type HistoryEntity = 'dh' | 'hd' | 'lsx' | 'ptn' | 'pc' | 'vc' | 'sl'

/** 1 dòng lịch sử = 1 trường đổi (giá trị lưu dạng chuỗi: số thô, ngày ISO UTC). */
export interface FieldChange {
  id: number; at: string; entityType: HistoryEntity; entityId: ID; field: string
  oldValue: string | null; newValue: string | null; userId: string | null; userName: string | null; reason: string
}

/** created = lập biên bản mới · updated = cập nhật số trên biên bản đang chờ ký · noted = về dung sai, giữ biên bản + ghi chú */
export type MismatchAction = 'created' | 'updated' | 'noted' | null
export interface EditOutcome { changed: string[]; mismatchAction: MismatchAction; mismatchId: ID | null; message: string }
export type Edited<T> = T & { editOutcome: EditOutcome }

export interface WeighingEdit {
  id: ID; kgExpected?: number; kgActual?: number; signers?: Partial<Weighing['signers']>
  /** lý do sửa — bắt buộc khi đổi số kg */
  reason?: string
  /** lý do sai lệch (danh mục) nếu phải lập biên bản mới */
  mismatchReason?: string; reasonNote?: string
}
export interface ReceiptEdit { id: ID; qty?: number; kg?: number; note?: string; reason?: string }
export interface TaskEdit {
  id: ID; driver?: string; kgRequired?: number; refId?: string; note?: string
  kgAtGalv?: number; kgPicked?: number; kgDelivered?: number
  reason?: string; mismatchReason?: string; reasonNote?: string
}
export interface MismatchEdit { id: ID; reason?: string; reasonNote?: string; editNote?: string }
export interface LsxEdit { id: ID; name?: string; qtyPlan?: number; kgPlan?: number; leadDays?: number; deadline?: string; reason?: string }
export interface TaskReassign { id: ID; driver: string; kgRequired?: number; note?: string }
export interface LsxReissue { id: ID; leadDays?: number; qtyPlan?: number; kgPlan?: number; note?: string }

export type EditedWeighing = Edited<Weighing>
export type EditedReceipt = Edited<Receipt>
export type EditedTask = Edited<Task>
export type EditedMismatch = Edited<Mismatch>
export type EditedLsx = Edited<Lsx>

/** Sổ xuất Excel (GET /api/export/{kind}.xlsx). */
export type ExportKind = 'orders' | 'contracts' | 'lsx' | 'receipts' | 'weighings' | 'tasks' | 'mismatches' | 'vloss' | 'movement-log'
/** Bộ lọc gửi kèm (giống API danh sách) — `ids` = mã các dòng đang hiển thị khi màn hình có lọc thêm phía giao diện. */
export interface ExportParams {
  contract_id?: string; lsx_id?: string; status?: string; type?: TaskType; driver?: string; source?: string
  due?: string; kind?: string; date_from?: string; date_to?: string; q?: string; ids?: string
}
