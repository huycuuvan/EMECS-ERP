/* Hệ thống drawer bản ghi (tương đương ERPPeek của bản demo):
   - Bấm mã bất kỳ (DH/HD/LSX/PTN/PC/VC/SL/VK) → drawer trượt phải, có thể chồng nhiều lớp.
   - URL ?open=hd:HD-2609-01 → tự mở khi tải trang (dùng cho link chia sẻ / điều hướng chéo trang).
   Mỗi loại bản ghi đăng ký component ở ./registry.tsx. */
import { Drawer } from 'antd'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PeekContext } from './context'
import type { PeekType } from './meta'
import { PEEK_REGISTRY } from './registry'

interface Entry { key: number; type: PeekType; id: string }
let seq = 0

export function PeekProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([])
  const [params, setParams] = useSearchParams()

  const open = useCallback((type: PeekType, id: string) => {
    setStack((s) => (s.length && s[s.length - 1].type === type && s[s.length - 1].id === id ? s : [...s, { key: ++seq, type, id }]))
  }, [])
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const closeAll = useCallback(() => setStack([]), [])

  // ?open=type:id
  useEffect(() => {
    const v = params.get('open')
    if (!v) return
    const [type, id] = v.split(':')
    if (type in PEEK_REGISTRY && id) open(type as PeekType, id)
    params.delete('open')
    setParams(params, { replace: true })
  }, [params, setParams, open])

  const value = useMemo(() => ({ open, close, closeAll }), [open, close, closeAll])
  return (
    <PeekContext.Provider value={value}>
      {children}
      {stack.map((e) => {
        const reg = PEEK_REGISTRY[e.type]
        const Comp = reg.component
        return (
          <Drawer key={e.key} open placement="right" size={reg.width ?? 640} closable={false} title={null}
            className="peek-drawer" styles={{ body: { padding: 0 } }} push={{ distance: 40 }}
            onClose={() => setStack((s) => s.filter((x) => x.key !== e.key))}>
            <Comp id={e.id} />
          </Drawer>
        )
      })}
    </PeekContext.Provider>
  )
}
