// Kiểu dữ liệu khớp 1-1 với backend/app/serializers.py (camelCase, ngày dạng ISO string UTC).

export type ID = string

/** Dòng hàng theo file đặt hàng của khách: Tổng KL = SL × KL/1 bộ; Thành tiền = Tổng KL × Đơn giá (đ/kg). */
export interface OrderItem { id?: number; name: string; qty: number; unit: string; kgPerUnit?: number | null; kg: number; price: number; amount?: number; note?: string }
export type OrderStatus = 'Chốt đơn' | 'Đã chuyển kế toán' | 'Đã có hợp đồng'
export interface Order {
  id: ID; customer: string; code: string; date: string; file: string | null; items: OrderItem[]
  totalKg: number; value: number; status: OrderStatus; contractId: ID | null; note: string
  vatPct: number; vatAmount: number; valueAfterVat: number; customerId?: number | null; completeBy: string | null; deliverBy?: string | null
}

/** Kết quả đọc file Excel đặt hàng (POST /orders/import-excel) — chưa lưu. */
export interface OrderExcelImport {
  sheet: string; fileName: string; customer: string; customerId: number | null; items: OrderItem[]
  vatPct: number; totalKg: number; value: number; vatAmount: number; valueAfterVat: number; warnings: string[]
}

/** Tiền về: kế toán nhập → Quản lý duyệt mới tính vào tiền đã về / tạm ứng / công nợ. */
export type PaymentStatus = 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'
/** Xin gia hạn trả hợp đồng: kế toán nhập lý do → Quản lý duyệt (+5 ngày) / từ chối. */
export interface ContractExtension {
  id: number; contractId: ID; reason: string; requestedBy: string; requestedAt: string
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'; days: number; oldBy: string | null; newBy: string | null
  decidedBy: string | null; decidedAt: string | null; rejectReason: string | null
}
export interface Payment {
  id: number; date: string; amount: number; type: string; note: string
  status: PaymentStatus; createdBy: string; approvedBy: string | null; approvedAt: string | null; rejectReason: string | null
}
export const paidOf = (ps: Payment[] = []) => ps.filter((p) => p.status === 'Đã duyệt').reduce((s, p) => s + (p.amount || 0), 0)
/** Hợp đồng: "Chờ soạn thảo" (vừa nhận đơn) rồi 4 bước kế toán. */
export type ContractStatus = 'Chờ soạn thảo' | 'Đã soạn thảo' | 'Đã gửi khách hàng' | 'Đã nhận về' | 'Đã hoàn thành'
export const CONTRACT_STEPS: ContractStatus[] = ['Đã soạn thảo', 'Đã gửi khách hàng', 'Đã nhận về', 'Đã hoàn thành']
export interface Contract {
  id: ID; orderId: ID; code: string; customer: string; sentToKtAt: string; dueAt: string
  returnedAt: string | null; signDate: string | null; status: ContractStatus; owner: string
  totalQty: number; unit: string; totalKg: number; unitPrice: number; value: number; vatPct: number
  advance: { pct: number; required: number; received: number; receivedAt: string | null }
  payments: Payment[]; note: string
  number: string; completeBy: string | null; deliverBy: string | null; signedFile: string | null; draftedAt: string | null; completedAt: string | null; pendingPayment: number
  /** giá trị HĐ đã gồm VAT */
  valueAfterVat: number
}
/** Cảnh báo theo 1 mốc hạn: hạn trả hợp đồng (complete) hoặc hạn giao hàng (deliver). */
export interface CompleteInfo { state: 'none' | 'ok' | 'fine' | 'soon' | 'overdue'; label: string; days: number | null }
export interface AdvanceInfo { state: 'none' | 'wait' | 'ok' | 'missing'; label: string }
/** GET /contracts trả kèm adv + 2 mốc: complete = hạn trả hợp đồng (kế toán), deliver = hạn giao hàng cho khách */
export interface ContractRow extends Contract { adv: AdvanceInfo; complete: CompleteInfo; deliver: CompleteInfo; pendingExtension: ContractExtension | null; billedKg: number; billPendingKg: number
  /** công nợ: giá trị hàng đã giao (theo giá từng mặt hàng) gồm VAT, và số còn nợ */
  billedValue: number; debt: number }

