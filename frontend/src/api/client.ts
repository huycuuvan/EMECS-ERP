import axios, { AxiosError } from 'axios'

export const api = axios.create({ baseURL: '/api' })

/* ---------- token đăng nhập ---------- */
const TOKEN_KEY = 'erp.token'
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}
api.interceptors.request.use((cfg) => {
  const t = tokenStore.get()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})
/** Hết phiên / token sai → xóa token, về trang đăng nhập (giữ đường dẫn để quay lại). */
api.interceptors.response.use(undefined, (err: AxiosError) => {
  const url = err.config?.url || ''
  if (err.response?.status === 401 && !url.includes('/auth/login')) {
    tokenStore.clear()
    if (!location.pathname.startsWith('/login')) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search)
    }
  }
  return Promise.reject(err)
})

/** Lấy thông điệp lỗi tiếng Việt từ FastAPI (detail) để hiện toast. */
export function errorMessage(e: unknown): string {
  const err = e as AxiosError<{ detail?: unknown }>
  const d = err?.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return 'Dữ liệu chưa hợp lệ: ' + d.map((x: { loc?: unknown[]; msg?: string }) => `${(x.loc || []).slice(-1)[0]} — ${x.msg}`).join('; ')
  return err?.message || 'Có lỗi xảy ra'
}

/** Upload ảnh → trả URL `/uploads/...` để lưu vào trường photo. */
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post<{ url: string }>('/uploads', fd)
  return data.url
}

/** Ảnh phiếu demo do backend sinh (nút "Ảnh demo"). */
export async function demoTicket(label: string, kg: number): Promise<string> {
  const { data } = await api.get<{ photo: string }>('/demo-ticket', { params: { label, kg } })
  return data.photo
}
