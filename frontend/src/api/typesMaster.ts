// Kiểu dữ liệu danh mục & báo cáo bổ sung — khớp backend/app/master_api.py.
// Trường mới trên kiểu có sẵn được bổ sung bằng module augmentation (không sửa types.ts).

export interface TagItem { id: number; name: string; color: string; customerCount?: number }

/** Phân loại khách (báo giá M01/M06); "" = chưa phân loại */
export type Segment = 'Thân thiết' | 'Đơn lẻ' | ''
export const SEGMENTS: Exclude<Segment, ''>[] = ['Thân thiết', 'Đơn lẻ']

export interface Customer {
  id: number; name: string; shortCode: string; taxCode: string; address: string; contactName: string; phone: string
  /** người đại diện pháp luật + chức vụ, tài khoản ngân hàng — dùng khi lập hợp đồng */
  representative: string; representativeTitle: string; bankAccount: string; bankName: string; segment: Segment
  note: string; active: boolean; createdAt: string | null; tags: TagItem[]
  orderCount?: number; orderValue?: number; orderKg?: number; lastOrderAt?: string | null
}
export type CustomerInput = Partial<Omit<Customer, 'id' | 'tags' | 'createdAt' | 'orderCount' | 'orderValue' | 'orderKg' | 'lastOrderAt'>> & { tagIds?: number[] }

export type VehicleKind = 'nhà' | 'thuê'
export interface Vehicle { id: number; plate: string; capacityKg: number; kind: VehicleKind; defaultDriver: string; note: string; active: boolean }
export type VehicleInput = Partial<Omit<Vehicle, 'id'>>

export interface Galvanizer { id: number; name: string; address: string; phone: string; note: string; active: boolean }
export type GalvanizerInput = Partial<Omit<Galvanizer, 'id'>>

export interface MaterialReceipt {
  id: string; date: string; supplier: string; steelGrade: string; spec: string; qty: number; unit: string
  /** KG cân thực tế tại xưởng */ kg: number
  note: string; by: string
  /** KG theo bên cung cấp; delta = thực tế − NCC; photo = ảnh chứng từ */
  kgSupplier: number | null; delta: number | null; photo: string | null
}
export type MaterialInput = Partial<Omit<MaterialReceipt, 'id' | 'by' | 'delta'>>

export interface StatGroup { key: string; kg: number; count: number }
export interface MaterialStats {
  totalKg: number; count: number; byMonth: StatGroup[]; bySupplier: StatGroup[]; byGrade: StatGroup[]
  /** thành phẩm xưởng bàn giao kho (PTN) trong kỳ */
  producedKg: number; producedPct: number | null
}

export interface VehicleTrip {
  id: string; type: 'di_ma' | 'giao_khach'; contractId: string; driver: string; date: string | null; status: string
  kgRequired: number; kg: number | null; delta: number | null
}
export interface VehicleTonnageRow {
  /** null = thẻ chưa gán xe */
  plate: string | null; vehicleId: number | null; capacityKg: number | null; kind: VehicleKind | null
  defaultDriver: string; active: boolean | null
  tripCount: number; diMaTrips: number; giaoTrips: number; kgToGalv: number; kgPicked: number; kgDelivered: number
  mismatchKg: number; mismatchTrips: number; openTrips: number; drivers: string[]; lastTrip: string | null
  trips: VehicleTrip[]
}

export interface EndOfDayResult { ran: boolean; date: string; created: number; titles: string[] }

declare module './types' {
  interface Order { customerId?: number | null }
  interface ContractRow { customerId?: number | null }
  interface Task { vehiclePlate?: string | null; galvanizerId?: number | null }
}
