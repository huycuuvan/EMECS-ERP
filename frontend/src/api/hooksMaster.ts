/* React Query hooks cho danh mục (khách hàng + thẻ, xe, xưởng mạ), nguyên liệu mua vào, báo cáo theo xe,
   cảnh báo cuối ngày. Mutation: toast lỗi chuẩn + invalidate toàn bộ cache nghiệp vụ (giống hooks.ts). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { api, errorMessage } from './client'
import { qk } from './hooks'
import type { ContractRow, Dashboard, Order } from './types'
import type {
  Customer, CustomerInput, EndOfDayResult, Galvanizer, GalvanizerInput, MaterialInput, MaterialReceipt, MaterialStats,
  TagItem, Vehicle, VehicleInput, VehicleTonnageRow,
} from './typesMaster'

const get = <T,>(url: string, params?: object) => api.get<T>(url, { params }).then((r) => r.data)
const post = <T,>(url: string, body?: object) => api.post<T>(url, body ?? {}).then((r) => r.data)
const patch = <T,>(url: string, body: object) => api.patch<T>(url, body).then((r) => r.data)
const del = <T,>(url: string) => api.delete<T>(url).then((r) => r.data)

export const qkm = {
  tags: ['tags'], customers: (p?: object) => ['customers', p ?? {}],
  vehicles: ['vehicles'], galvanizers: ['galvanizers'],
  materials: (p?: object) => ['materials', p ?? {}], materialStats: (p?: object) => ['reports', 'material-stats', p ?? {}],
  tonnage: (p?: object) => ['reports', 'vehicle-tonnage', p ?? {}],
}
type Period = { from?: string; to?: string }

/* ---------------------------------------------------------------- queries */
export const useTags = () => useQuery({ queryKey: qkm.tags, queryFn: () => get<TagItem[]>('/tags'), staleTime: 60_000 })
export const useCustomers = (p?: { tag?: number; q?: string }, enabled = true) =>
  useQuery({ queryKey: qkm.customers(p), queryFn: () => get<Customer[]>('/customers', p), enabled, staleTime: 30_000 })
export const useVehicles = (enabled = true) => useQuery({ queryKey: qkm.vehicles, queryFn: () => get<Vehicle[]>('/vehicles'), enabled })
export const useGalvanizers = (enabled = true) => useQuery({ queryKey: qkm.galvanizers, queryFn: () => get<Galvanizer[]>('/galvanizers'), enabled })
export const useMaterials = (p?: Period) => useQuery({ queryKey: qkm.materials(p), queryFn: () => get<MaterialReceipt[]>('/material-receipts', p) })
export const useMaterialStats = (p?: Period) => useQuery({ queryKey: qkm.materialStats(p), queryFn: () => get<MaterialStats>('/reports/material-stats', p) })
export const useVehicleTonnage = (p?: Period, enabled = true) => useQuery({ queryKey: qkm.tonnage(p), queryFn: () => get<VehicleTonnageRow[]>('/reports/vehicle-tonnage', p), enabled })

/** Danh sách lọc theo thẻ khách hàng (không có thẻ → dùng chung cache với hook gốc). */
export const useOrdersByTag = (tag?: number) =>
  useQuery({ queryKey: tag ? [...qk.orders, { tag }] : qk.orders, queryFn: () => get<Order[]>('/orders', tag ? { tag } : undefined) })
export const useContractsByTag = (tag?: number) =>
  useQuery({ queryKey: tag ? [...qk.contracts, { tag }] : qk.contracts, queryFn: () => get<ContractRow[]>('/contracts', tag ? { tag } : undefined) })
export const useDashboardByTag = (tag?: number) =>
  useQuery({ queryKey: tag ? [...qk.dashboard, { tag }] : qk.dashboard, queryFn: () => get<Dashboard>('/dashboard', tag ? { tag } : undefined) })

/* ---------------------------------------------------------------- mutations */
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

export const useCreateTag = () => useAction((v: { name: string; color: string }) => post<TagItem>('/tags', v), (t) => `Đã tạo thẻ "${t.name}"`)
export const useUpdateTag = () => useAction(({ id, ...v }: { id: number; name?: string; color?: string }) => patch<TagItem>(`/tags/${id}`, v), 'Đã lưu thẻ')
export const useDeleteTag = () => useAction((id: number) => del(`/tags/${id}`), 'Đã xóa thẻ')

export const useCreateCustomer = () => useAction((v: CustomerInput) => post<Customer>('/customers', v), (c) => `Đã thêm khách ${c.name}`)
export const useUpdateCustomer = () => useAction(({ id, ...v }: CustomerInput & { id: number }) => patch<Customer>(`/customers/${id}`, v), (c) => `Đã lưu khách ${c.name}`)
export const useDeleteCustomer = () => useAction((id: number) => del(`/customers/${id}`), 'Đã xóa khách hàng')
export const useAttachTag = () => useAction(({ id, tagId }: { id: number; tagId: number }) => post<Customer>(`/customers/${id}/tags/${tagId}`))
export const useDetachTag = () => useAction(({ id, tagId }: { id: number; tagId: number }) => del<Customer>(`/customers/${id}/tags/${tagId}`))

export const useCreateVehicle = () => useAction((v: VehicleInput) => post<Vehicle>('/vehicles', v), (x) => `Đã thêm xe ${x.plate}`)
export const useUpdateVehicle = () => useAction(({ id, ...v }: VehicleInput & { id: number }) => patch<Vehicle>(`/vehicles/${id}`, v), (x) => `Đã lưu xe ${x.plate}`)
export const useDeleteVehicle = () => useAction((id: number) => del(`/vehicles/${id}`), 'Đã xóa xe')

export const useCreateGalvanizer = () => useAction((v: GalvanizerInput) => post<Galvanizer>('/galvanizers', v), (g) => `Đã thêm ${g.name}`)
export const useUpdateGalvanizer = () => useAction(({ id, ...v }: GalvanizerInput & { id: number }) => patch<Galvanizer>(`/galvanizers/${id}`, v), (g) => `Đã lưu ${g.name}`)
export const useDeleteGalvanizer = () => useAction((id: number) => del(`/galvanizers/${id}`), 'Đã xóa xưởng mạ')

export const useCreateMaterial = () => useAction((v: MaterialInput) => post<MaterialReceipt>('/material-receipts', v), (m) => `Đã lập phiếu nhập ${m.id}`)
export const useUpdateMaterial = () => useAction(({ id, ...v }: MaterialInput & { id: string }) => patch<MaterialReceipt>(`/material-receipts/${id}`, v), (m) => `Đã lưu ${m.id}`)

export const useRunEndOfDay = () => useAction((force: boolean) => post<EndOfDayResult>(`/alerts/run-end-of-day${force ? '?force=1' : ''}`))
