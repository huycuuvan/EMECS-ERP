// Kiểu dữ liệu khớp 1-1 với backend/app/serializers.py (camelCase, ngày dạng ISO string UTC).

export type ID = string

export interface OrderItem { id?: number; name: string; qty: number; unit: string; kg: number; price: number }
export type OrderStatus = 'Chốt đơn' | 'Đã chuyển kế toán' | 'Đã có hợp đồng'
export interface Order {
  id: ID; customer: string; code: string; date: string; file: string | null; items: OrderItem[]
  totalKg: number; value: number; status: OrderStatus; contractId: ID | null; note: string
}

export interface Payment { id: number; date: string; amount: number; type: string; note: string }
export type ContractStatus = 'Soạn thảo' | 'Đã trả khách' | 'Đã ký' | 'Đang triển khai' | 'Hoàn thành'
export interface Contract {
  id: ID; orderId: ID; code: string; customer: string; sentToKtAt: string; dueAt: string
  returnedAt: string | null; signDate: string | null; status: ContractStatus; owner: string
  totalQty: number; unit: string; totalKg: number; unitPrice: number; value: number; vatPct: number
  advance: { pct: number; required: number; received: number; receivedAt: string | null }
  payments: Payment[]; note: string
}
export interface DueInfo { state: 'ok' | 'fine' | 'due' | 'overdue'; label: string; days: number }
export interface AdvanceInfo { state: 'none' | 'wait' | 'ok' | 'missing'; label: string }
/** GET /contracts trả kèm due/adv */
export interface ContractRow extends Contract { due: DueInfo; adv: AdvanceInfo }

export type LsxStatus = 'Chờ nhận' | 'Đang SX' | 'Từ chối' | 'Hoàn thành'
export interface Lsx {
  id: ID; contractId: ID; name: string; assignedAt: string; assignedBy: string; leadDays: number
  deadline: string; status: LsxStatus; acceptedAt: string | null; acceptedBy: string | null
  rejectReason: string | null; qtyPlan: number; kgPlan: number; qtyDone: number; kgDone: number
  extension: { to: string; reason: string; approvedBy: string; at: string } | null
  log: { at: string; text: string }[]
}

export interface Receipt { id: ID; lsxId: ID; contractId: ID; date: string; qty: number; kg: number; by: string; note: string }

export type WeighingStatus = 'Chờ cân' | 'Đã cân' | 'Lệch — chờ ký'
export interface Weighing {
  id: ID; contractId: ID; lsxId: ID; date: string; kgExpected: number; kgActual: number | null
  /** chỉ có ở API chi tiết (GET /weighings/{id}); danh sách trả null, dùng hasPhoto */
  photo: string | null; hasPhoto: boolean
  signers: { bocXep: string; kho: string; laiXe: string }
  by: string; mismatchId: ID | null; status: WeighingStatus; lossAccepted: boolean
}

export type TaskType = 'di_ma' | 'giao_khach'
export type TaskStatus = 'Chờ xác nhận' | 'Đã nhận' | 'Từ chối' | 'Đang chạy' | 'Hoàn thành'
export interface Task {
  id: ID; type: TaskType; driver: string; contractId: ID; refId: ID | null; assignedAt: string
  status: TaskStatus; acceptedAt: string | null; departedAt: string | null; fillDeadline: string | null
  kgRequired: number; kgAtGalv: number | null; kgPicked: number | null; kgDelivered: number | null
  filledAt: string | null; photo: string | null; hasPhoto: boolean; rejectReason: string | null
  mismatchId: ID | null; note: string; lossAccepted: boolean
}

export type MismatchStatus = 'Chờ QL ký' | 'Đã ký xác nhận'
export interface Mismatch {
  id: ID; source: string; refType: 'pc' | 'vc'; refId: ID; contractId: ID; date: string
  expected: number; actual: number; delta: number; reason: string; reasonNote: string
  reportedBy: string; dept: string; status: MismatchStatus; signedBy: string | null; signedAt: string | null
}