export type LsxStatus = 'Chờ nhận' | 'Đang SX' | 'Từ chối' | 'Hoàn thành'
/** Sản lượng 1 ngày xưởng báo (kg; không làm = 0) + giờ nhập / sửa. */
export interface LsxDay {
  id: number; day: string; kg: number; cumKg: number; note: string
  createdAt: string | null; createdBy: string; updatedAt: string | null; updatedBy: string | null; prevKg: number | null
}
export interface Lsx {
  id: ID; contractId: ID; name: string; assignedAt: string; assignedBy: string; leadDays: number
  deadline: string; status: LsxStatus; acceptedAt: string | null; acceptedBy: string | null
  rejectReason: string | null; qtyPlan: number; kgPlan: number; qtyDone: number; kgDone: number
  extension: { to: string; reason: string; approvedBy: string; at: string } | null
  log: { at: string; text: string }[]
  daily: LsxDay[]; lastUpdateAt: string | null; today: LsxDayEntry | null
  /** sản lượng hôm qua; missedYesterday = hôm qua xưởng KHÔNG nhập (kể cả 0); missedDays = các ngày bỏ trống (mới → cũ) */
  yesterday: LsxDayEntry | null; missedYesterday: boolean; missedDays: string[]
}
export interface LsxDayEntry { kg: number; at: string | null; edited: boolean }

export interface ReceiptLine { itemId: number; name: string; unit: string; qty: number; kgPerUnit: number; kg: number }
/** kgStock: KG tính tồn kho — đã cân thì = số cân (chênh với số QL giao do Quản lý tự xử lý, không theo dõi) */
export interface Receipt { id: ID; lsxId: ID; contractId: ID; date: string; qty: number; kg: number; by: string; note: string; items: ReceiptLine[]; kgStock?: number }
export const stockKgOf = (r: Receipt) => Number(r.kgStock ?? r.kg) || 0

export type WeighingStatus = 'Chờ cân' | 'Đã cân' | 'Lệch — chờ ký' | 'Chờ QL duyệt' | 'QL từ chối'
export interface Weighing {
  id: ID; contractId: ID; lsxId: ID; date: string; kgExpected: number; kgActual: number | null
  /** chỉ có ở API chi tiết (GET /weighings/{id}); danh sách trả null, dùng hasPhoto */
  photo: string | null; hasPhoto: boolean
  signers: { bocXep: string; kho: string; laiXe: string }
  by: string; mismatchId: ID | null; status: WeighingStatus; lossAccepted: boolean
  /** phiếu chuẩn bị hàng QL giao xuống kho; cân xe: tổng (xe + hàng), xe, giờ vào / ra */
  receiptId: ID | null; grossKg: number | null; tareKg: number | null; weighInAt: string | null; weighOutAt: string | null
  vehiclePlate: string | null; approved: boolean
  reason: string | null; reasonNote: string | null; approvedBy: string | null; approvedAt: string | null; rejectReason: string | null
}

export type TaskType = 'di_ma' | 'giao_khach'
export type TaskStatus = 'Chờ xác nhận' | 'Đã nhận' | 'Từ chối' | 'Đang chạy' | 'Chờ QL duyệt' | 'Hoàn thành'
export interface Task {
  id: ID; type: TaskType; driver: string; contractId: ID; refId: ID | null; assignedAt: string
  status: TaskStatus; acceptedAt: string | null; departedAt: string | null; fillDeadline: string | null
  kgRequired: number; kgAtGalv: number | null; kgPicked: number | null; kgDelivered: number | null
  /** thẻ giao khách chưa lấy hàng: kg của HĐ còn tại xưởng mạ */
  galvLeftKg?: number
  filledAt: string | null; photo: string | null; hasPhoto: boolean; rejectReason: string | null
  mismatchId: ID | null; note: string; lossAccepted: boolean
  vehiclePlate?: string | null; galvanizerId?: number | null
  /** ngày giờ lái xe phải có mặt */
  arriveAt: string | null
  /** giao khách: thông tin nơi giao (lấy từ danh mục khách hàng, sửa được theo chuyến) */
  deliver: DeliverInfo | null
  /** phiếu lệch: lý do lái xe ghi → Quản lý chấp nhận / không chấp nhận (qlRejectReason → lái xe điền lại) */
  reason?: string | null; reasonNote?: string | null; approvedBy?: string | null; approvedAt?: string | null; qlRejectReason?: string | null
}
export interface DeliverInfo {
  customerId: number | null; name: string; address: string; receiverName: string; receiverPhone: string
  contactName: string; contactPhone: string
}

