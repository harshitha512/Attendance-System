import { useState, useEffect, useRef } from 'react'
import { employeeAPI } from '../api'
import api from '../api'
import Modal from '../components/Modal'
import { Plus, Pencil, Trash2, Search, Users, RefreshCw, Upload, Download, ShieldOff, ArrowLeftRight, Clock, CheckCircle, XCircle, RotateCcw, CalendarDays, Pause, Play } from 'lucide-react'
import toast from 'react-hot-toast'

// ── Shift definitions per Operation Biometric doc ──────────────────────────
const SHIFTS = {
  A: {
    label:      'A Shift (6:00 AM – 2:00 PM)',
    shift_start: '06:00',
    shift_end:   '14:00',
    in_window:  '5:40 AM – 6:10 AM',
    out_window: '2:10 PM – 2:30 PM',
    ot_window:  '2:00 PM – 4:00 PM',
  },
  B: {
    label:      'B Shift (2:00 PM – 10:00 PM)',
    shift_start: '14:00',
    shift_end:   '22:00',
    in_window:  '1:40 PM – 2:10 PM',
    out_window: '10:10 PM – 10:30 PM',
    ot_window:  '12:00 PM – 2:00 PM',
  },
  C: {
    label:      'C Shift (10:00 PM – 6:00 AM)',
    shift_start: '22:00',
    shift_end:   '06:00',
    in_window:  '9:40 PM – 10:10 PM',
    out_window: '6:10 AM – 6:30 AM',
    ot_window:  '8:00 PM – 10:00 PM',
  },
  G: {
    label:      'G Shift (9:00 AM – 5:30 PM)',
    shift_start: '09:00',
    shift_end:   '17:30',
    in_window:  '8:40 AM – 9:10 AM',
    out_window: '5:30 PM – 6:00s PM',
    ot_window:  '5:30 PM – 7:30 PM',
  },
}

// ── Rotation cycle: A→C, B→A, C→B  (G is permanent) ──────────────────────
const ROTATION_CYCLE = ['A', 'B', 'C']

const ROTATION_MAP = { A: 'C', B: 'A', C: 'B' }   // explicit map — not a simple index shift

const nextShiftInCycle = (currentShift) => ROTATION_MAP[currentShift] || currentShift

// ── Departments that are FIXED (no auto-rotation) ─────────────────────────
// HR can manage this list; shift changes for these depts require HR approval
const FIXED_DEPARTMENTS = ['HR', 'Admin', 'Finance', 'Management', 'Security']

const isDeptFixed = (department) =>
  FIXED_DEPARTMENTS.some(d => d.toLowerCase() === (department || '').toLowerCase())

// Returns the date of the next Saturday on or after a given date
const nextSaturday = (from = new Date()) => {
  const d = new Date(from)
  const day = d.getDay()                             // 0=Sun … 6=Sat
  const daysUntilSat = day === 6 ? 7 : (6 - day)    // 0 means today is Sat → use next Sat
  d.setDate(d.getDate() + (daysUntilSat || 7))
  d.setHours(0, 0, 0, 0)
  return d
}

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })


const EMPTY_FORM = {
  employee_code: '',
  full_name:     '',
  email:         '',
  phone:         '',
  department:    '',
  designation:   '',
  gender:        '',        // needed for gender-wise leave/absent reports
  shift:         'G',       // default to G shift
  shift_start:   '09:00',
  shift_end:     '17:30',
  status:        'active',
  biometric_blocked: false, // 8-day absence auto-block flag
  rotation_enabled:  true,  // participates in weekly auto-rotation by default
}