export interface VLoss {
  id: ID; date: string; refType: 'pc' | 'vc'; refId: ID; contractId: ID; source: string; kg: number
  approvedBy: string; note: string; status: 'Đang treo' | 'Đã xử lý'; resolution: string | null
  resolvedAt: string | null; resolvedNote: string | null
}
export interface PendingDelta {
  refType: 'pc' | 'vc'; id: ID; contractId: ID; source: string; date: string | null
  expected: number; actual: number; delta: number; mismatchId: ID | null
}

export interface Check { label: string; a: number; b: number; aLbl: string; bLbl: string; note: string; key: boolean; delta: number; ok: boolean }
/** GET /contracts/{id} — tổng hợp đối ứng theo hợp đồng (port contractAgg) */
export interface ContractAgg {
  contract: Contract
  lsxs: Lsx[]; receipts: Receipt[]; weighings: Weighing[]; tasksDiMa: Task[]; tasksGiao: Task[]
  producedKg: number; producedQty: number; receivedKg: number; weighedKg: number; sentGalvKg: number
  inTransitToGalvKg: number; atGalvKg: number; pickedKg: number; deliveredKg: number; stockKg: number
  deliveredValue: number; paidTotal: number; debt: number
  pctProduced: number; pctDelivered: number; pctPaid: number
  checks: Check[]; mismatches: Mismatch[]; due: DueInfo; adv: AdvanceInfo
}
/** Bản rút gọn trong /dashboard (không có các list con) */
export type ContractAggLite = Omit<ContractAgg, 'lsxs' | 'receipts' | 'weighings' | 'tasksDiMa' | 'tasksGiao'>

export type LedgerKey = 'kho' | 'duong' | 'ma' | 'giao' | 'lech'
export interface LedgerRow {
  date: string | null; id: ID; type: 'ptn' | 'pc' | 'vc'; kg: number; label: string
  delta: Partial<Record<LedgerKey, number>>; after: Record<LedgerKey, number>; zeroed: LedgerKey[]
  source?: boolean; mismatchId?: ID | null
}
export interface Ledger { contract: Contract; rows: LedgerRow[]; final: Record<LedgerKey, number>; totalIn: number; allocated: number; balanced: boolean }

export interface MovementRow { kind: string; type: 'ptn' | 'pc' | 'vc'; id: ID; contractId: ID; date: string | null; kg: number | null; desc: string; who: string }
export interface OverdueDoc { kind: string; type: 'pc' | 'vc'; id: ID; contractId: ID; person: string; dept: string; deadline: string; hoursOver: number; missing: string }

export interface Dashboard {
  activeContracts: number; deliveredKgTotal: number
  contractAlerts: { contract: Contract; due: DueInfo; adv: AdvanceInfo }[]
  overdueDocs: OverdueDoc[]; pendingMismatches: Mismatch[]; pendingMismatchKg: number
  pendingLSX: Lsx[]; pendingTasks: Task[]; contracts: ContractAggLite[]
}

export interface Notification { id: number; at: string; title: string; sub: string; type: 'info' | 'success' | 'warning' | 'error'; read: boolean }

export type RoleId = 'admin' | 'kt' | 'sx' | 'kho' | 'lx'
export type AccessLevel = 'full' | 'limited' | 'view'
/** Người dùng đăng nhập — permissions đã tính sẵn ở server (nhiều vai trò → mức cao nhất). */
export interface AuthUser {
  id: string; name: string; dept: string; phone: string; roles: RoleId[]; active: boolean
  mustChangePassword: boolean; createdAt: string | null; lastLoginAt: string | null
  permissions: Record<string, AccessLevel>
}
export interface AuditLog { id: number; at: string; userId: string | null; userName: string | null; method: string; path: string; status: number }

export interface Meta {
  people: Record<string, { name: string; dept: string; role: RoleId; roles: RoleId[] }>
  drivers: string[]; roles: { id: RoleId; label: string }[]
  permissions: Partial<Record<RoleId, Record<string, AccessLevel>>>
  reasonsCan: string[]; reasonsTuChoiSx: string[]; reasonsTuChoiLx: string[]; vlossResolutions: string[]
  toleranceKg: number; fillHours: number; contractDays: number
  /** phiếu cân chưa có số/ảnh sau N giờ → quá hạn */
  pcFillHours: number
}
