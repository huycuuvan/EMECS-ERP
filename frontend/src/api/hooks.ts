/* React Query hooks cho toàn bộ API. Mọi mutation tự invalidate toàn bộ cache dữ liệu nghiệp vụ
   (dữ liệu liên đới chéo nhiều màn: một phiếu cân đổi → hợp đồng, dashboard, sai lệch đều đổi). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { api, errorMessage, tokenStore } from './client'
import type {
  AuditLog, AuthUser, Contract, ContractAgg, ContractDocument, ContractDraftInput, ContractRow, Dashboard, Party, ID, Ledger, Lsx, Meta, Mismatch, MovementRow, Notification,
  Order, OrderItem, OverdueDoc, PendingDelta, Receipt, Task, TaskType, VLoss, Weighing,
} from './types'

const get = <T,>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data)
const post = <T,>(url: string, body?: object) => api.post<T>(url, body ?? {}).then((r) => r.data)

/* ---------------------------------------------------------------- queries */
export const qk = {
  meta: ['meta'],
  dashboard: ['dashboard'],
  orders: ['orders'], order: (id: ID) => ['orders', id],
  contracts: ['contracts'], contract: (id: ID) => ['contracts', id], ledger: (id: ID) => ['contracts', id, 'ledger'],
  lsx: (p?: object) => ['lsx', p ?? {}], lsxOne: (id: ID) => ['lsx', 'one', id],
  receipts: (p?: object) => ['receipts', p ?? {}], receipt: (id: ID) => ['receipts', 'one', id],
  weighings: (p?: object) => ['weighings', p ?? {}], weighing: (id: ID) => ['weighings', 'one', id],
  tasks: (p?: object) => ['tasks', p ?? {}], task: (id: ID) => ['tasks', 'one', id],
  mismatches: (p?: object) => ['mismatches', p ?? {}], mismatch: (id: ID) => ['mismatches', 'one', id],
  vloss: ['vloss'], vlossOne: (id: ID) => ['vloss', 'one', id], pendingDeltas: ['vloss', 'pending'],
  movement: (p?: object) => ['reports', 'movement', p ?? {}], overdue: ['reports', 'overdue'],
  notifications: ['notifications'],
  users: ['users'], audit: (p?: object) => ['audit', p ?? {}],
}

export const useMeta = () => useQuery({ queryKey: qk.meta, queryFn: () => get<Meta>('/meta'), staleTime: Infinity, enabled: !!tokenStore.get() })
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => get<Dashboard>('/dashboard') })

export const useOrders = () => useQuery({ queryKey: qk.orders, queryFn: () => get<Order[]>('/orders') })
export const useOrder = (id?: ID) => useQuery({ queryKey: qk.order(id!), queryFn: () => get<Order>(`/orders/${id}`), enabled: !!id })

export const useContracts = () => useQuery({ queryKey: qk.contracts, queryFn: () => get<ContractRow[]>('/contracts') })
/** Chi tiết + tổng hợp đối ứng (contractAgg). */
export const useContract = (id?: ID | null) => useQuery({ queryKey: qk.contract(id!), queryFn: () => get<ContractAgg>(`/contracts/${id}`), enabled: !!id })
export const useLedger = (id?: ID | null) => useQuery({ queryKey: qk.ledger(id!), queryFn: () => get<Ledger>(`/contracts/${id}/ledger`), enabled: !!id })

export const useLsxList = (p?: { contractId?: ID }) => useQuery({ queryKey: qk.lsx(p), queryFn: () => get<Lsx[]>('/lsx', { contract_id: p?.contractId }) })
export const useLsx = (id?: ID | null) => useQuery({ queryKey: qk.lsxOne(id!), queryFn: () => get<Lsx>(`/lsx/${id}`), enabled: !!id })

export const useReceipts = (p?: { contractId?: ID; lsxId?: ID }) => useQuery({ queryKey: qk.receipts(p), queryFn: () => get<Receipt[]>('/receipts', { contract_id: p?.contractId, lsx_id: p?.lsxId }) })
export const useReceipt = (id?: ID | null) => useQuery({ queryKey: qk.receipt(id!), queryFn: () => get<Receipt>(`/receipts/${id}`), enabled: !!id })

/** Danh sách KHÔNG có ảnh (photo=null, xem hasPhoto); mở chi tiết bằng useWeighing để lấy ảnh. */
export const useWeighings = (p?: { contractId?: ID }) => useQuery({ queryKey: qk.weighings(p), queryFn: () => get<Weighing[]>('/weighings', { contract_id: p?.contractId }) })
export const useWeighing = (id?: ID | null) => useQuery({ queryKey: qk.weighing(id!), queryFn: () => get<Weighing>(`/weighings/${id}`), enabled: !!id })

