/* Hằng, kiểu, context và helper nghiệp vụ của bản mobile hiện trường (không chứa component). */
import {
  BarChart3, BellRing, CheckCircle2, ClipboardList, Factory, FileSignature, FileWarning, LayoutDashboard, PackageCheck,
  Scale, ShieldCheck, Truck, Warehouse, type LucideIcon,
} from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'
import type { Lsx, Meta, Task } from '@/api/types'
import { daysLeft, fmtNum } from '@/lib/format'

/* ---------------------------------------------------------------- vai trò & loại bản ghi */
export type MRole = 'quanly' | 'sanxuat' | 'thukho' | 'laixe'
export type Kind = 'lsx' | 'pc' | 'ptn' | 'vc' | 'hd' | 'sl'

export const KIND_META: Record<Kind, { icon: LucideIcon; label: string }> = {
  lsx: { icon: ClipboardList, label: 'Lệnh sản xuất' },
  pc: { icon: Scale, label: 'Phiếu cân' },
  ptn: { icon: PackageCheck, label: 'Phiếu chuẩn bị hàng' },
  vc: { icon: Truck, label: 'Thẻ vận chuyển' },
  hd: { icon: FileSignature, label: 'Hợp đồng' },
  sl: { icon: FileWarning, label: 'Biên bản sai lệch' },
}

export function refKindOf(id: string): Kind {
  if (id.startsWith('PC-')) return 'pc'
  if (id.startsWith('VC-')) return 'vc'
  if (id.startsWith('PTN-')) return 'ptn'
  if (id.startsWith('LSX-')) return 'lsx'
  if (id.startsWith('SL-')) return 'sl'
  return 'hd'
}

/* ---------------------------------------------------------------- context khung điện thoại */
export interface SheetSpec { icon: LucideIcon; title: string; body: ReactNode }
export interface MobCtx {
  role: MRole
  meta?: Meta
  tol: number
  /** Mở sheet chi tiết bản ghi (chồng lên sheet hiện tại). */
  open: (kind: Kind, id: string) => void
  /** Mở sheet tùy biến (form thao tác) chồng lên sheet hiện tại. */
  sheet: (s: SheetSpec) => void
  pop: () => void
  close: () => void
  zoom: (src: string) => void
}
export const Ctx = createContext<MobCtx | null>(null)
export function useMob() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMob must be used inside mobile shell')
  return v
}

export interface MAlert { ic: LucideIcon; t: string; s: string; red?: boolean; open?: [Kind, string] }

/* ---------------------------------------------------------------- helpers nghiệp vụ */
export const num = (v: string | number | null | undefined) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
export const fmtN = (n?: number | null) => fmtNum(n, 2)
/** +120 / −60 (không kèm đơn vị) */
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtN(Math.abs(n))

export function isOverdueTask(t: Task) {
  return !!(t.fillDeadline && !t.filledAt && t.status !== 'Từ chối' && t.status !== 'Hoàn thành' && Date.now() > new Date(t.fillDeadline).getTime())
}
export function hoursLeftOf(t: Task) {
  if (!t.fillDeadline) return null
  return Math.ceil((new Date(t.fillDeadline).getTime() - Date.now()) / 3600000)
}
export function lsxDeadline(x: Lsx) {
  const eff = x.extension ? x.extension.to : x.deadline
  const dl = daysLeft(eff)
  const late = (x.status === 'Đang SX' || x.status === 'Chờ nhận') && dl < 0
  return { eff, dl, late }
}
export const typeLabel = (t: Task) => (t.type === 'di_ma' ? 'Đi mạ' : 'Giao khách')

/* ---------------------------------------------------------------- định nghĩa vai trò */
export interface TabDef { id: string; label: string; icon: LucideIcon }
export const ROLES: Record<MRole, { label: string; sub: string; icon: LucideIcon; tabs: TabDef[] }> = {
  quanly: {
    label: 'Quản lý A', sub: 'Điều hành trung tâm', icon: ShieldCheck,
    tabs: [{ id: 'home', label: 'Điều hành', icon: LayoutDashboard }, { id: 'hd', label: 'Hợp đồng', icon: FileSignature },
      { id: 'bc', label: 'Báo cáo', icon: BarChart3 }, { id: 'sl', label: 'Sai lệch', icon: FileWarning }],
  },
  sanxuat: {
    label: 'Sản xuất', sub: 'Lê Văn Xưởng · Quản đốc xưởng', icon: Factory,
    tabs: [{ id: 'lsx', label: 'Lệnh SX', icon: ClipboardList }, { id: 'ptn', label: 'Bàn giao TP', icon: PackageCheck },
      { id: 'cb', label: 'Cảnh báo', icon: BellRing }],
  },
  thukho: {
    label: 'Thủ kho', sub: 'Ngô Minh Kho · Kho thành phẩm', icon: Warehouse,
    tabs: [{ id: 'can', label: 'Phiếu cân', icon: Scale }, { id: 'ptn', label: 'Chuẩn bị hàng', icon: PackageCheck },
      { id: 'cb', label: 'Cảnh báo', icon: BellRing }],
  },
  laixe: {
    label: 'Lái xe', sub: 'Đội vận tải · đối ứng 3 số cân', icon: Truck,
    tabs: [{ id: 'viec', label: 'Công việc', icon: ClipboardList }, { id: 'xong', label: 'Đã xong', icon: CheckCircle2 },
      { id: 'cb', label: 'Cảnh báo', icon: BellRing }],
  },
}
export const ROLE_ORDER: MRole[] = ['quanly', 'sanxuat', 'thukho', 'laixe']

