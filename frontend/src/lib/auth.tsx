/* Đăng nhập & phân quyền phía giao diện. Quyền thật được kiểm ở server (backend/app/security.py);
   ở đây chỉ để ẩn/khóa menu, nút cho đúng vai trò.
   level(page) = 'full' | 'limited' | 'view' | null · can(page,'edit') = full/limited · can(page,'full') = full.
   role = vai trò chính (admin nếu có, không thì vai trò đầu tiên) · hasRole(r) để kiểm khi người giữ nhiều vai trò. */
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStore } from '@/api/client'
import type { AccessLevel, AuthUser, RoleId } from '@/api/types'

interface AuthCtx {
  user: AuthUser | null
  /** đang kiểm tra token lúc tải trang */
  loading: boolean
  role: RoleId
  roles: RoleId[]
  hasRole: (r: RoleId) => boolean
  level: (page: string) => AccessLevel | null
  can: (page: string, need?: 'view' | 'edit' | 'full') => boolean
  login: (phone: string, password: string) => Promise<AuthUser>
  logout: () => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(() => !!tokenStore.get())

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return }
    try { setUser((await api.get<AuthUser>('/auth/me')).data) } catch { setUser(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const value = useMemo<AuthCtx>(() => {
    const roles = user?.roles ?? []
    const level = (page: string): AccessLevel | null => user?.permissions?.[page] ?? null
    return {
      user, loading, roles,
      role: roles.includes('admin') ? 'admin' : (roles[0] ?? 'lx'),
      hasRole: (r) => roles.includes('admin') || roles.includes(r),
      level,
      can: (page, need = 'view') => {
        const l = level(page)
        if (!l) return false
        if (need === 'full') return l === 'full'
        if (need === 'edit') return l === 'full' || l === 'limited'
        return true
      },
      login: async (phone, password) => {
        const { data } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { phone, password })
        tokenStore.set(data.token)
        qc.clear()
        setUser(data.user)
        return data.user
      },
      logout: () => { tokenStore.clear(); qc.clear(); setUser(null) },
      refresh,
    }
  }, [user, loading, qc, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