export const useTasks = (p?: { contractId?: ID; type?: TaskType; driver?: string }) => useQuery({ queryKey: qk.tasks(p), queryFn: () => get<Task[]>('/tasks', { contract_id: p?.contractId, type: p?.type, driver: p?.driver }) })
export const useTask = (id?: ID | null) => useQuery({ queryKey: qk.task(id!), queryFn: () => get<Task>(`/tasks/${id}`), enabled: !!id })

export const useMismatches = (p?: { contractId?: ID; status?: string }) => useQuery({ queryKey: qk.mismatches(p), queryFn: () => get<Mismatch[]>('/mismatches', { contract_id: p?.contractId, status: p?.status }) })
export const useMismatch = (id?: ID | null) => useQuery({ queryKey: qk.mismatch(id!), queryFn: () => get<Mismatch>(`/mismatches/${id}`), enabled: !!id })

export const useVlossList = () => useQuery({ queryKey: qk.vloss, queryFn: () => get<VLoss[]>('/vloss') })
export const useVloss = (id?: ID | null) => useQuery({ queryKey: qk.vlossOne(id!), queryFn: () => get<VLoss>(`/vloss/${id}`), enabled: !!id })
export const usePendingDeltas = () => useQuery({ queryKey: qk.pendingDeltas, queryFn: () => get<PendingDelta[]>('/vloss/pending-deltas') })

export const useMovementLog = (p?: { contractId?: ID; from?: string; to?: string }) =>
  useQuery({ queryKey: qk.movement(p), queryFn: () => get<MovementRow[]>('/reports/movement-log', { contract_id: p?.contractId, date_from: p?.from, date_to: p?.to }) })
export const useOverdueDocs = () => useQuery({ queryKey: qk.overdue, queryFn: () => get<OverdueDoc[]>('/reports/overdue-docs') })

export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => get<Notification[]>('/notifications'), refetchInterval: 30_000 })

/* ---------------------------------------------------------------- mutations */
/** Tạo mutation có toast lỗi chuẩn + invalidate toàn bộ cache. `success` là text toast khi thành công. */
function useAction<TVars, TRes>(fn: (v: TVars) => Promise<TRes>, success?: string | ((r: TRes) => string)) {
  const qc = useQueryClient()
  const { message } = App.useApp()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'meta' })
      if (success) message.success(typeof success === 'function' ? success(r) : success)
    },
    onError: (e) => { message.error(errorMessage(e)) },
  })
}

export type OrderInput = { customer: string; customerId?: number; code?: string; items: Omit<OrderItem, 'id' | 'amount'>[]; file?: string; note?: string; vatPct?: number }
export const useCreateOrder = () => useAction((v: OrderInput) => post<Order>('/orders', v), (o) => `Đã tạo đơn ${o.id}`)
export const useUpdateOrder = () => useAction(({ id, ...v }: Partial<OrderInput> & { id: ID }) => api.patch<Order>(`/orders/${id}`, v).then((r) => r.data), (o) => `Đã lưu đơn ${o.id}`)
export const useSendOrderToKT = () => useAction(({ id, completeBy }: { id: ID; completeBy: string }) => post<Contract>(`/orders/${id}/send-to-kt`, { completeBy }), (c) => `Đã chuyển kế toán — tạo hợp đồng ${c.id}`)

export type ContractPatch = { id: ID; owner?: string; dueAt?: string; unitPrice?: number; advancePct?: number; note?: string }
export const useUpdateContract = () => useAction(({ id, ...v }: ContractPatch) => api.patch<Contract>(`/contracts/${id}`, v).then((r) => r.data), (c) => `Đã lưu hợp đồng ${c.id}`)
export const useContractReturned = () => useAction((id: ID) => post<Contract>(`/contracts/${id}/returned`), (c) => `${c.id}: đã gửi hợp đồng cho khách hàng — đã báo Quản lý`)
export const useContractSigned = () => useAction((id: ID) => post<Contract>(`/contracts/${id}/signed`), (c) => `${c.id}: đã nhận về hợp đồng khách ký`)
export const useContractCompleted = () => useAction((id: ID) => post<Contract>(`/contracts/${id}/completed`), (c) => `${c.id}: đã hoàn thành`)
export const useRecordPayment = () => useAction(({ id, ...v }: { id: ID; amount: number; type: string; note?: string }) => post<Contract>(`/contracts/${id}/payments`, v), 'Đã ghi tiền về — chờ Quản lý duyệt')
export const useApprovePayment = () => useAction((pid: number) => post<Contract>(`/payments/${pid}/approve`), 'Đã duyệt tiền về')
export const useRejectPayment = () => useAction(({ pid, reason }: { pid: number; reason: string }) => post<Contract>(`/payments/${pid}/reject`, { reason }), 'Đã từ chối khoản tiền về')

