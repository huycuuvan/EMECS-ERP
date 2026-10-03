import { Spin } from 'antd'
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import AppLayout from '@/layout/AppLayout'
import Login from '@/pages/Login'


// Tách tải theo trang: lần đầu chỉ tải trang đang mở (quan trọng với điện thoại 4G ở hiện trường)
const Contracts = lazy(() => import('@/pages/Contracts'))
const ContractDraft = lazy(() => import('@/pages/ContractDraft'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const GalvReconcile = lazy(() => import('@/pages/GalvReconcile'))
const LsxPage = lazy(() => import('@/pages/LsxPage'))
const Mismatches = lazy(() => import('@/pages/Mismatches'))
const Mobile = lazy(() => import('@/pages/Mobile'))
const Orders = lazy(() => import('@/pages/Orders'))
const Receipts = lazy(() => import('@/pages/Receipts'))
const Reports = lazy(() => import('@/pages/Reports'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Users = lazy(() => import('@/pages/Users'))
const VirtualLoss = lazy(() => import('@/pages/VirtualLoss'))
const Weighings = lazy(() => import('@/pages/Weighings'))
const Customers = lazy(() => import('@/pages/Customers'))
const Galvanizers = lazy(() => import('@/pages/Galvanizers'))
const Materials = lazy(() => import('@/pages/Materials'))
const Vehicles = lazy(() => import('@/pages/Vehicles'))

/** Chưa đăng nhập → về /login (giữ trang đang mở để quay lại). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

const PageLoading = () => <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mobile" element={<RequireAuth><Mobile /></RequireAuth>} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/don-hang" element={<Orders />} />
        <Route path="/hop-dong" element={<Contracts />} />
        <Route path="/hop-dong/:id/soan-thao" element={<ContractDraft />} />
        <Route path="/lsx" element={<LsxPage />} />
        <Route path="/tiep-nhan" element={<Receipts />} />
        <Route path="/phieu-can" element={<Weighings />} />
        <Route path="/kho-ao" element={<VirtualLoss />} />
        <Route path="/van-chuyen" element={<Tasks />} />
        <Route path="/doi-ung-ma" element={<GalvReconcile />} />
        <Route path="/bao-cao" element={<Reports />} />
        <Route path="/sai-lech" element={<Mismatches />} />
        <Route path="/nguoi-dung" element={<Users />} />
        <Route path="/nguyen-lieu" element={<Materials />} />
        <Route path="/danh-muc/khach-hang" element={<Customers />} />
        <Route path="/danh-muc/xe" element={<Vehicles />} />
        <Route path="/danh-muc/xuong-ma" element={<Galvanizers />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}
