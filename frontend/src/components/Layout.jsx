import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Users, Camera, CalendarCheck, FileBarChart2,
  LogOut, Clock, Menu, X, CalendarDays
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/face-register', icon: Camera, label: 'Face Register' },
  { to: '/attendance', icon: CalendarCheck, label: 'Attendance' },
  { to: '/leaves', icon: CalendarDays, label: 'Leave Management' },
  { to: '/live', icon: Clock, label: 'Live Check-In' },
  { to: '/reports', icon: FileBarChart2, label: 'Reports' },
]

function Sidebar({ adminName, onLogout, onNavClick }) {
  return (
    <aside className="flex flex-col w-64 bg-slate-900 text-white min-h-screen">
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">A</div>
          <div>
            <p className="font-semibold text-sm">AttendanceAI</p>
            <p className="text-slate-400 text-xs">{adminName}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`
            }
            onClick={onNavClick}
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </aside>
  )
}

export default function Layout() {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const adminName = admin?.full_name || admin?.username

  return (
    // FIX: removed overflow-hidden from outer div — it was clipping the 4th stat card
    <div className="flex min-h-screen">

      {/* Desktop sidebar — always visible on lg+ */}
      <div className="hidden lg:flex">
        <Sidebar adminName={adminName} onLogout={handleLogout} onNavClick={() => {}} />
      </div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative z-50">
            <Sidebar adminName={adminName} onLogout={handleLogout} onNavClick={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      {/* FIX: changed overflow-hidden → overflow-auto so content scrolls instead of clipping */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setOpen(true)} className="p-1 rounded-md hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-800">AttendanceAI</span>
          <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-gray-100">
            <X size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
