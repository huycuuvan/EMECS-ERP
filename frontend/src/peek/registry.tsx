/* Đăng ký component drawer cho từng loại bản ghi. Mỗi file trong ./drawers do trang tương ứng sở hữu. */
import { lazy, type ComponentType } from 'react'
import type { PeekType } from './meta'

// Drawer chỉ tải khi mở lần đầu (giảm dung lượng tải trang đầu)
const OrderDrawer = lazy(() => import('./drawers/OrderDrawer'))
const ContractDrawer = lazy(() => import('./drawers/ContractDrawer'))
const LsxDrawer = lazy(() => import('./drawers/LsxDrawer'))
const ReceiptDrawer = lazy(() => import('./drawers/ReceiptDrawer'))
const WeighingDrawer = lazy(() => import('./drawers/WeighingDrawer'))
const TaskDrawer = lazy(() => import('./drawers/TaskDrawer'))
const MismatchDrawer = lazy(() => import('./drawers/MismatchDrawer'))
const VlossDrawer = lazy(() => import('./drawers/VlossDrawer'))

export const PEEK_REGISTRY: Record<PeekType, { component: ComponentType<{ id: string }>; width?: number }> = {
  dh: { component: OrderDrawer },
  hd: { component: ContractDrawer, width: 880 },
  lsx: { component: LsxDrawer },
  ptn: { component: ReceiptDrawer },
  pc: { component: WeighingDrawer },
  vc: { component: TaskDrawer },
  sl: { component: MismatchDrawer },
  vk: { component: VlossDrawer },
}
