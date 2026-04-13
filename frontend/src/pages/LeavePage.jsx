import { useState, useEffect } from 'react'
import api, { employeeAPI } from '../api'
import Modal from '../components/Modal'
import {
  Calendar, CheckCircle, XCircle, Clock, Plus, Search,
  RefreshCw, Download, Filter, Users, TrendingUp,
  AlertCircle, FileText, ChevronLeft, ChevronRight,
  UserCheck, UserX
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Leave types per Operation Biometric doc ──────────────────────────────────
const LEAVE_TYPES = {
  casual:    { label: 'Casual Leave',          short: 'CL',  color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  sick:      { label: 'Sick Leave',            short: 'SL',  color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  earned:    { label: 'Earned Leave',          short: 'EL',  color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  permission:{ label: 'With Permission',       short: 'WP',  color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' }, // code "6"
  absent:    { label: 'Without Permission',    short: 'WOP', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#991b1b' }, // code "0" — Absent
  special:   { label: 'Special Leave',         short: 'SPL', color: '#06b6d4', bg: '#ecfeff', border: '#a5f3fc', text: '#0e7490' }, // code "6"
  abandonment:{ label: 'Abandonment',          short: 'ABD', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3', text: '#9f1239' }, // code "0" — treated as Absent
  maternity: { label: 'Maternity Leave',       short: 'ML',  color: '#ec4899', bg: '#fdf2f8', border: '#f9a8d4', text: '#9d174d' }, // code "6"
  mandatory: { label: 'One Day Mandatory',     short: 'MDL', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', text: '#4c1d95' }, // code "6"
}

// ── Predefined reasons per leave type ────────────────────────────────────────
const LEAVE_REASONS = {
  casual: [
    'Personal errand / family matter',
    'Attending a function / ceremony',
    'Out-of-town travel',
    'Child care / school event',
    'Home maintenance / repairs',
    'Other personal reason',
  ],
  sick: [
    'Fever / cold / flu',
    'Doctor appointment / medical check-up',
    'Hospitalization',
    'Surgery / post-operative recovery',
    'Chronic illness flare-up',
    'Mental health / stress leave',
  ],
  earned: [
    'Annual vacation / holiday',
    'Family vacation',
    'Religious / cultural observance',
    'Personal development / study leave',
    'Compensatory rest after overtime',
    'Other planned leave',
  ],
  permission: [
    'Short errand (returning same day)',
    'Bank / government office visit',
    'Medical appointment (short)',
    'Utility / vehicle service',
    'Personal urgent work',
  ],
  absent: [
    'Emergency — unable to inform in advance',
    'Transport / commute breakdown',
    'Family emergency',
    'Sudden illness (no prior intimation)',
    'Other unavoidable reason',
  ],
  special: [
    'Bereavement (immediate family)',
    'Marriage of self',
    'Marriage of dependent (child / sibling)',
    'Flood / natural disaster relief',
    'Blood donation camp',
    'Sports / cultural representation',
    'Special project / deputation',
  ],
  abandonment: [
    'Absent without information for 3+ consecutive days',
    'Absent without information for 7+ consecutive days',
    'Absent without information for 15+ consecutive days',
    'Job abandonment — no contact',
  ],
  maternity: [
    'Pre-natal care / bed rest',
    'Delivery / childbirth',
    'Post-natal recovery',
    'Complications during pregnancy',
    'Miscarriage / pregnancy loss recovery',
  ],
  mandatory: [
    'Company-mandated one-day leave (compliance)',
    'Annual mandatory leave as per policy',
    'Regulatory / audit requirement',
  ],
}

// ── Shifts ────────────────────────────────────────────────────────────────────
const SHIFTS = {
  A: { label: 'Shift A', short: 'A', time: '06:00 – 14:00', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  B: { label: 'Shift B', short: 'B', time: '14:00 – 22:00', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  C: { label: 'Shift C', short: 'C', time: '22:00 – 06:00', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3' },
  G: { label: 'General', short: 'G', time: '09:00 – 18:00', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
}

const STATUS_META = {
  pending:  { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  approved: { label: 'Approved', cls: 'bg-green-100  text-green-700  border border-green-200'  },
  rejected: { label: 'Rejected', cls: 'bg-red-100    text-red-700    border border-red-200'    },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const today   = new Date()
const fmt     = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const dayDiff = (from, to) => {
  const a = new Date(from), b = new Date(to)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LeavePage() {
  const [employees,    setEmployees]    = useState([])
  const [leaves,       setLeaves]       = useState([])
  const [balances,     setBalances]     = useState([])   // leave balance per employee
  const [loading,      setLoading]      = useState(true)
  const [activeTab,    setActiveTab]    = useState('requests')  // requests | balance | shift | calendar
  const [viewMode,     setViewMode]     = useState('monthly')   // daily | weekly | monthly
  const [selectedDate, setSelectedDate] = useState(today.toISOString().slice(0, 10))
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // ISO week start (Monday)
    const d = new Date(today)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  })
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter,   setTypeFilter]   = useState('')
  const [shiftFilter,  setShiftFilter]  = useState('')
  const [year,         setYear]         = useState(today.getFullYear())
  const [month,        setMonth]        = useState(today.getMonth())

  // Apply modal
  const [applyModal,  setApplyModal]  = useState(false)
  const [applyForm,   setApplyForm]   = useState({
    employee_id: '', leave_type: 'casual', shift: 'G',
    from_date: '', to_date: '', reason: '',
  })
  const [applySaving, setApplySaving] = useState(false)

  // Approval modal
  const [approvalModal,   setApprovalModal]   = useState({ open: false, leave: null, mode: '' })
  const [rejectionReason, setRejectionReason] = useState('')
  const [approvalSaving,  setApprovalSaving]  = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const [empRes, leaveRes, balRes] = await Promise.all([
        employeeAPI.list({ limit: 200 }),
        api.get('/leaves', { params: { year, month: month + 1, status: statusFilter, type: typeFilter, shift: shiftFilter } }),
        api.get('/leaves/balances', { params: { year } }),
      ])
      setEmployees(empRes.data?.data   || [])
      setLeaves(leaveRes.data?.data    || [])
      setBalances(balRes.data?.data    || [])
    } catch {
      toast.error('Failed to load leave data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year, month, statusFilter, typeFilter, shiftFilter])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const filteredLeaves = leaves.filter(l => {
    const emp = employees.find(e => e.id === l.employee_id)
    const name = emp?.full_name?.toLowerCase() || ''
    const code = emp?.employee_code?.toLowerCase() || ''
    const matchesSearch = name.includes(search.toLowerCase()) || code.includes(search.toLowerCase())
    const matchesShift  = !shiftFilter || l.shift === shiftFilter
    return matchesSearch && matchesShift
  })

  // Shift-wise leave stats
  const shiftLeaveStats = () => {
    const stats = {}
    Object.keys(SHIFTS).forEach(s => { stats[s] = { total: 0, approved: 0, pending: 0, absent: 0 } })
    leaves.forEach(l => {
      const s = l.shift || 'G'
      if (!stats[s]) return
      stats[s].total++
      if (l.status === 'approved') stats[s].approved++
      if (l.status === 'pending')  stats[s].pending++
      if (['absent','abandonment'].includes(l.leave_type)) stats[s].absent++
    })
    return stats
  }

  // ── View-mode filtering (daily / weekly / monthly) ───────────────────────
  const isoDate = (d) => new Date(d).toISOString().slice(0, 10)

  const weekRange = (weekStart) => {
    const start = new Date(weekStart)
    const end   = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    return { start: isoDate(start), end: isoDate(end) }
  }

  const viewFiltered = (() => {
    if (viewMode === 'daily') {
      return filteredLeaves.filter(l => l.from_date <= selectedDate && l.to_date >= selectedDate)
    }
    if (viewMode === 'weekly') {
      const { start, end } = weekRange(selectedWeek)
      return filteredLeaves.filter(l => l.from_date <= end && l.to_date >= start)
    }
    return filteredLeaves // monthly — already scoped by API params
  })()

  // Group daily view by date across the month (for daily breakdown table)
  const dailyGroups = (() => {
    if (viewMode !== 'daily') return []
    const groups = {}
    filteredLeaves.forEach(l => {
      const start = new Date(l.from_date)
      const end   = new Date(l.to_date)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = isoDate(d)
        if (!groups[key]) groups[key] = []
        groups[key].push(l)
      }
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  })()

  // Group weekly view into weeks
  const weeklyGroups = (() => {
    if (viewMode !== 'weekly') return []
    const groups = {}
    filteredLeaves.forEach(l => {
      // Find Mon of the week that l.from_date falls in
      const d   = new Date(l.from_date)
      const day = (d.getDay() + 6) % 7  // Mon=0
      d.setDate(d.getDate() - day)
      const key = isoDate(d)
      if (!groups[key]) groups[key] = []
      if (!groups[key].find(x => x.id === l.id)) groups[key].push(l)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  })()
  const pendingCount  = leaves.filter(l => l.status === 'pending').length
  const approvedCount = leaves.filter(l => l.status === 'approved').length
  const rejectedCount = leaves.filter(l => l.status === 'rejected').length

  // Gender-wise stats per Operation Biometric doc
  const genderLeaveStats = () => {
    const stats = { Male: { leave: 0, absent: 0, total: 0 }, Female: { leave: 0, absent: 0, total: 0 }, Other: { leave: 0, absent: 0, total: 0 } }
    leaves.forEach(l => {
      const emp = employees.find(e => e.id === l.employee_id)
      const g = emp?.gender ? (emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1)) : null
      if (!g || !stats[g]) return
      stats[g].total++
      if (l.leave_type === 'absent' || l.leave_type === 'abandonment') stats[g].absent++
      else stats[g].leave++
    })
    return stats
  }

  const empName = (id) => employees.find(e => e.id === id)?.full_name || '—'
  const empCode = (id) => employees.find(e => e.id === id)?.employee_code || ''
  const empGender = (id) => employees.find(e => e.id === id)?.gender || ''
  const empBalance = (empId) => balances.find(b => b.employee_id === empId) || {}

  // Calendar: which dates have leaves
  const calendarLeaves = (d) => {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return leaves.filter(l => l.from_date <= dateStr && l.to_date >= dateStr)
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()

  // ── Apply leave ────────────────────────────────────────────────────────────
  const handleApply = async (e) => {
    e.preventDefault()
    if (!applyForm.employee_id || !applyForm.from_date || !applyForm.to_date) {
      toast.error('Please fill all required fields')
      return
    }
    if (applyForm.to_date < applyForm.from_date) {
      toast.error('End date cannot be before start date')
      return
    }
    setApplySaving(true)
    try {
      const days = dayDiff(applyForm.from_date, applyForm.to_date)
      await api.post('/leaves', {
        ...applyForm,
        days,
        status:       'pending',
        requested_at: new Date().toISOString(),
        // Map to attendance code: absent/abandonment→"0", all others→"6"
        attendance_code: ['absent', 'abandonment'].includes(applyForm.leave_type) ? '0' : '6',
      })
      toast.success('Leave request submitted — pending HR approval')
      setApplyModal(false)
      setApplyForm({ employee_id: '', leave_type: 'casual', shift: 'G', from_date: '', to_date: '', reason: '' })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit leave')
    } finally {
      setApplySaving(false)
    }
  }

  // ── HR Approval ────────────────────────────────────────────────────────────
  const openApproval = (leave, mode) => {
    setRejectionReason('')
    setApprovalModal({ open: true, leave, mode })
  }

  const handleApprove = async () => {
    setApprovalSaving(true)
    try {
      await api.patch(`/leaves/${approvalModal.leave.id}`, {
        status:      'approved',
        approved_at: new Date().toISOString(),
      })
      toast.success('Leave approved')
      setApprovalModal({ open: false, leave: null, mode: '' })
      load()
    } catch { toast.error('Failed to approve') }
    finally { setApprovalSaving(false) }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) { toast.error('Rejection reason is required'); return }
    setApprovalSaving(true)
    try {
      await api.patch(`/leaves/${approvalModal.leave.id}`, {
        status:           'rejected',
        rejection_reason: rejectionReason.trim(),
        rejected_at:      new Date().toISOString(),
      })
      toast.success('Leave rejected')
      setApprovalModal({ open: false, leave: null, mode: '' })
      load()
    } catch { toast.error('Failed to reject') }
    finally { setApprovalSaving(false) }
  }

  // ── Download leave report ──────────────────────────────────────────────────
  const downloadReport = () => {
    const rows = [
      [`Leave Report — ${MONTHS[month]} ${year}`],
      [`Generated: ${new Date().toLocaleDateString('en-IN')}`],
      [],
      ['Emp ID', 'Name', 'Gender', 'Shift', 'Leave Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Attendance Code'],
    ]
    filteredLeaves.forEach(l => {
      const meta = LEAVE_TYPES[l.leave_type] || {}
      rows.push([
        empCode(l.employee_id),
        empName(l.employee_id),
        empGender(l.employee_id),
        SHIFTS[l.shift]?.label || l.shift || 'General Shift',
        meta.label || l.leave_type,
        l.from_date, l.to_date,
        l.days || dayDiff(l.from_date, l.to_date),
        l.reason || '',
        l.status,
        ['absent', 'abandonment'].includes(l.leave_type) ? '0 (Absent)' : '6 (Leave)',
      ])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a   = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `leave_report_${year}_${String(month+1).padStart(2,'0')}.csv`,
    })
    a.click()
    toast.success('Leave report downloaded')
  }

  // ─────────────────────────────────────────────────────────────────────────
  const gStats    = genderLeaveStats()
  const shStats   = shiftLeaveStats()

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          {pendingCount > 0 && (
            <span className="ml-1 bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={downloadReport} className="btn-secondary flex items-center gap-2 text-green-600 border-green-200 hover:bg-green-50">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={() => setApplyModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Apply Leave
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Requests',  value: leaves.length,  icon: FileText,   color: 'blue'   },
          { label: 'Pending',         value: pendingCount,   icon: Clock,      color: 'yellow' },
          { label: 'Approved',        value: approvedCount,  icon: UserCheck,  color: 'green'  },
          { label: 'Rejected',        value: rejectedCount,  icon: UserX,      color: 'red'    },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${color}-100`}>
                <Icon size={15} className={`text-${color}-600`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Shift-wise Leave Stats ── */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Clock size={15} className="text-purple-500" />
          Shift-wise Leave Summary
          <span className="text-xs text-gray-400 font-normal">({MONTHS[month]} {year})</span>
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(SHIFTS).map(([key, shift]) => {
            const s = shStats[key] || { total: 0, approved: 0, pending: 0, absent: 0 }
            return (
              <div key={key}
                className="rounded-lg p-3 cursor-pointer transition-all border-2"
                style={{
                  background:   shiftFilter === key ? shift.bg     : '#f9fafb',
                  borderColor:  shiftFilter === key ? shift.color  : '#e5e7eb',
                }}
                onClick={() => setShiftFilter(shiftFilter === key ? '' : key)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: shift.bg, color: shift.text, border: `1px solid ${shift.border}` }}>
                    {shift.short}
                  </span>
                  <span className="text-lg font-bold text-gray-800">{s.total}</span>
                </div>
                <p className="text-xs font-medium text-gray-700 leading-tight">{shift.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{shift.time}</p>
                <div className="flex gap-2 mt-2 text-xs">
                  <span className="text-green-600">✓ {s.approved}</span>
                  <span className="text-yellow-600">⏳ {s.pending}</span>
                  <span className="text-red-500">✗ {s.absent}</span>
                </div>
              </div>
            )
          })}
        </div>
        {shiftFilter && (
          <p className="text-xs text-blue-600 mt-2 font-medium">
            Filtering by: {SHIFTS[shiftFilter]?.label} —
            <button className="underline ml-1" onClick={() => setShiftFilter('')}>clear</button>
          </p>
        )}
      </div>

      {/* ── Gender-wise Leave Stats ── */}
      <div className="card p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Users size={15} className="text-blue-500" />
          Gender-wise Leave / Absent Summary
          <span className="text-xs text-gray-400 font-normal">({MONTHS[month]} {year})</span>
        </p>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(gStats).map(([gender, s]) => {
            const gTotal = s.leave + s.absent
            return (
              <div key={gender} className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 font-medium mb-1">{gender}</p>
                <p className="text-lg font-bold text-gray-800">{gTotal}</p>
                <div className="flex justify-center gap-3 mt-1 text-xs">
                  <span className="text-amber-600">Leave: {s.leave}</span>
                  <span className="text-red-500">Absent: {s.absent}</span>
                </div>
                {gTotal > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {((s.leave / gTotal) * 100).toFixed(0)}% w/ permission
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'requests', label: 'Leave Requests', icon: FileText   },
          { key: 'balance',  label: 'Leave Balance',  icon: TrendingUp },
          { key: 'shift',    label: 'Shift Summary',  icon: Clock      },
          { key: 'calendar', label: 'Calendar',       icon: Calendar   },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── View Mode Toggle + Filters ── */}
      <div className="flex gap-3 flex-wrap items-center">

        {/* Daily / Weekly / Monthly toggle */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'daily',   label: 'Daily'   },
            { key: 'weekly',  label: 'Weekly'  },
            { key: 'monthly', label: 'Monthly' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setViewMode(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Date navigator — changes based on viewMode */}
        {viewMode === 'daily' && (
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => {
              const d = new Date(selectedDate); d.setDate(d.getDate() - 1)
              setSelectedDate(isoDate(d))
            }} className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronLeft size={15} /></button>
            <input type="date" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-sm font-semibold text-gray-700 border-0 outline-none bg-transparent" />
            <button onClick={() => {
              const d = new Date(selectedDate); d.setDate(d.getDate() + 1)
              setSelectedDate(isoDate(d))
            }} className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronRight size={15} /></button>
          </div>
        )}

        {viewMode === 'weekly' && (
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => {
              const d = new Date(selectedWeek); d.setDate(d.getDate() - 7)
              setSelectedWeek(isoDate(d))
            }} className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronLeft size={15} /></button>
            <span className="text-sm font-semibold text-gray-700 w-52 text-center">
              {(() => { const { start, end } = weekRange(selectedWeek); return `${fmt(start)} — ${fmt(end)}` })()}
            </span>
            <button onClick={() => {
              const d = new Date(selectedWeek); d.setDate(d.getDate() + 7)
              setSelectedWeek(isoDate(d))
            }} className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronRight size={15} /></button>
          </div>
        )}

        {viewMode === 'monthly' && (
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronLeft size={15} /></button>
            <span className="text-sm font-semibold text-gray-700 w-32 text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"><ChevronRight size={15} /></button>
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 w-52" placeholder="Search employee…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="input w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {Object.entries(LEAVE_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select className="input w-44" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
          <option value="">All Shifts</option>
          {Object.entries(SHIFTS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB — LEAVE REQUESTS  (daily / weekly / monthly views)
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'requests' && (() => {

        // Shared leave rows renderer
        const LeaveRows = ({ rows, emptyLabel }) => (
          <>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}>{[...Array(10)].map((_, j) => (
                  <td key={j} className="table-cell"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                ))}</tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="table-cell text-center text-gray-400 py-10">{emptyLabel}</td></tr>
            ) : rows.map(leave => {
              const meta   = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.casual
              const status = STATUS_META[leave.status]     || STATUS_META.pending
              const days   = leave.days || dayDiff(leave.from_date, leave.to_date)
              const code   = ['absent','abandonment'].includes(leave.leave_type) ? '0' : '6'
              const codeLabel = code === '0'
                ? <span className="text-xs font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">0 — Absent</span>
                : <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">6 — Leave</span>
              const sh = SHIFTS[leave.shift] || SHIFTS.G
              return (
                <tr key={leave.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {empName(leave.employee_id)[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-xs">{empName(leave.employee_id)}</p>
                        <p className="text-xs text-gray-400">{empCode(leave.employee_id)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: sh.bg, color: sh.text, border: `1px solid ${sh.border}` }}>
                      {sh.short}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">{sh.time}</p>
                  </td>
                  <td className="table-cell">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}>
                      {meta.short} — {meta.label}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-gray-600">{fmt(leave.from_date)}</td>
                  <td className="table-cell text-xs text-gray-600">{fmt(leave.to_date)}</td>
                  <td className="table-cell">
                    <span className="font-bold text-gray-800">{days}</span>
                    <span className="text-xs text-gray-400 ml-1">day{days !== 1 ? 's' : ''}</span>
                  </td>
                  <td className="table-cell text-xs text-gray-500 max-w-32">
                    <p className="truncate" title={leave.reason}>{leave.reason || '—'}</p>
                    {leave.rejection_reason && (
                      <p className="text-red-500 truncate" title={leave.rejection_reason}>✗ {leave.rejection_reason}</p>
                    )}
                  </td>
                  <td className="table-cell">{codeLabel}</td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                  </td>
                  <td className="table-cell">
                    {leave.status === 'pending' ? (
                      <div className="flex gap-1">
                        <button onClick={() => openApproval(leave, 'approve')}
                          className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors">
                          <CheckCircle size={11} /> Approve
                        </button>
                        <button onClick={() => openApproval(leave, 'reject')}
                          className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors">
                          <XCircle size={11} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {leave.status === 'approved' ? `✓ ${leave.approved_at ? fmt(leave.approved_at) : 'Approved'}` : `✗ Rejected`}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </>
        )

        const TableWrap = ({ title, badge, children }) => (
          <div className="card p-0 overflow-hidden">
            {title && (
              <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">{title}</p>
                {badge != null && (
                  <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">{badge} record{badge !== 1 ? 's' : ''}</span>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Employee</th>
                    <th className="table-header">Shift</th>
                    <th className="table-header">Leave Type</th>
                    <th className="table-header">From</th>
                    <th className="table-header">To</th>
                    <th className="table-header">Days</th>
                    <th className="table-header">Reason</th>
                    <th className="table-header">Att. Code</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">HR Action</th>
                  </tr>
                </thead>
                <tbody>{children}</tbody>
              </table>
            </div>
          </div>
        )

        /* ── DAILY view ── */
        if (viewMode === 'daily') {
          const dayRows = filteredLeaves.filter(l => l.from_date <= selectedDate && l.to_date >= selectedDate)
          const pending  = dayRows.filter(l => l.status === 'pending').length
          const approved = dayRows.filter(l => l.status === 'approved').length
          return (
            <div className="space-y-3">
              {/* Day summary bar */}
              <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 flex-wrap">
                <p className="text-sm font-bold text-gray-800">
                  📅 {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                <span className="text-xs text-gray-500">Total on leave: <strong>{dayRows.length}</strong></span>
                <span className="text-xs text-green-600">✓ Approved: <strong>{approved}</strong></span>
                <span className="text-xs text-yellow-600">⏳ Pending: <strong>{pending}</strong></span>
                {/* Shift breakdown for the day */}
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(SHIFTS).map(([k, sh]) => {
                    const cnt = dayRows.filter(l => (l.shift || 'G') === k).length
                    if (!cnt) return null
                    return (
                      <span key={k} className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: sh.bg, color: sh.text, border: `1px solid ${sh.border}` }}>
                        {sh.short}: {cnt}
                      </span>
                    )
                  })}
                </div>
              </div>
              <TableWrap title={null} badge={null}>
                <LeaveRows rows={dayRows} emptyLabel={`No leaves on ${fmt(selectedDate)}`} />
              </TableWrap>
            </div>
          )
        }

        /* ── WEEKLY view ── */
        if (viewMode === 'weekly') {
          const { start, end } = weekRange(selectedWeek)
          return (
            <div className="space-y-4">
              {/* Week summary bar */}
              {(() => {
                const weekRows = filteredLeaves.filter(l => l.from_date <= end && l.to_date >= start)
                const pending  = weekRows.filter(l => l.status === 'pending').length
                const approved = weekRows.filter(l => l.status === 'approved').length
                return (
                  <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 flex-wrap">
                    <p className="text-sm font-bold text-gray-800">📅 Week: {fmt(start)} — {fmt(end)}</p>
                    <span className="text-xs text-gray-500">Total: <strong>{weekRows.length}</strong></span>
                    <span className="text-xs text-green-600">✓ Approved: <strong>{approved}</strong></span>
                    <span className="text-xs text-yellow-600">⏳ Pending: <strong>{pending}</strong></span>
                  </div>
                )
              })()}
              {/* One card per day of the week */}
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(selectedWeek)
                d.setDate(d.getDate() + i)
                const ds = isoDate(d)
                const dayRows = filteredLeaves.filter(l => l.from_date <= ds && l.to_date >= ds)
                const dayLabel = d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })
                const isToday  = ds === isoDate(today)
                return (
                  <div key={ds}>
                    <div className={`flex items-center gap-2 mb-1.5 px-1`}>
                      <p className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                        {isToday ? '📍 ' : ''}{dayLabel}
                      </p>
                      <span className="text-xs text-gray-400">{dayRows.length} record{dayRows.length !== 1 ? 's' : ''}</span>
                    </div>
                    <TableWrap title={null} badge={null}>
                      <LeaveRows rows={dayRows} emptyLabel={`No leaves on ${dayLabel}`} />
                    </TableWrap>
                  </div>
                )
              })}
            </div>
          )
        }

        /* ── MONTHLY view (default) ── */
        return (
          <TableWrap title={`${MONTHS[month]} ${year}`} badge={filteredLeaves.length}>
            <LeaveRows rows={filteredLeaves} emptyLabel={`No leave records for ${MONTHS[month]} ${year}`} />
          </TableWrap>
        )
      })()}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — LEAVE BALANCE
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'balance' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="table-header">Employee</th>
                  <th className="table-header">Department</th>
                  <th className="table-header">Casual</th>
                  <th className="table-header">Sick</th>
                  <th className="table-header">Earned</th>
                  <th className="table-header">W/ Permission</th>
                  <th className="table-header">Special</th>
                  <th className="table-header">Maternity</th>
                  <th className="table-header">Mandatory</th>
                  <th className="table-header">W/O Permission</th>
                  <th className="table-header">Abandonment</th>
                  <th className="table-header">Total Used</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>{[...Array(12)].map((_, j) => (
                      <td key={j} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}</tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr><td colSpan={12} className="table-cell text-center text-gray-400 py-16">No employees found</td></tr>
                ) : employees
                    .filter(e => !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || e.employee_code.toLowerCase().includes(search.toLowerCase()))
                    .map(emp => {
                      const bal = empBalance(emp.id)
                      const empLeaves = leaves.filter(l => l.employee_id === emp.id && l.status === 'approved')
                      const usedByType = (type) => empLeaves.filter(l => l.leave_type === type).reduce((s, l) => s + (l.days || 1), 0)
                      const totalUsed = empLeaves.reduce((s, l) => s + (l.days || 1), 0)

                      const BalCell = ({ type, allotted }) => {
                        const used = usedByType(type)
                        const remaining = Math.max(0, allotted - used)
                        const pct = allotted > 0 ? (used / allotted) * 100 : 0
                        const meta = LEAVE_TYPES[type]
                        return (
                          <td className="table-cell">
                            <div className="space-y-1 min-w-24">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">{used}/{allotted}</span>
                                <span style={{ color: meta.color }} className="font-medium">{remaining} left</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width: `${Math.min(pct, 100)}%`, background: meta.color }} />
                              </div>
                            </div>
                          </td>
                        )
                      }

                      return (
                        <tr key={emp.id} className="table-row">
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {emp.full_name[0]}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-xs">{emp.full_name}</p>
                                <p className="text-xs text-gray-400">{emp.employee_code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="table-cell text-xs text-gray-500">{emp.department || '—'}</td>
                          <BalCell type="casual"      allotted={bal.casual_allotted      ?? 12} />
                          <BalCell type="sick"        allotted={bal.sick_allotted        ?? 8}  />
                          <BalCell type="earned"      allotted={bal.earned_allotted      ?? 15} />
                          <BalCell type="permission"  allotted={bal.permission_allotted  ?? 10} />
                          <BalCell type="special"     allotted={bal.special_allotted     ?? 5}  />
                          <BalCell type="maternity"   allotted={bal.maternity_allotted   ?? 90} />
                          <BalCell type="mandatory"   allotted={bal.mandatory_allotted   ?? 1}  />
                          <td className="table-cell">
                            <span className="font-bold text-red-600">{usedByType('absent')}</span>
                            <span className="text-xs text-gray-400 ml-1">days</span>
                          </td>
                          <td className="table-cell">
                            <span className="font-bold text-rose-800">{usedByType('abandonment')}</span>
                            <span className="text-xs text-gray-400 ml-1">days</span>
                          </td>
                          <td className="table-cell">
                            <span className="font-bold text-gray-800">{totalUsed}</span>
                            <span className="text-xs text-gray-400 ml-1">days</span>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — SHIFT SUMMARY
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'shift' && (
        <div className="space-y-4">
          {Object.entries(SHIFTS).map(([shiftKey, shift]) => {
            const shiftLeaves = filteredLeaves.filter(l => (l.shift || 'G') === shiftKey)
            if (shiftLeaves.length === 0) return (
              <div key={shiftKey} className="card p-4 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-2 py-1 rounded"
                    style={{ background: shift.bg, color: shift.text, border: `1px solid ${shift.border}` }}>
                    {shift.short}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-700 text-sm">{shift.label}</p>
                    <p className="text-xs text-gray-400">{shift.time}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 italic">No leave records this month</p>
              </div>
            )

            // Per-type breakdown for this shift
            const byType = {}
            shiftLeaves.forEach(l => {
              byType[l.leave_type] = (byType[l.leave_type] || 0) + (l.days || dayDiff(l.from_date, l.to_date))
            })
            const approved = shiftLeaves.filter(l => l.status === 'approved').length
            const pending  = shiftLeaves.filter(l => l.status === 'pending').length
            const rejected = shiftLeaves.filter(l => l.status === 'rejected').length

            return (
              <div key={shiftKey} className="card p-0 overflow-hidden">
                {/* Shift header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"
                  style={{ background: shift.bg }}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: '#fff', color: shift.text, border: `1px solid ${shift.border}` }}>
                      {shift.short}
                    </span>
                    <div>
                      <p className="font-bold text-gray-800">{shift.label}</p>
                      <p className="text-xs text-gray-500">{shift.time}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs font-medium">
                    <span className="text-gray-600">Total: <strong>{shiftLeaves.length}</strong></span>
                    <span className="text-green-600">✓ {approved} approved</span>
                    <span className="text-yellow-600">⏳ {pending} pending</span>
                    <span className="text-red-500">✗ {rejected} rejected</span>
                  </div>
                </div>

                {/* Leave type breakdown chips */}
                <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
                  {Object.entries(byType).map(([type, days]) => {
                    const tm = LEAVE_TYPES[type] || LEAVE_TYPES.casual
                    return (
                      <span key={type} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: tm.bg, color: tm.text, border: `1px solid ${tm.border}` }}>
                        {tm.short}: {days} day{days !== 1 ? 's' : ''}
                      </span>
                    )
                  })}
                </div>

                {/* Leave rows for this shift */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="table-header">Employee</th>
                        <th className="table-header">Leave Type</th>
                        <th className="table-header">From</th>
                        <th className="table-header">To</th>
                        <th className="table-header">Days</th>
                        <th className="table-header">Reason</th>
                        <th className="table-header">Status</th>
                        <th className="table-header">HR Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftLeaves.map(leave => {
                        const meta   = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.casual
                        const status = STATUS_META[leave.status]     || STATUS_META.pending
                        const days   = leave.days || dayDiff(leave.from_date, leave.to_date)
                        return (
                          <tr key={leave.id} className="table-row">
                            <td className="table-cell">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {empName(leave.employee_id)[0]}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 text-xs">{empName(leave.employee_id)}</p>
                                  <p className="text-xs text-gray-400">{empCode(leave.employee_id)}</p>
                                </div>
                              </div>
                            </td>
                            <td className="table-cell">
                              <span className="text-xs font-semibold px-2 py-1 rounded-full"
                                style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}>
                                {meta.short} — {meta.label}
                              </span>
                            </td>
                            <td className="table-cell text-xs text-gray-600">{fmt(leave.from_date)}</td>
                            <td className="table-cell text-xs text-gray-600">{fmt(leave.to_date)}</td>
                            <td className="table-cell">
                              <span className="font-bold text-gray-800">{days}</span>
                              <span className="text-xs text-gray-400 ml-1">day{days !== 1 ? 's' : ''}</span>
                            </td>
                            <td className="table-cell text-xs text-gray-500 max-w-32">
                              <p className="truncate" title={leave.reason}>{leave.reason || '—'}</p>
                              {leave.rejection_reason && (
                                <p className="text-red-500 truncate" title={leave.rejection_reason}>
                                  ✗ {leave.rejection_reason}
                                </p>
                              )}
                            </td>
                            <td className="table-cell">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="table-cell">
                              {leave.status === 'pending' ? (
                                <div className="flex gap-1">
                                  <button onClick={() => openApproval(leave, 'approve')}
                                    className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors">
                                    <CheckCircle size={11} /> Approve
                                  </button>
                                  <button onClick={() => openApproval(leave, 'reject')}
                                    className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors">
                                    <XCircle size={11} /> Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">
                                  {leave.status === 'approved' ? `✓ ${leave.approved_at ? fmt(leave.approved_at) : 'Approved'}` : `✗ Rejected`}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

  {/* ════════════════════════════════════════════════════════════════════
          TAB — CALENDAR
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'calendar' && (
        <div className="card p-5">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {[...Array(firstDayOfMonth)].map((_, i) => <div key={`e-${i}`} />)}
            {/* Days */}
            {[...Array(daysInMonth)].map((_, i) => {
              const day      = i + 1
              const dayLeaves = calendarLeaves(day)
              const isToday  = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
              const isSun    = new Date(year, month, day).getDay() === 0

              return (
                <div key={day}
                  className={`min-h-14 rounded-lg p-1.5 text-xs border transition-colors ${
                    isToday   ? 'bg-blue-50 border-blue-300'  :
                    isSun     ? 'bg-gray-50 border-gray-100 opacity-60' :
                    dayLeaves.length > 0 ? 'bg-amber-50 border-amber-200' :
                    'bg-white border-gray-100 hover:bg-gray-50'
                  }`}>
                  <p className={`font-semibold mb-0.5 ${isToday ? 'text-blue-600' : isSun ? 'text-gray-400' : 'text-gray-700'}`}>
                    {day}
                  </p>
                  {dayLeaves.slice(0, 2).map((l, idx) => {
                    const meta = LEAVE_TYPES[l.leave_type] || LEAVE_TYPES.casual
                    return (
                      <div key={idx}
                        className="text-xs truncate rounded px-1 py-0.5 mb-0.5 font-medium"
                        style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}
                        title={`${empName(l.employee_id)} — ${meta.label}`}>
                        {empName(l.employee_id).split(' ')[0]}
                      </div>
                    )
                  })}
                  {dayLeaves.length > 2 && (
                    <p className="text-xs text-gray-400">+{dayLeaves.length - 2} more</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 flex-wrap mt-4 pt-4 border-t border-gray-100">
            {Object.entries(LEAVE_TYPES).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded" style={{ background: v.bg, border: `1px solid ${v.border}` }} />
                {v.short} — {v.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — Apply Leave
      ════════════════════════════════════════════════════════════════════ */}
      <Modal open={applyModal} onClose={() => setApplyModal(false)} title="Apply for Leave" size="md">
        <form onSubmit={handleApply} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Employee *</label>
              <select className="input" required value={applyForm.employee_id}
                onChange={e => setApplyForm(p => ({ ...p, employee_id: e.target.value }))}>
                <option value="">Select Employee</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="label">Leave Type *</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(LEAVE_TYPES).map(([key, meta]) => (
                  <button type="button" key={key}
                    onClick={() => setApplyForm(p => ({ ...p, leave_type: key }))}
                    className="px-2 py-2 rounded-lg text-xs font-semibold border-2 transition-all text-center"
                    style={{
                      background:   applyForm.leave_type === key ? meta.bg    : '#fff',
                      borderColor:  applyForm.leave_type === key ? meta.color : '#e5e7eb',
                      color:        applyForm.leave_type === key ? meta.text  : '#6b7280',
                    }}>
                    <p className="font-bold">{meta.short}</p>
                    <p className="text-xs opacity-80 mt-0.5">{meta.label}</p>
                  </button>
                ))}
              </div>
              {/* Attendance code note */}
              <p className="text-xs text-gray-400 mt-2">
                {['absent', 'abandonment'].includes(applyForm.leave_type)
                  ? '⚠️ Without Permission / Abandonment → Attendance Code 0 (Absent)'
                  : applyForm.leave_type === 'maternity'
                    ? '🤱 Maternity Leave → Attendance Code 6 (Leave) — Female only'
                    : applyForm.leave_type === 'mandatory'
                      ? '📋 One Day Mandatory Leave → Attendance Code 6 (Leave)'
                      : applyForm.leave_type === 'special'
                        ? '⭐ Special Leave → Attendance Code 6 (Leave)'
                        : '✅ With Permission / Leave → Attendance Code 6 (Leave)'}
              </p>
            </div>

            <div className="col-span-2">
              <label className="label">Shift *</label>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(SHIFTS).map(([key, sh]) => (
                  <button type="button" key={key}
                    onClick={() => setApplyForm(p => ({ ...p, shift: key }))}
                    className="px-2 py-2 rounded-lg text-xs font-semibold border-2 transition-all text-center"
                    style={{
                      background:  applyForm.shift === key ? sh.bg    : '#fff',
                      borderColor: applyForm.shift === key ? sh.color : '#e5e7eb',
                      color:       applyForm.shift === key ? sh.text  : '#6b7280',
                    }}>
                    <p className="font-bold">{sh.short}</p>
                    <p className="text-xs opacity-80 mt-0.5 leading-tight">{sh.time}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">From Date *</label>
              <input className="input" type="date" required
                value={applyForm.from_date}
                onChange={e => setApplyForm(p => ({ ...p, from_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">To Date *</label>
              <input className="input" type="date" required
                min={applyForm.from_date}
                value={applyForm.to_date}
                onChange={e => setApplyForm(p => ({ ...p, to_date: e.target.value }))} />
            </div>
          </div>

          {applyForm.from_date && applyForm.to_date && applyForm.to_date >= applyForm.from_date && (
            <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
              📅 Duration: <strong>{dayDiff(applyForm.from_date, applyForm.to_date)} day(s)</strong>
            </div>
          )}

          <div>
            <label className="label">Reason <span className="text-red-500">*</span></label>
            {/* Predefined reasons for the selected leave type */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {(LEAVE_REASONS[applyForm.leave_type] || []).map(r => (
                <button type="button" key={r}
                  onClick={() => setApplyForm(p => ({ ...p, reason: p.reason === r ? '' : r }))}
                  className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-all leading-snug ${
                    applyForm.reason === r
                      ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea className="input resize-none" rows={2}
              placeholder="Or type a custom reason…"
              value={applyForm.reason}
              onChange={e => setApplyForm(p => ({ ...p, reason: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setApplyModal(false)}>Cancel</button>
            <button type="submit" disabled={applySaving} className="btn-primary">
              {applySaving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — HR Approve / Reject
      ════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={approvalModal.open}
        onClose={() => setApprovalModal({ open: false, leave: null, mode: '' })}
        title={approvalModal.mode === 'approve' ? '✅ Approve Leave' : '❌ Reject Leave'}
        size="sm">
        {approvalModal.leave && (() => {
          const leave = approvalModal.leave
          const meta  = LEAVE_TYPES[leave.leave_type] || LEAVE_TYPES.casual
          const days  = leave.days || dayDiff(leave.from_date, leave.to_date)
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg p-3 space-y-2 text-sm" style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{empName(leave.employee_id)}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: '#fff', color: meta.text, border: `1px solid ${meta.border}` }}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>📅 {fmt(leave.from_date)} → {fmt(leave.to_date)} ({days} day{days !== 1 ? 's' : ''})</p>
                  {leave.shift && (() => { const sh = SHIFTS[leave.shift] || SHIFTS.G; return <p>🔄 Shift: <strong>{sh.label}</strong> ({sh.time})</p> })()}
                  {leave.reason && <p>📝 {leave.reason}</p>}
                  <p>🎫 Attendance Code: <strong>{['absent','abandonment'].includes(leave.leave_type) ? '0 — Absent' : '6 — Leave'}</strong></p>
                </div>
              </div>

              {approvalModal.mode === 'reject' && (
                <div>
                  <label className="label">Rejection Reason <span className="text-red-500">*</span></label>
                  <textarea className="input resize-none" rows={3} autoFocus
                    placeholder="Reason for rejection…"
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)} />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button className="btn-secondary"
                  onClick={() => setApprovalModal({ open: false, leave: null, mode: '' })}>
                  Cancel
                </button>
                {approvalModal.mode === 'approve' ? (
                  <button onClick={handleApprove} disabled={approvalSaving}
                    className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700">
                    <CheckCircle size={15} />
                    {approvalSaving ? 'Approving…' : 'Confirm Approval'}
                  </button>
                ) : (
                  <button onClick={handleReject}
                    disabled={approvalSaving || !rejectionReason.trim()}
                    className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40">
                    <XCircle size={15} />
                    {approvalSaving ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                )}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
