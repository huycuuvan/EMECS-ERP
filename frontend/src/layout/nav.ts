import {
  Archive, ArrowLeftRight, BarChart3, Factory, FileSignature, FileWarning, LayoutDashboard, PackageCheck, Scale,
  ShoppingCart, Truck, UsersRound, type LucideIcon,
} from 'lucide-react'
import { Boxes, Contact, TruckElectric, Warehouse } from 'lucide-react'

export interface NavItem { id: string; label: string; icon: LucideIcon; path: string }
/** Menu giống layout.js của bản demo. `id` dùng làm khóa phân quyền (PERMISSIONS ở backend/config.py). */
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Điều hành', items: [
    { id: 'dashboard', label: 'Dashboard điều hành', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'don-hang', label: 'Đơn hàng khách', icon: ShoppingCart, path: '/don-hang' },
    { id: 'hop-dong', label: 'Hợp đồng & Tạm ứng', icon: FileSignature, path: '/hop-dong' },
    { id: 'khach-hang', label: 'Khách hàng', icon: Contact, path: '/danh-muc/khach-hang' },
  ] },
  { section: 'Sản xuất', items: [
    { id: 'lsx', label: 'Lệnh sản xuất', icon: Factory, path: '/lsx' },
  ] },
  { section: 'Kho & Trạm cân', items: [
    { id: 'tiep-nhan', label: 'Chuẩn bị hàng', icon: PackageCheck, path: '/tiep-nhan' },
    { id: 'van-chuyen', label: 'Thẻ công việc lái xe', icon: Truck, path: '/van-chuyen' },
    { id: 'phieu-can', label: 'Trạm cân · Phiếu cân', icon: Scale, path: '/phieu-can' },
    { id: 'kho-ao', label: 'Kho ảo chênh lệch', icon: Archive, path: '/kho-ao' },
    { id: 'nguyen-lieu', label: 'Nguyên liệu mua vào', icon: Boxes, path: '/nguyen-lieu' },
  ] },
  { section: 'Vận chuyển & Mạ', items: [
    { id: 'doi-ung-ma', label: 'Đối ứng gửi/nhận mạ', icon: ArrowLeftRight, path: '/doi-ung-ma' },
  ] },
  { section: 'Giám sát & Báo cáo', items: [
    { id: 'bao-cao', label: 'Báo cáo đối ứng · Quá hạn', icon: BarChart3, path: '/bao-cao' },
    { id: 'sai-lech', label: 'Sai lệch chờ ký', icon: FileWarning, path: '/sai-lech' },
  ] },
  { section: 'Danh mục', items: [
    { id: 'xe', label: 'Xe', icon: TruckElectric, path: '/danh-muc/xe' },
    { id: 'xuong-ma', label: 'Xưởng mạ', icon: Warehouse, path: '/danh-muc/xuong-ma' },
  ] },
  { section: 'Quản trị', items: [
    { id: 'nguoi-dung', label: 'Người dùng & phân quyền', icon: UsersRound, path: '/nguoi-dung' },
  ] },
]

export const NAV_FLAT = NAV.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section })))

/** Trang đầu tiên vai trò được xem (mỗi vai trò chỉ thấy màn của mình); không có màn nào trên máy tính → bản điện thoại. */
export function homeFor(permissions: Record<string, string> | undefined, roles: string[] = []): string {
  if (roles.length && roles.every((r) => r === 'lx' || r === 'sx')) return '/mobile'
  return NAV_FLAT.find((i) => permissions?.[i.id])?.path ?? '/mobile'
}