/* soạn thảo hợp đồng theo mẫu + thông tin công ty (Bên B) */
export const useContractDocument = (id?: ID) => useQuery({ queryKey: ['contracts', id, 'document'], queryFn: () => get<ContractDocument>(`/contracts/${id}/document`), enabled: !!id })
export const useSaveContractDocument = () => useAction(({ id, ...v }: ContractDraftInput & { id: ID }) => api.put<ContractDocument>(`/contracts/${id}/document`, v).then((r) => r.data), 'Đã lưu bản soạn thảo hợp đồng')
export const useSeller = () => useQuery({ queryKey: ['settings', 'seller'], queryFn: () => get<Party>('/settings/seller') })
export const useSaveSeller = () => useAction((v: Party) => api.put<Party>('/settings/seller', v).then((r) => r.data), 'Đã lưu thông tin công ty (Bên B)')

export const useCreateLsx = () => useAction((v: { contractId: ID; name?: string; qty?: number; kg: number; leadDays: number }) => post<Lsx>('/lsx', v), (x) => `Đã phát lệnh ${x.id}`)
export const useLsxAccept = () => useAction((id: ID) => post<Lsx>(`/lsx/${id}/accept`), (x) => `Xưởng đã nhận lệnh ${x.id}`)
export const useLsxReject = () => useAction(({ id, reason }: { id: ID; reason: string }) => post<Lsx>(`/lsx/${id}/reject`, { reason }), (x) => `Đã từ chối ${x.id}`)
export const useLsxDaily = () => useAction(({ id, ...v }: { id: ID; day?: string; kg: number; note?: string }) => post<Lsx>(`/lsx/${id}/daily`, v), (x) => `Đã ghi sản lượng ${x.id} — lũy kế ${x.kgDone.toLocaleString('vi-VN')} kg`)
export const useLsxExtend = () => useAction(({ id, ...v }: { id: ID; to: string; reason: string }) => post<Lsx>(`/lsx/${id}/extend`, v), (x) => `Đã duyệt gia hạn ${x.id}`)

export const useCreateReceipt = () => useAction((v: { lsxId: ID; qty?: number; kg?: number; note?: string; items?: { itemId: number; qty: number }[]; driver?: string; vehiclePlate?: string; galvanizerId?: number; arriveAt?: string; fillDeadline?: string }) => post<Receipt>('/receipts', v), (r) => `Đã lập phiếu chuẩn bị hàng ${r.id}`)

/** sourceId: PTN-… hoặc LSX-… */
export const useCreateWeighing = () => useAction((v: { sourceId: ID; kgExpected: number }) => post<Weighing>('/weighings', v), (p) => `Đã tạo phiếu cân ${p.id}`)
export const useApproveWeighing = () => useAction((id: ID) => post<Weighing>(`/weighings/${id}/approve`), (p) => `Đã duyệt ${p.id} — tính vào công nợ`)
export const useRejectWeighing = () => useAction(({ id, reason }: { id: ID; reason: string }) => post<Weighing>(`/weighings/${id}/reject`, { reason }), (p) => `Đã từ chối ${p.id} — kho cân lại`)
export const useFillWeighing = () => useAction(({ id, ...v }: { id: ID; kgActual?: number; grossKg?: number; tareKg?: number; weighInAt?: string; weighOutAt?: string; vehiclePlate?: string; photo?: string | null; reason?: string; reasonNote?: string; signerLaiXe?: string }) => post<Weighing>(`/weighings/${id}/fill`, v),
  (p) => p.mismatchId ? `${p.id}: LỆCH vượt dung sai — đã tạo ${p.mismatchId} chờ Quản lý ký` : `${p.id}: đã cân`)
export const useWeighingPhoto = () => useAction(({ id, photo }: { id: ID; photo: string | null }) => api.put<Weighing>(`/weighings/${id}/photo`, { photo }).then((r) => r.data), 'Đã cập nhật ảnh phiếu')

