import { createContext, useContext } from 'react'
import type { PeekType } from './meta'

export interface PeekCtx {
  /** Mở drawer bản ghi (chồng lên drawer đang mở). */
  open: (type: PeekType, id: string) => void
  /** Đóng drawer trên cùng. */
  close: () => void
  closeAll: () => void
}
export const PeekContext = createContext<PeekCtx | null>(null)

export function usePeek() {
  const v = useContext(PeekContext)
  if (!v) throw new Error('usePeek must be used inside PeekProvider')
  return v
}
