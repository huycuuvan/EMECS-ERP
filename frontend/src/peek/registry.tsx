/* Đăng ký component drawer cho từng loại bản ghi. Mỗi file trong ./drawers do trang tương ứng sở hữu. */
import type { ComponentType } from 'react'
import type { PeekType } from './meta'
import OrderDrawer from './drawers/OrderDrawer'
import ContractDrawer from './drawers/ContractDrawer'
import LsxDrawer from './drawers/LsxDrawer'
import ReceiptDrawer from './drawers/ReceiptDrawer'
import WeighingDrawer from './drawers/WeighingDrawer'
import TaskDrawer from './drawers/TaskDrawer'
import MismatchDrawer from './drawers/MismatchDrawer'
import VlossDrawer from './drawers/VlossDrawer'

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
