import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Attendance from './pages/Attendance'
import LeavePage from './pages/LeavePage'
import FaceRegister from './pages/FaceRegister'
import LiveAttendance from './pages/LiveAttendance'
import Reports from './pages/Reports'

// Protects routes — redirects to /login if not authenticated
function PrivateRoute({ children }) {
  const { admin, loading } = useAuth()
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>
  return admin ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { admin, loading } = useAuth()
  if (loading) return <div style={{ padding: 40 }}>Checking authentication...</div>

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={admin ? <Navigate to="/" replace /> : <Login />} />

      {/* Protected — all wrapped in Layout (sidebar + main area) */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leaves" element={<LeavePage />} />
        <Route path="face-register" element={<FaceRegister />} />
        <Route path="live" element={<LiveAttendance />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