export const useApproveTask = () => useAction((id: ID) => post<Task>(`/tasks/${id}/approve`), (t) => `Đã chấp nhận phiếu ${t.id}`)
export const useRejectTaskFill = () => useAction(({ id, reason }: { id: ID; reason: string }) => post<Task>(`/tasks/${id}/reject-fill`, { reason }), (t) => `Không chấp nhận ${t.id} — lái xe điền lại`)
export const useCreateTask = () => useAction((v: { type: TaskType; driver: string; contractId: ID; refId?: ID | null; note?: string; arriveAt: string; fillDeadline?: string; vehiclePlate?: string | null; galvanizerId?: number | null; deliverCustomerId?: number | null; deliverName?: string; deliverAddress?: string; receiverName?: string; receiverPhone?: string; contactName?: string; contactPhone?: string }) => post<Task>('/tasks', v), (t) => `Đã giao thẻ ${t.id} cho ${t.driver}`)
export const useTaskAccept = () => useAction((id: ID) => post<Task>(`/tasks/${id}/accept`), (t) => `${t.id}: đã nhận việc`)
export const useTaskReject = () => useAction(({ id, reason }: { id: ID; reason: string }) => post<Task>(`/tasks/${id}/reject`, { reason }), (t) => `${t.id}: đã từ chối`)
export const useTaskDepart = () => useAction((id: ID) => post<Task>(`/tasks/${id}/depart`), (t) => `${t.id}: xe đã xuất phát — hạn điền phiếu 24h`)
export const useTaskFillGalv = () => useAction(({ id, ...v }: { id: ID; kg: number; photo?: string | null; reason?: string; reasonNote?: string }) => post<Task>(`/tasks/${id}/fill-galv`, v),
  (t) => t.mismatchId ? `${t.id}: LỆCH — đã tạo ${t.mismatchId}` : `${t.id}: mạ đã xác nhận`)
export const useTaskFillDelivery = () => useAction(({ id, ...v }: { id: ID; kgPicked: number; kgDelivered: number; photo?: string | null; reason?: string; reasonNote?: string }) => post<Task>(`/tasks/${id}/fill-delivery`, v),
  (t) => t.mismatchId ? `${t.id}: LỆCH — đã tạo ${t.mismatchId}` : `${t.id}: đã giao khách`)
export const useTaskPhoto = () => useAction(({ id, photo }: { id: ID; photo: string | null }) => api.put<Task>(`/tasks/${id}/photo`, { photo }).then((r) => r.data), 'Đã cập nhật ảnh phiếu')

export const useSignMismatch = () => useAction((id: ID) => post<Mismatch>(`/mismatches/${id}/sign`), (m) => `Đã ký xác nhận ${m.id}`)
export const useAcceptLoss = () => useAction((v: { refType: 'pc' | 'vc'; refId: ID; note?: string }) => post<VLoss>('/vloss/accept-loss', v), (e) => `Đã chuyển kho ảo ${e.id}`)
export const useResolveVloss = () => useAction(({ id, ...v }: { id: ID; resolution: string; note?: string }) => post<VLoss>(`/vloss/${id}/resolve`, v), (e) => `Đã xử lý ${e.id}`)

export const useReadAllNotifications = () => useAction(() => post('/notifications/read-all'))
export const useResetDemo = () => useAction(() => post('/admin/reset'), 'Đã khôi phục dữ liệu demo')

/* ---------------------------------------------------------------- người dùng (Quản lý) */
export type UserInput = { name: string; phone: string; dept?: string; roles: string[]; password: string }
export const useUsers = () => useQuery({ queryKey: qk.users, queryFn: () => get<AuthUser[]>('/users') })
export const useAuditLogs = (p?: { userId?: string; limit?: number }) =>
  useQuery({ queryKey: qk.audit(p), queryFn: () => get<AuditLog[]>('/audit-logs', { user_id: p?.userId, limit: p?.limit ?? 300 }) })
export const useCreateUser = () => useAction((v: UserInput) => post<AuthUser>('/users', v), (u) => `Đã tạo tài khoản ${u.name}`)
export const useUpdateUser = () => useAction(({ id, ...v }: Partial<Omit<UserInput, 'password'>> & { id: string; active?: boolean }) =>
  api.patch<AuthUser>(`/users/${id}`, v).then((r) => r.data), (u) => `Đã lưu tài khoản ${u.name}`)
export const useResetUserPassword = () => useAction(({ id, password }: { id: string; password: string }) =>
  post(`/users/${id}/reset-password`, { password }), 'Đã đặt lại mật khẩu — người dùng phải đổi khi đăng nhập')
export const useChangePassword = () => useAction((v: { oldPassword: string; newPassword: string }) =>
  post('/auth/change-password', v), 'Đã đổi mật khẩu')