export type MismatchStatus = 'Chờ QL ký' | 'Đã ký xác nhận'
export interface Mismatch {
  id: ID; source: string; refType: 'pc' | 'vc'; refId: ID; contractId: ID; date: string
  expected: number; actual: number; delta: number; reason: string; reasonNote: string
  reportedBy: string; dept: string; status: MismatchStatus; signedBy: string | null; signedAt: string | null
}

export interface VLoss {
  id: ID; date: string; refType: 'pc' | 'vc' | 'nl'; refId: ID; contractId: ID; source: string; kg: number
  approvedBy: string; note: string; status: 'Đang treo' | 'Đã xử lý' | 'Đã ghi nhận'; resolution: string | null
  resolvedAt: string | null; resolvedNote: string | null
  /** lý do chênh lệch (lái xe / kho ghi) + công thức: số gốc (a) − số cân sau (b) = chênh */
  reason?: string
  formula?: { aLabel: string; a: number; bLabel: string; b: number; delta: number; text: string } | null
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
  deliveredValue: number; paidTotal: number; debt: number; pendingPayment: number; complete: CompleteInfo; deliver: CompleteInfo
  /** giá trị hàng đã giao trước VAT / tiền VAT / giá trị từng phiếu cân (trước VAT, theo giá từng mặt hàng) */
  deliveredValuePre: number; deliveredVat: number; billedValues: Record<string, number>
  extensions: ContractExtension[]
  /** công nợ tính theo kg cân xuất đã đạt / đã duyệt; kg đang chờ QL duyệt */
  billedKg: number; billPendingKg: number
  pctProduced: number; pctDelivered: number; pctPaid: number
  checks: Check[]; mismatches: Mismatch[]; adv: AdvanceInfo
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
  contractAlerts: { contract: Contract; adv: AdvanceInfo; complete: CompleteInfo; deliver: CompleteInfo }[]
  pendingPayments: (Payment & { contractId: ID; customer: string })[]
  pendingExtensions: (ContractExtension & { customer: string; complete: CompleteInfo })[]
  overdueDocs: OverdueDoc[]; pendingMismatches: Mismatch[]; pendingMismatchKg: number
  pendingLSX: Lsx[]; pendingTasks: Task[]; contracts: ContractAggLite[]
  /** lệnh đang SX mà hôm qua xưởng không nhập sản lượng */
  lsxMissedYesterday: Lsx[]
}

export interface Notification { id: number; at: string; title: string; sub: string; type: 'info' | 'success' | 'warning' | 'error'; read: boolean; refId: string | null }

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
  toleranceKg: number; pcTolerancePct?: number; fillHours: number; contractDays: number
  /** phiếu cân chưa có số/ảnh sau N giờ → quá hạn */
  pcFillHours: number
}

/* ---------------------------------------------------------------- soạn thảo hợp đồng theo mẫu */
export interface Party { name: string; address: string; phone: string; banks: string[]; taxCode: string; representative: string; title: string }
export interface DocLine {
  itemId: number; stt: number; name: string; unit: string; qty: number; kg: number; pricePerKg: number
  defaultUnitPrice: number; unitPrice: number; custom: boolean; amount: number
}
/** GET /contracts/{id}/document — phần KT nhập (ô vàng) + dữ liệu tự điền (chữ đỏ) + số đã tính. */
export interface ContractDocument {
  contractId: ID; orderId: ID; status: ContractStatus; locked: boolean; draftedAt: string | null
  number: string; date: string | null; dateText: string; basis: string[]
  buyer: Party; buyerAuto: Party; buyerCustom: boolean; customerId: number | null; seller: Party; scope: string
  lines: DocLine[]; total: number; vatPct: number; vat: number; grandTotal: number; words: string; wordsAuto: string
  priceIncludes: string[]; paymentMethod: string; advances: { amount: number; words: string }[]; paymentRest: string[]
  conditions: string[]; warranty: string; deliveryTime: string; deliveryPlace: string; acceptancePlace: string
  completeBy: string | null
}
export interface ContractDraftInput {
  number?: string; date?: string | null; basis?: string[]; buyer?: Party | null; scope?: string
  prices?: Record<string, number | null>; vatPct?: number; words?: string | null; priceIncludes?: string[]
  paymentMethod?: string; advances?: number[]; paymentRest?: string[]; conditions?: string[]; warranty?: string
  deliveryTime?: string; deliveryPlace?: string; acceptancePlace?: string
}
