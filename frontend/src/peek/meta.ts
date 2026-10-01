import { Archive, Factory, FileSignature, FileWarning, PackageCheck, Scale, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'

export type PeekType = 'dh' | 'hd' | 'lsx' | 'ptn' | 'pc' | 'vc' | 'sl' | 'vk'

/** Nhãn + icon + trang danh sách của từng loại bản ghi. */
export const PEEK_META: Record<PeekType, { label: string; icon: LucideIcon; page: string }> = {
  dh: { label: 'Đơn hàng khách', icon: ShoppingCart, page: '/don-hang' },
  hd: { label: 'Hợp đồng', icon: FileSignature, page: '/hop-dong' },
  lsx: { label: 'Lệnh sản xuất', icon: Factory, page: '/lsx' },
  ptn: { label: 'Phiếu tiếp nhận TP', icon: PackageCheck, page: '/tiep-nhan' },
  pc: { label: 'Phiếu cân trạm', icon: Scale, page: '/phieu-can' },
  vc: { label: 'Thẻ công việc lái xe', icon: Truck, page: '/van-chuyen' },
  sl: { label: 'Biên bản sai lệch', icon: FileWarning, page: '/sai-lech' },
  vk: { label: 'Kho ảo chênh lệch', icon: Archive, page: '/kho-ao' },
}

/** Suy ra loại bản ghi từ tiền tố mã (DH-, HD-, LSX-, PTN-, PC-, VC-, SL-, VK-). */
export function peekTypeOf(id: string): PeekType | null {
  const p = id.split('-')[0]
  return ({ DH: 'dh', HD: 'hd', LSX: 'lsx', PTN: 'ptn', PC: 'pc', VC: 'vc', SL: 'sl', VK: 'vk' } as Record<string, PeekType>)[p] ?? null
}
