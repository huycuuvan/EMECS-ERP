import { Spin } from 'antd'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import AppLayout from '@/layout/AppLayout'
import Contracts from '@/pages/Contracts'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import GalvReconcile from '@/pages/GalvReconcile'
import LsxPage from '@/pages/LsxPage'
import Mismatches from '@/pages/Mismatches'
import Mobile from '@/pages/Mobile'
import Orders from '@/pages/Orders'
import Receipts from '@/pages/Receipts'
import Reports from '@/pages/Reports'
import Tasks from '@/pages/Tasks'
import Users from '@/pages/Users'
import VirtualLoss from '@/pages/VirtualLoss'
import Weighings from '@/pages/Weighings'
import Customers from '@/pages/Customers'
import Galvanizers from '@/pages/Galvanizers'
import Materials from '@/pages/Materials'
import Vehicles from '@/pages/Vehicles'

/** Chưa đăng nhập → về /login (giữ trang đang mở để quay lại). */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mobile" element={<RequireAuth><Mobile /></RequireAuth>} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/don-hang" element={<Orders />} />
        <Route path="/hop-dong" element={<Contracts />} />
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
  )
}