export default function Employees() {
  const [employees, setEmployees]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [dept, setDept]               = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [departments, setDepartments] = useState([])
  const [modal, setModal]             = useState({ open: false, mode: 'add', data: null })
  const [form, setForm]               = useState(EMPTY_FORM)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(null)

  // Shift change state
  const [shiftChangeModal, setShiftChangeModal] = useState({ open: false, emp: null })
  const [shiftChangeForm, setShiftChangeForm]   = useState({
    new_shift:      '',
    effective_date: '',
    reason:         '',
  })
  const [shiftChangeSaving, setShiftChangeSaving] = useState(false)
  const [shiftChangeHistory, setShiftChangeHistory] = useState([]) // per-employee history
  const [approvalModal, setApprovalModal]           = useState({ open: false, request: null, mode: '' }) // mode: 'approve'|'reject'
  const [rejectionReason, setRejectionReason]       = useState('')
  const [approvalSaving, setApprovalSaving]         = useState(false)

  // Weekly rotation state
  const [rotationModal, setRotationModal]     = useState(false)
  const [rotationRunning, setRotationRunning] = useState(false)
  const [rotationPreview, setRotationPreview] = useState([])   // [{emp, currentShift, nextShift}]
  const nextRotationDate = nextSaturday()

  // Bulk import state
  const [bulkModal, setBulkModal]     = useState(false)
  const [bulkFile, setBulkFile]       = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult]   = useState(null)
  const fileInputRef                  = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const [empRes, deptRes] = await Promise.all([
        employeeAPI.list({ search, department: dept, shift: shiftFilter, limit: 200 }),
        employeeAPI.departments(),
      ])
      setEmployees(empRes.data?.data || [])
      setDepartments(deptRes.data?.data || [])
    } catch (err) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, dept, shiftFilter])

  // ── When shift dropdown changes, auto-fill shift_start / shift_end ────────
  const handleShiftChange = (shiftKey) => {
    const s = SHIFTS[shiftKey]
    setForm(p => ({
      ...p,
      shift:       shiftKey,
      shift_start: s ? s.shift_start : p.shift_start,
      shift_end:   s ? s.shift_end   : p.shift_end,
    }))
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setModal({ open: true, mode: 'add', data: null })
  }

  const openEdit = (emp) => {
    setForm({
      employee_code:     emp.employee_code,
      full_name:         emp.full_name,
      email:             emp.email             || '',
      phone:             emp.phone             || '',
      department:        emp.department        || '',
      designation:       emp.designation       || '',
      gender:            emp.gender            || '',
      shift:             emp.shift             || 'G',
      shift_start:       emp.shift_start       || '09:00',
      shift_end:         emp.shift_end         || '17:30',
      status:            emp.status            || 'active',
      biometric_blocked: emp.biometric_blocked || false,
      rotation_enabled:  emp.rotation_enabled !== false, // default true
    })
    setModal({ open: true, mode: 'edit', data: emp })
  }

  // ── Unblock biometric (HR approval action) ────────────────────────────────
  const handleUnblockBiometric = async (emp) => {
    if (!window.confirm(`Unblock biometric access for ${emp.full_name}? This requires HR approval.`)) return
    try {
      await employeeAPI.update(emp.id, { biometric_blocked: false })
      toast.success(`Biometric access restored for ${emp.full_name}`)
      load()
    } catch (err) {
      toast.error('Failed to unblock biometric')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // Sync shift_start / shift_end from the selected shift
      const shiftMeta = SHIFTS[form.shift]
      const payload = {
        ...form,
        shift_start: shiftMeta?.shift_start || form.shift_start,
        shift_end:   shiftMeta?.shift_end   || form.shift_end,
      }
      if (modal.mode === 'add') {
        await employeeAPI.create(payload)
        toast.success('Employee added!')
      } else {
        await employeeAPI.update(modal.data.id, payload)
        toast.success('Employee updated!')
      }
      setModal({ open: false, mode: 'add', data: null })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Shift Change ─────────────────────────────────────────────────────────
  const openShiftChange = async (emp) => {
    setShiftChangeForm({ new_shift: '', effective_date: '', reason: '' })
    setShiftChangeHistory([])
    setShiftChangeModal({ open: true, emp })
    // Load existing shift change history for this employee
    try {
      const res = await api.get(`/employees/${emp.id}/shift-changes`)
      setShiftChangeHistory(res.data?.data || [])
    } catch {
      // History unavailable — non-critical
    }
  }

  const handleShiftChangeSubmit = async (e) => {
    e.preventDefault()
    if (!shiftChangeForm.new_shift || !shiftChangeForm.effective_date) {
      toast.error('Please fill in all required fields')
      return
    }
    if (shiftChangeForm.new_shift === shiftChangeModal.emp?.shift) {
      toast.error('New shift must be different from the current shift')
      return
    }
    setShiftChangeSaving(true)
    const empDeptFixed = isDeptFixed(shiftChangeModal.emp?.department)
    try {
      const payload = {
        employee_id:    shiftChangeModal.emp.id,
        old_shift:      shiftChangeModal.emp.shift,
        new_shift:      shiftChangeForm.new_shift,
        effective_date: shiftChangeForm.effective_date,
        reason:         shiftChangeForm.reason,
        status:         'pending',          // always pending — HR must approve
        dept_fixed:     empDeptFixed,       // flag for HR to know this needs special approval
        requested_at:   new Date().toISOString(),
      }
      await api.post(`/employees/${shiftChangeModal.emp.id}/shift-changes`, payload)
      toast.success(
        empDeptFixed
          ? 'Request submitted — HR approval required (fixed department)'
          : 'Shift change request submitted — pending HR approval'
      )
      setShiftChangeForm({ new_shift: '', effective_date: '', reason: '' })
      // Reload history
      const res = await api.get(`/employees/${shiftChangeModal.emp.id}/shift-changes`)
      setShiftChangeHistory(res.data?.data || [])
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit shift change')
    } finally {
      setShiftChangeSaving(false)
    }
  }

  const openApprovalModal = (request, mode) => {
    setRejectionReason('')
    setApprovalModal({ open: true, request, mode })
  }

  const handleApproveShiftChange = async () => {
    const request = approvalModal.request
    setApprovalSaving(true)
    try {
      await api.patch(`/employees/${request.employee_id}/shift-changes/${request.id}`, {
        status:      'approved',
        approved_at: new Date().toISOString(),
      })
      // Only now apply the shift change to the employee record
      await employeeAPI.update(request.employee_id, {
        shift:       request.new_shift,
        shift_start: SHIFTS[request.new_shift]?.shift_start,
        shift_end:   SHIFTS[request.new_shift]?.shift_end,
      })
      toast.success(`Shift change approved — ${request.employee_name || 'Employee'} moved to ${request.new_shift} Shift`)
      setApprovalModal({ open: false, request: null, mode: '' })
      const res = await api.get(`/employees/${request.employee_id}/shift-changes`)
      setShiftChangeHistory(res.data?.data || [])
      load()
    } catch (err) {
      toast.error('Failed to approve shift change')
    } finally {
      setApprovalSaving(false)
    }
  }

  const handleRejectShiftChange = async () => {
    const request = approvalModal.request
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    setApprovalSaving(true)
    try {
      await api.patch(`/employees/${request.employee_id}/shift-changes/${request.id}`, {
        status:           'rejected',
        rejection_reason: rejectionReason.trim(),
        rejected_at:      new Date().toISOString(),
      })
      toast.success('Shift change request rejected')
      setApprovalModal({ open: false, request: null, mode: '' })
      const res = await api.get(`/employees/${request.employee_id}/shift-changes`)
      setShiftChangeHistory(res.data?.data || [])
    } catch (err) {
      toast.error('Failed to reject shift change')
    } finally {
      setApprovalSaving(false)
    }
  }

  const shiftChangeBadge = (status) => {
    const map = {
      pending:  { cls: 'badge-yellow', icon: <Clock size={10} className="inline mr-0.5" />,        label: 'Pending'  },
      approved: { cls: 'badge-green',  icon: <CheckCircle size={10} className="inline mr-0.5" />,  label: 'Approved' },
      rejected: { cls: 'badge-red',    icon: <XCircle size={10} className="inline mr-0.5" />,      label: 'Rejected' },
    }
    const m = map[status] || { cls: 'badge-gray', icon: null, label: status }
    return <span className={`badge ${m.cls}`}>{m.icon}{m.label}</span>
  }

  // ── Weekly Rotation ──────────────────────────────────────────────────────
  const openRotationModal = () => {
    const preview = employees
      .filter(e => e.rotation_enabled !== false && e.status === 'active' && e.shift !== 'G' && !isDeptFixed(e.department))
      .map(e => ({
        id:            e.id,
        full_name:     e.full_name,
        employee_code: e.employee_code,
        department:    e.department || '—',
        currentShift:  e.shift || 'A',
        nextShift:     nextShiftInCycle(e.shift || 'A'),
      }))
    setRotationPreview(preview)
    setRotationModal(true)
  }

  const handleRunRotation = async () => {
    if (!window.confirm(
      `This will rotate ${rotationPreview.length} employees (A→C, B→A, C→B).\n\nEffective: ${formatDate(nextRotationDate)}\n\nFixed-department employees are excluded.\n\nProceed?`
    )) return

    setRotationRunning(true)
    let success = 0, failed = 0
    try {
      await Promise.all(
        rotationPreview.map(async (row) => {
          try {
            const meta = SHIFTS[row.nextShift]
            await employeeAPI.update(row.id, {
              shift:       row.nextShift,
              shift_start: meta.shift_start,
              shift_end:   meta.shift_end,
            })
            // Log the rotation as a shift-change record
            await api.post(`/employees/${row.id}/shift-changes`, {
              employee_id:    row.id,
              old_shift:      row.currentShift,
              new_shift:      row.nextShift,
              effective_date: nextRotationDate.toISOString().split('T')[0],
              reason:         'Weekly auto-rotation',
              status:         'approved',
              requested_at:   new Date().toISOString(),
            })
            success++
          } catch {
            failed++
          }
        })
      )
      toast.success(`Rotation complete — ${success} employees updated${failed ? `, ${failed} failed` : ''}`)
      setRotationModal(false)
      load()
    } catch (err) {
      toast.error('Rotation failed unexpectedly')
    } finally {
      setRotationRunning(false)
    }
  }

  const handleToggleRotation = async (emp) => {
    const newVal = !(emp.rotation_enabled !== false)
    try {
      await employeeAPI.update(emp.id, { rotation_enabled: newVal })
      toast.success(`${emp.full_name} rotation ${newVal ? 'enabled' : 'paused'}`)
      load()
    } catch {
      toast.error('Failed to update rotation setting')
    }
  }

  // ── Download Rotation Schedule as CSV ────────────────────────────────────
  const downloadRotationFile = () => {
    const effDate = formatDate(nextRotationDate)
    const rows = [
      ['Shift Rotation Schedule — Effective ' + effDate],
      ['Rotation Rule: A → C | B → A | C → B | G → Permanent'],
      ['Generated on: ' + new Date().toLocaleDateString('en-IN')],
      [],
      ['Emp ID', 'Name', 'Department', 'Gender', 'Current Shift', 'Next Shift', 'Effective Date', 'Rotation Status'],
    ]

    employees
      .filter(e => e.status === 'active')
      .forEach(e => {
        const isFixed = isDeptFixed(e.department)
        const isG     = e.shift === 'G'
        const isPaused = e.rotation_enabled === false

        let nextShift   = '—'
        let rotStatus   = ''
        if (isG)         { nextShift = 'G (Permanent)'; rotStatus = 'Permanent' }
        else if (isFixed) { nextShift = e.shift + ' (Fixed Dept)'; rotStatus = 'Fixed — HR Approval Required' }
        else if (isPaused){ nextShift = e.shift + ' (Paused)';     rotStatus = 'Paused' }
        else              { nextShift = nextShiftInCycle(e.shift || 'A'); rotStatus = 'Will Rotate' }

        rows.push([
          e.employee_code,
          e.full_name,
          e.department || '—',
          e.gender     || '—',
          (e.shift || '—') + ' Shift',
          nextShift,
          (isG || isFixed || isPaused) ? '—' : effDate,
          rotStatus,
        ])
      })

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `shift_rotation_${nextRotationDate.toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Rotation schedule downloaded')
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.full_name}?`)) return
    setDeleting(emp.id)
    try {
      await employeeAPI.delete(emp.id)
      toast.success('Employee deleted')
      load()
    } catch (err) {
      toast.error('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  // ── Bulk Import ──────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (!bulkFile) { toast.error('Please select an Excel file'); return }
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const formData = new FormData()
      formData.append('file', bulkFile)
      const res = await api.post('/employees/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setBulkResult(res.data)
      toast.success(res.data.message)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const closeBulkModal = () => {
    setBulkModal(false)
    setBulkFile(null)
    setBulkResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Download sample CSV template (updated with gender + shift columns)
  const downloadTemplate = () => {
    const headers = [
      'Employee Code *', 'Full Name *', 'Email', 'Phone',
      'Department', 'Designation', 'Gender (Male/Female/Other)',
      'Shift (A/B/C/G) *', 'Status (active/inactive/terminated)'
    ]
    const sample = [
      'EMP001', 'John Doe', 'john@example.com', '9876543210',
      'IT', 'Developer', 'Male', 'G', 'active'
    ]
    const csv = [headers.join(','), sample.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employee_import_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusBadge = (emp) => {
    // Biometric blocked takes priority in display
    if (emp.biometric_blocked) {
      return <span className="badge badge-red">⛔ Biometric Blocked</span>
    }
    const map = { active: 'badge-green', inactive: 'badge-yellow', terminated: 'badge-red' }
    return <span className={`badge ${map[emp.status] || 'badge-gray'}`}>{emp.status}</span>
  }

  const shiftBadge = (shiftKey) => {
    const colors = { A: 'badge-blue', B: 'badge-purple', C: 'badge-gray', G: 'badge-green' }
    const shift = SHIFTS[shiftKey]
    return (
      <div>
        <span className={`badge ${colors[shiftKey] || 'badge-gray'}`}>{shiftKey} Shift</span>

      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <span className="ml-2 text-sm text-gray-400 font-normal">({employees.length})</span>
        </div>
        <div className="flex gap-2">
          <button onClick={openRotationModal} className="btn-secondary flex items-center gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
            <RotateCcw size={16} /> Weekly Rotation
          </button>
          <button onClick={downloadRotationFile} className="btn-secondary flex items-center gap-2 text-green-600 border-green-200 hover:bg-green-50">
            <Download size={16} /> Rotation File
          </button>
          <button onClick={() => setBulkModal(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Bulk Import
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 w-full" placeholder="Search name or code…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={dept} onChange={e => setDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {/* Shift filter — new per biometric doc */}
        <select className="input w-36" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
          <option value="">All Shifts</option>
          {Object.keys(SHIFTS).map(s => (
            <option key={s} value={s}>{s} Shift</option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-header">Emp ID</th>
                <th className="table-header">Name</th>
                <th className="table-header">Gender</th>
                <th className="table-header">Department</th>
                <th className="table-header">Designation</th>
                <th className="table-header">Shift</th>
                <th className="table-header">Status</th>
                <th className="table-header">Face</th>
                <th className="table-header">Blocked</th>
                <th className="table-header">Shift Change</th>
                <th className="table-header">Next Rotation</th>
                <th className="table-header">Actions</th>
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
                <tr><td colSpan={12} className="table-cell text-center text-gray-400 py-16">
                  No employees found
                </td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className={`table-row ${emp.biometric_blocked ? 'bg-red-50' : ''}`}>

                  {/* Emp ID */}
                  <td className="table-cell">
                    <span className="text-xs font-mono font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {emp.employee_code}
                    </span>
                  </td>

                  {/* Name */}
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                        {emp.full_name[0]}
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">{emp.full_name}</span>
                    </div>
                  </td>

                  {/* Gender */}
                  <td className="table-cell text-gray-600 text-xs capitalize">
                    {emp.gender || '—'}
                  </td>

                  {/* Department */}
                  <td className="table-cell text-gray-700 text-sm">
                    {emp.department || '—'}
                  </td>

                  {/* Designation */}
                  <td className="table-cell text-gray-500 text-xs">
                    {emp.designation || '—'}
                  </td>

                  {/* Shift */}
                  <td className="table-cell">
                    {emp.shift ? shiftBadge(emp.shift) : (
                      <span className="text-xs text-gray-400">{emp.shift_start} – {emp.shift_end}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="table-cell">{statusBadge(emp)}</td>

                  {/* Face */}
                  <td className="table-cell">
                    {emp.face_registered_at
                      ? <span className="badge badge-green text-xs">✓ Registered</span>
                      : <span className="badge badge-gray text-xs">None</span>}
                  </td>

                  {/* Blocked */}
                  <td className="table-cell">
                    {emp.biometric_blocked
                      ? <span className="badge badge-red text-xs flex items-center gap-1 w-fit">
                          <ShieldOff size={10} /> Blocked
                        </span>
                      : <span className="badge badge-green text-xs">Active</span>}
                  </td>

                  {/* Shift Change */}
                  <td className="table-cell">
                    <button
                      onClick={() => openShiftChange(emp)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                      title="Request / View Shift Change">
                      <ArrowLeftRight size={13} />
                      Change
                    </button>
                    {emp.pending_shift_change && (
                      <p className="text-xs text-yellow-600 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> → {emp.pending_shift_change}
                      </p>
                    )}
                  </td>

                  {/* Next Rotation */}
                  <td className="table-cell">
                    {emp.shift === 'G' ? (
                      <span className="badge badge-gray text-xs">🔒 Permanent</span>
                    ) : isDeptFixed(emp.department) ? (
                      <span className="badge badge-red text-xs flex items-center gap-1 w-fit">
                        🏢 Fixed Dept
                      </span>
                    ) : emp.rotation_enabled !== false ? (
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-700">
                          <span className="font-semibold">{emp.shift || 'A'}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-semibold text-indigo-600">{nextShiftInCycle(emp.shift || 'A')}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <CalendarDays size={10} /> {formatDate(nextRotationDate)}
                        </p>
                      </div>
                    ) : (
                      <span className="badge badge-yellow text-xs flex items-center gap-1 w-fit">
                        <Pause size={9} /> Paused
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="table-cell">
                    <div className="flex gap-1 items-center">
                      <button onClick={() => openEdit(emp)}
                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Employee">
                        <Pencil size={15} />
                      </button>
                      {emp.shift !== 'G' && !isDeptFixed(emp.department) && (
                        <button
                          onClick={() => handleToggleRotation(emp)}
                          className={`p-1.5 rounded-lg transition-colors ${emp.rotation_enabled !== false ? 'text-indigo-400 hover:bg-indigo-50' : 'text-green-500 hover:bg-green-50'}`}
                          title={emp.rotation_enabled !== false ? 'Pause Rotation' : 'Resume Rotation'}>
                          {emp.rotation_enabled !== false ? <Pause size={15} /> : <Play size={15} />}
                        </button>
                      )}
                      {emp.biometric_blocked && (
                        <button
                          onClick={() => handleUnblockBiometric(emp)}
                          className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Unblock Biometric Access (HR Approval)">
                          <ShieldOff size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(emp)} disabled={deleting === emp.id}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Employee">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

{/* Add / Edit Modal */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, mode: 'add', data: null })}
        title={modal.mode === 'add' ? 'Add Employee' : 'Edit Employee'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Employee Code *</label>
              <input className="input" required placeholder="EMP001"
                value={form.employee_code}
                onChange={e => setForm(p => ({ ...p, employee_code: e.target.value }))}
                disabled={modal.mode === 'edit'} />
            </div>
            <div>
              <label className="label">Full Name *</label>
              <input className="input" required placeholder="John Doe"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="john@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="+1234567890"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="Engineering"
                value={form.department}
                onChange={e => setForm(p => ({ ...p, department: e.target.value }))} />
            </div>
            <div>
              <label className="label">Designation</label>
              <input className="input" placeholder="Developer"
                value={form.designation}
                onChange={e => setForm(p => ({ ...p, designation: e.target.value }))} />
            </div>

            {/* Gender — required for gender-wise leave monitoring report */}
            <div>
              <label className="label">Gender</label>
              <select className="input" value={form.gender}
                onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Shift selector — A/B/C/G with auto-fill of times & OT window info */}
            <div>
              <label className="label">Shift *</label>
              <select className="input" required value={form.shift}
                onChange={e => handleShiftChange(e.target.value)}>
                {Object.entries(SHIFTS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Shift info panel — shows in/out windows and OT window */}
          {form.shift && SHIFTS[form.shift] && (
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold text-blue-900">Shift Rules for {form.shift} Shift</p>
              <p>✅ Allowed In-Time:  {SHIFTS[form.shift].in_window}</p>
              <p>✅ Allowed Out-Time: {SHIFTS[form.shift].out_window}</p>
            </div>
          )}

          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>

          {/* Biometric blocked toggle — HR-only control for 8-day absence rule */}
          {modal.mode === 'edit' && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <input
                type="checkbox"
                id="biometric_blocked"
                checked={form.biometric_blocked}
                onChange={e => setForm(p => ({ ...p, biometric_blocked: e.target.checked }))}
                className="w-4 h-4 accent-red-500"
              />
              <div>
                <label htmlFor="biometric_blocked" className="label mb-0 cursor-pointer text-red-700">
                  Biometric Access Blocked
                </label>
                <p className="text-xs text-gray-400">
                  Auto-set after 8 consecutive absences. HR must manually uncheck to restore access.
                </p>
              </div>
            </div>
          )}

          {/* Rotation enabled toggle — hidden for G shift and fixed departments */}
          {modal.mode === 'edit' && form.shift !== 'G' && !isDeptFixed(form.department) && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <input
                type="checkbox"
                id="rotation_enabled"
                checked={form.rotation_enabled !== false}
                onChange={e => setForm(p => ({ ...p, rotation_enabled: e.target.checked }))}
                className="w-4 h-4 accent-indigo-500"
              />
              <div>
                <label htmlFor="rotation_enabled" className="label mb-0 cursor-pointer text-indigo-700">
                  Include in Weekly Auto-Rotation
                </label>
                <p className="text-xs text-gray-400">
                  When enabled, this employee's shift rotates A→B→C→G→A every Monday automatically.
                  Uncheck to keep them on a fixed shift.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary"
              onClick={() => setModal({ open: false, mode: 'add', data: null })}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : modal.mode === 'add' ? 'Add Employee' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal open={bulkModal} onClose={closeBulkModal} title="Bulk Import Employees" size="md">
        <div className="space-y-4">
          {/* Template download */}
          <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-3">
            <Download size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Download Template</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Fill in employee data using shift codes: <strong>A, B, C, G</strong>.
                Gender field is required for leave monitoring reports.
              </p>
              <button onClick={downloadTemplate}
                className="mt-2 text-xs text-blue-600 underline hover:text-blue-800">
                Download CSV Template
              </button>
            </div>
          </div>

          {/* Shift reference */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-700 mb-1">Shift Reference</p>
            {Object.entries(SHIFTS).map(([key, s]) => (
              <p key={key}><strong>{key}:</strong> {s.label}</p>
            ))}
          </div>

          {/* File upload */}
          <div>
            <label className="label">Select Excel / CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input"
              onChange={e => { setBulkFile(e.target.files[0]); setBulkResult(null) }}
            />
            <p className="text-xs text-gray-400 mt-1">Supported: .xlsx, .xls, .csv</p>
          </div>

          {/* Results */}
          {bulkResult && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-800">{bulkResult.message}</p>
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">✓ {bulkResult.results?.success} added/updated</span>
                {bulkResult.results?.failed > 0 &&
                  <span className="text-red-500">✗ {bulkResult.results?.failed} failed</span>}
              </div>
              {bulkResult.results?.errors?.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {bulkResult.results.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-500">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={closeBulkModal} className="btn-secondary">Close</button>
            <button onClick={handleBulkUpload} disabled={!bulkFile || bulkLoading}
              className="btn-primary flex items-center gap-2">
              <Upload size={15} />
              {bulkLoading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Shift Change Modal */}
      <Modal
        open={shiftChangeModal.open}
        onClose={() => setShiftChangeModal({ open: false, emp: null })}
        title={`Shift Change — ${shiftChangeModal.emp?.full_name || ''}`}
        size="lg">
        <div className="space-y-5">

          {/* Fixed department warning */}
          {shiftChangeModal.emp && isDeptFixed(shiftChangeModal.emp.department) && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              🏢 <span>
                <strong>{shiftChangeModal.emp.department}</strong> is a fixed department.
                Shift changes here require explicit HR approval before taking effect.
              </span>
            </div>
          )}

          {/* Current shift info */}
          {shiftChangeModal.emp && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 text-sm">
              <div className="text-gray-500">Current Shift:</div>
              <span className="font-semibold text-gray-800">
                {shiftChangeModal.emp.shift} Shift
              </span>
              {SHIFTS[shiftChangeModal.emp.shift] && (
                <span className="text-xs text-gray-400">
                  ({SHIFTS[shiftChangeModal.emp.shift].label.replace(/.*\(/, '').replace(')', '')})
                </span>
              )}
            </div>
          )}

          {/* Request form */}
          <form onSubmit={handleShiftChangeSubmit} className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">New Shift Change Request</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">New Shift *</label>
                <select className="input" required value={shiftChangeForm.new_shift}
                  onChange={e => setShiftChangeForm(p => ({ ...p, new_shift: e.target.value }))}>
                  <option value="">Select Shift</option>
                  {Object.entries(SHIFTS)
                    .filter(([key]) => key !== shiftChangeModal.emp?.shift)
                    .map(([key, s]) => (
                      <option key={key} value={key}>{s.label}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label">Effective Date *</label>
                <input className="input" type="date" required
                  min={new Date().toISOString().split('T')[0]}
                  value={shiftChangeForm.effective_date}
                  onChange={e => setShiftChangeForm(p => ({ ...p, effective_date: e.target.value }))} />
              </div>
            </div>

            {/* New shift preview */}
            {shiftChangeForm.new_shift && SHIFTS[shiftChangeForm.new_shift] && (
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-800 space-y-1">
                <p className="font-semibold text-indigo-900">
                  New Shift Rules — {shiftChangeForm.new_shift} Shift
                </p>
                <p>✅ Allowed In-Time:  {SHIFTS[shiftChangeForm.new_shift].in_window}</p>
                <p>✅ Allowed Out-Time: {SHIFTS[shiftChangeForm.new_shift].out_window}</p>
              </div>
            )}

            <div>
              <label className="label">Reason for Shift Change</label>
              <textarea className="input resize-none" rows={2}
                placeholder="e.g. Personal request, operational requirement, medical reason…"
                value={shiftChangeForm.reason}
                onChange={e => setShiftChangeForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={shiftChangeSaving} className="btn-primary flex items-center gap-2">
                <ArrowLeftRight size={14} />
                {shiftChangeSaving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>

          {/* Shift change history */}
          {shiftChangeHistory.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">HR Approval Queue</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {shiftChangeHistory.map((req, i) => (
                  <div key={req.id || i}
                    className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${
                      req.status === 'pending'  ? 'bg-yellow-50 border-yellow-200' :
                      req.status === 'approved' ? 'bg-green-50 border-green-100'  :
                                                  'bg-red-50 border-red-100'
                    }`}>
                    {/* Top row — shift arrow + badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800 text-sm">
                          {req.old_shift} Shift → {req.new_shift} Shift
                        </span>
                        {req.dept_fixed && (
                          <span className="badge badge-red text-xs">🏢 Fixed Dept</span>
                        )}
                      </div>
                      {shiftChangeBadge(req.status)}
                    </div>

                    {/* Details row */}
                    <div className="flex gap-4 text-gray-500">
                      <span>📅 Effective: <strong className="text-gray-700">{req.effective_date}</strong></span>
                      {req.requested_at && (
                        <span>🕐 Requested: {new Date(req.requested_at).toLocaleDateString('en-IN')}</span>
                      )}
                    </div>

                    {req.reason && (
                      <p className="text-gray-500 italic">Reason: "{req.reason}"</p>
                    )}

                    {/* Rejection reason (if rejected) */}
                    {req.status === 'rejected' && req.rejection_reason && (
                      <p className="text-red-600">Rejected: "{req.rejection_reason}"</p>
                    )}

                    {/* HR action buttons — only for pending */}
                    {req.status === 'pending' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => openApprovalModal(req, 'approve')}
                          className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button
                          onClick={() => openApprovalModal(req, 'reject')}
                          className="flex items-center gap-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors">
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {shiftChangeHistory.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No shift change history for this employee.</p>
          )}

          <div className="flex justify-end">
            <button onClick={() => setShiftChangeModal({ open: false, emp: null })}
              className="btn-secondary">Close</button>
          </div>
        </div>
      </Modal>
      {/* Weekly Rotation Preview Modal */}
      <Modal open={rotationModal} onClose={() => setRotationModal(false)}
        title="Weekly Shift Rotation" size="lg">
        <div className="space-y-4">

          {/* Info banner */}
          <div className="bg-indigo-50 rounded-lg p-4 flex items-start gap-3">
            <RotateCcw size={18} className="text-indigo-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-900">Rotation Cycle: A → C &nbsp;|&nbsp; B → A &nbsp;|&nbsp; C → B</p>
              <p className="text-xs text-indigo-700 mt-1">
                Effective from <strong>{formatDate(nextRotationDate)}</strong> (Saturday).
                G Shift is permanent. Fixed-department employees are excluded and require HR approval for any shift change.
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(ROTATION_MAP).map(([from, to]) => {
              const count = rotationPreview.filter(r => r.currentShift === from).length
              return (
                <div key={from} className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">{from} → {to}</p>
                  <p className="text-2xl font-bold text-indigo-600">{count}</p>
                  <p className="text-xs text-gray-400">employees</p>
                </div>
              )
            })}
          </div>

          {/* Fixed dept + G shift note */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
              🔒 <span><strong>G Shift</strong> — permanent, not rotated.</span>
            </div>
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
              🏢 <span><strong>Fixed Departments</strong> ({FIXED_DEPARTMENTS.join(', ')}) — not auto-rotated. Shift changes require HR approval.</span>
            </div>
          </div>

          {/* Preview table */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Employee</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Department</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Current Shift</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">→ Next Shift</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">New Timings</th>
                </tr>
              </thead>
              <tbody>
                {rotationPreview.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                    No eligible employees for rotation
                  </td></tr>
                ) : rotationPreview.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{row.full_name}</p>
                      <p className="text-gray-400">{row.employee_code}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{row.department}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-gray-700">{row.currentShift} Shift</span>
                      <p className="text-gray-400">{SHIFTS[row.currentShift]?.shift_start} – {SHIFTS[row.currentShift]?.shift_end}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-indigo-600">{row.nextShift} Shift</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {SHIFTS[row.nextShift]?.shift_start} – {SHIFTS[row.nextShift]?.shift_end}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rotationPreview.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              {rotationPreview.length} employee{rotationPreview.length !== 1 ? 's' : ''} will be rotated.
              Paused and fixed-department employees are excluded.
            </p>
          )}

          <div className="flex justify-between items-center pt-1">
            <div className="flex gap-2">
              <button onClick={() => setRotationModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={downloadRotationFile} className="btn-secondary flex items-center gap-2 text-green-600 border-green-200 hover:bg-green-50">
                <Download size={14} /> Download Schedule
              </button>
            </div>
            <button
              onClick={handleRunRotation}
              disabled={rotationRunning || rotationPreview.length === 0}
              className="btn-primary flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
              <RotateCcw size={15} className={rotationRunning ? 'animate-spin' : ''} />
              {rotationRunning ? 'Rotating…' : `Apply Rotation (${rotationPreview.length} employees)`}
            </button>
          </div>
        </div>
      </Modal>
      {/* ── HR Approval / Rejection Confirmation Modal ── */}
      <Modal
        open={approvalModal.open}
        onClose={() => setApprovalModal({ open: false, request: null, mode: '' })}
        title={approvalModal.mode === 'approve' ? '✅ Approve Shift Change' : '❌ Reject Shift Change'}
        size="sm">
        {approvalModal.request && (
          <div className="space-y-4">

            {/* Request summary */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              <p className="text-gray-500">Employee shift change request:</p>
              <p className="text-lg font-bold text-gray-900">
                {approvalModal.request.old_shift} Shift → {approvalModal.request.new_shift} Shift
              </p>
              <p className="text-xs text-gray-400">
                Effective: {approvalModal.request.effective_date}
              </p>
              {approvalModal.request.reason && (
                <p className="text-xs text-gray-500 italic">"{approvalModal.request.reason}"</p>
              )}
              {approvalModal.request.dept_fixed && (
                <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                  🏢 Fixed department — special HR approval required
                </div>
              )}
            </div>

            {/* New shift details on approve */}
            {approvalModal.mode === 'approve' && SHIFTS[approvalModal.request.new_shift] && (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs text-green-800 space-y-1">
                <p className="font-semibold">New Shift Details — {approvalModal.request.new_shift} Shift</p>
                <p>✅ In-Time:  {SHIFTS[approvalModal.request.new_shift].in_window}</p>
                <p>✅ Out-Time: {SHIFTS[approvalModal.request.new_shift].out_window}</p>
                <p className="text-green-700 font-medium mt-1">
                  Approving will immediately update the employee's active shift.
                </p>
              </div>
            )}

            {/* Rejection reason input */}
            {approvalModal.mode === 'reject' && (
              <div>
                <label className="label">Reason for Rejection <span className="text-red-500">*</span></label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="e.g. Operational requirement, insufficient staffing on requested shift…"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setApprovalModal({ open: false, request: null, mode: '' })}
                className="btn-secondary">
                Cancel
              </button>
              {approvalModal.mode === 'approve' ? (
                <button
                  onClick={handleApproveShiftChange}
                  disabled={approvalSaving}
                  className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700">
                  <CheckCircle size={15} />
                  {approvalSaving ? 'Approving…' : 'Confirm Approval'}
                </button>
              ) : (
                <button
                  onClick={handleRejectShiftChange}
                  disabled={approvalSaving || !rejectionReason.trim()}
                  className="btn-primary flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40">
                  <XCircle size={15} />
                  {approvalSaving ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
