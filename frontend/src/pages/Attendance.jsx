import { useState, useEffect, useCallback, useRef } from 'react'
import { attendanceAPI } from '../api'
import Modal from '../components/Modal'
import {
  Pencil, Download, Search, Calendar, Clock, Users,
  AlertTriangle, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  TrendingUp, Filter, RefreshCw, FileText, AlertCircle, UserX
} from 'lucide-react'
import { fmtDate, fmtTime, fmtHours, today, downloadCSV } from '../utils'
import toast from 'react-hot-toast'

// ── Shift definitions (Operation Biometric doc) ───────────────────────────────
const SHIFTS = {
  A: { label: 'Shift A', start: '06:00', end: '14:00', otStart: '14:00', otEnd: '16:00', inFrom: '05:45', inTo: '06:05', outFrom: '14:05', outTo: '14:25' },
  B: { label: 'Shift B', start: '14:00', end: '22:00', otStart: '12:00', otEnd: '14:00', inFrom: '13:45', inTo: '14:05', outFrom: '22:05', outTo: '22:25' },
  C: { label: 'Shift C', start: '22:00', end: '06:00', otStart: '20:00', otEnd: '22:00', inFrom: '21:45', inTo: '22:05', outFrom: '06:05', outTo: '06:25' },
  G: { label: 'General', start: '09:00', end: '17:30', otStart: '17:30', otEnd: '19:30', inFrom: '08:45', inTo: '09:05', outFrom: '17:35', outTo: '17:55' },
}

// OT limits (Operation Biometric doc)
const OT_LIMITS = { daily: 2, weekly: 4, monthly: 16 }

// Attendance code labels
const ATT_CODE = { '1': { label: 'Present', cls: 'bg-green-100 text-green-700 border border-green-200' }, '0': { label: 'Absent', cls: 'bg-red-100 text-red-700 border border-red-200' }, '6': { label: 'Leave', cls: 'bg-amber-100 text-amber-700 border border-amber-200' } }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const todayStr = today()

// ─────────────────────────────────────────────────────────────────────────────
export default function Attendance() {
  // ── Data ──
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [summary,    setSummary]    = useState(null)   // today's summary

  // ── View mode ──
  const [activeTab,  setActiveTab]  = useState('daily')   // daily | shiftwise | ot | monthly | alerts
  const [viewMode,   setViewMode]   = useState('daily')   // daily | weekly | monthly (for date nav)

  // ── Filters ──
  const [filters,    setFilters]    = useState({ date: todayStr, from: '', to: '', employee_id: '', shift: '', dept: '' })
  const [useRange,   setUseRange]   = useState(false)
  const [month,      setMonth]      = useState(new Date().getMonth())
  const [year,       setYear]       = useState(new Date().getFullYear())

  // ── OT modal ──
  const [otModal,    setOtModal]    = useState({ open: false, row: null })
  const [otForm,     setOtForm]     = useState({ manual_ot: '', ot_remarks: '', adjust_absent: false, absent_days: 0 })
  const [saving,     setSaving]     = useState(false)

  // ── Mark attendance modal ──
  const [markModal,  setMarkModal]  = useState({ open: false, row: null })
  const [markForm,   setMarkForm]   = useState({ att_code: '1', reason: '' })
  const [markSaving, setMarkSaving] = useState(false)

  const debounceRef = useRef(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (useRange && (!filters.from || !filters.to)) return
    setLoading(true)
    try {
      const params = useRange
        ? { from: filters.from, to: filters.to }
        : activeTab === 'monthly'
          ? { from: `${year}-${String(month+1).padStart(2,'0')}-01`, to: `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}` }
          : { date: filters.date }

      if (filters.employee_id) params.employee_id = filters.employee_id
      if (filters.shift)       params.shift       = filters.shift
      if (filters.dept)        params.department  = filters.dept

      const [attRes, sumRes] = await Promise.all([
        attendanceAPI.list({ ...params, limit: 500 }),
        attendanceAPI.getTodaySummary().catch(() => ({ data: null })),
      ])

      const records = Array.isArray(attRes.data) ? attRes.data : (attRes.data?.data || [])
      setRows(records)
      setSummary(sumRes.data?.data || sumRes.data || null)
    } catch (err) {
      toast.error('Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [filters, useRange, activeTab, month, year])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(load, 400)
    return () => clearTimeout(debounceRef.current)
  }, [load])

  // ── Computed stats ─────────────────────────────────────────────────────────
  const present  = rows.filter(r => r.att_code === '1' || (!r.att_code && r.check_in)).length
  const absent   = rows.filter(r => r.att_code === '0').length
  const onLeave  = rows.filter(r => r.att_code === '6').length
  const late     = rows.filter(r => r.is_late).length
  const missedPunch = rows.filter(r => r.check_in && !r.check_out).length
  const absentStreak = rows.filter(r => (r.consecutive_absents || 0) >= 8)  // ≥8 day rule

  // OT stats
  const totalOT     = rows.reduce((s, r) => s + (parseFloat(r.final_ot) || 0), 0)
  const otOverLimit = rows.filter(r => (parseFloat(r.final_ot) || 0) > OT_LIMITS.daily)

  // Shift-wise grouping
  const shiftGroups = {}
  Object.keys(SHIFTS).forEach(k => { shiftGroups[k] = [] })
  rows.forEach(r => {
    const s = r.shift || 'G'
    if (shiftGroups[s]) shiftGroups[s].push(r)
    else shiftGroups['G'].push(r)
  })

  // Gender-wise stats (for monthly tab)
  const genderStats = () => {
    const g = { Male: { present: 0, absent: 0, leave: 0 }, Female: { present: 0, absent: 0, leave: 0 }, Other: { present: 0, absent: 0, leave: 0 } }
    rows.forEach(r => {
      const gen = r.gender ? (r.gender.charAt(0).toUpperCase() + r.gender.slice(1)) : 'Other'
      const key = g[gen] ? gen : 'Other'
      if (r.att_code === '0') g[key].absent++
      else if (r.att_code === '6') g[key].leave++
      else g[key].present++
    })
    return g
  }

  // ── OT month-end adjustment logic (Scenario A/B) ──────────────────────────
  const calcOTAdjustment = (totalOTHours, absentCount) => {
    if (absentCount === 0) return { adjusted: totalOTHours, deducted: 0 }
    if (absentCount === 1 && (totalOTHours < 24 || totalOTHours - 8 < 16)) {
      return { adjusted: totalOTHours, deducted: 0, skipped: true }
    }
    const deducted = Math.min(absentCount * 8, totalOTHours)
    return { adjusted: Math.max(0, totalOTHours - deducted), deducted }
  }

  // ── OT carry-forward check ─────────────────────────────────────────────────
  const otCarryForward = (totalOT) => {
    const payable    = Math.min(totalOT, OT_LIMITS.monthly)
    const carryFwd   = Math.max(0, totalOT - OT_LIMITS.monthly)
    return { payable, carryFwd }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openOT = (row) => {
    setOtForm({ manual_ot: row.manual_ot ?? '', ot_remarks: row.ot_remarks ?? '', adjust_absent: false, absent_days: 0 })
    setOtModal({ open: true, row })
  }

  const saveOT = async (e) => {
    e.preventDefault()
    if (otForm.manual_ot && parseFloat(otForm.manual_ot) < 0) { toast.error('OT cannot be negative'); return }
    if (parseFloat(otForm.manual_ot) > OT_LIMITS.daily) {
      toast(`⚠️ Exceeds daily OT limit of ${OT_LIMITS.daily}h — saved anyway as HR override`)
    }
    setSaving(true)
    try {
      await attendanceAPI.updateOT({
        attendance_id: otModal.row.id,
        manual_ot:  otForm.manual_ot === '' ? null : parseFloat(otForm.manual_ot),
        ot_remarks: otForm.ot_remarks,
      })
      toast.success('OT updated')
      setOtModal({ open: false, row: null })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    } finally { setSaving(false) }
  }

  const openMark = (row) => {
    setMarkForm({ att_code: row.att_code || '1', reason: '' })
    setMarkModal({ open: true, row })
  }

  const saveMark = async (e) => {
    e.preventDefault()
    setMarkSaving(true)
    try {
      await attendanceAPI.updateOT({  // reuse PATCH endpoint — backend should handle att_code
        attendance_id: markModal.row.id,
        att_code:  markForm.att_code,
        ot_remarks: markForm.reason,
      })
      toast.success('Attendance updated')
      setMarkModal({ open: false, row: null })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed')
    } finally { setMarkSaving(false) }
  }

  // ── Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!rows.length) { toast('No records to export'); return }
    const filename = useRange
      ? `attendance_${filters.from}_to_${filters.to}.csv`
      : activeTab === 'monthly'
        ? `attendance_${MONTHS[month]}_${year}.csv`
        : `attendance_${filters.date}.csv`
    downloadCSV(rows.map(r => ({
      Date:         fmtDate(r.attendance_date),
      Employee:     r.full_name,
      Code:         r.employee_code,
      Department:   r.department,
      Shift:        SHIFTS[r.shift]?.label || r.shift || 'G',
      'Att. Code':  r.att_code || '1',
      Status:       ATT_CODE[r.att_code || '1']?.label || 'Present',
      'Check In':   fmtTime(r.check_in),
      'Check Out':  fmtTime(r.check_out),
      'Total Hours': r.total_hours ?? '',
      Late:         r.is_late ? `Yes (${r.late_by_minutes}m)` : 'No',
      'Missed Punch': (!r.check_in || !r.check_out) ? 'Yes' : 'No',
      'System OT':  r.system_ot ?? 0,
      'Manual OT':  r.manual_ot ?? '',
      'Final OT':   r.final_ot ?? 0,
      'OT Remarks': r.ot_remarks ?? '',
      'Consec. Absents': r.consecutive_absents ?? 0,
    })), filename)
    toast.success('CSV exported')
  }

  // ── Shared table row renderer ──────────────────────────────────────────────
  const AttRow = ({ row }) => {
    const shift    = SHIFTS[row.shift] || SHIFTS.G
    const attCode  = row.att_code || (row.check_in ? '1' : '0')
    const codeMeta = ATT_CODE[attCode] || ATT_CODE['1']
    const hasMissedPunch = row.check_in && !row.check_out
    const isStreak = (row.consecutive_absents || 0) >= 8
    return (
      <tr className={`table-row ${isStreak ? 'bg-red-50' : ''}`}>
        <td className="table-cell">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(row.full_name || '?')[0]}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-xs">{row.full_name}</p>
              <p className="text-xs text-gray-400">{row.employee_code}</p>
            </div>
          </div>
        </td>
        <td className="table-cell text-xs text-gray-600">{fmtDate(row.attendance_date)}</td>
        <td className="table-cell">
          <span className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
            {row.shift || 'G'}
          </span>
          <p className="text-xs text-gray-400 mt-0.5">{shift.start}–{shift.end}</p>
        </td>
        <td className="table-cell">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${codeMeta.cls}`}>
            {codeMeta.label}
          </span>
          {isStreak && <p className="text-xs text-red-500 mt-0.5">⚠ {row.consecutive_absents}d streak</p>}
        </td>
        <td className="table-cell">
          <span className={hasMissedPunch ? 'text-red-500 font-medium text-xs' : 'text-xs text-gray-600'}>
            {fmtTime(row.check_in) || '—'}
          </span>
          {row.is_late && <span className="ml-1 text-xs text-amber-600">(Late {row.late_by_minutes}m)</span>}
        </td>
        <td className="table-cell">
          {hasMissedPunch
            ? <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle size={11} /> Missing</span>
            : <span className="text-xs text-gray-600">{fmtTime(row.check_out) || '—'}</span>}
        </td>
        <td className="table-cell text-xs text-gray-600">{fmtHours(row.total_hours)}</td>
        <td className="table-cell">
          <span className={`font-medium text-xs ${row.final_ot != null && parseFloat(row.final_ot) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
            {fmtHours(row.final_ot)}
          </span>
          {row.manual_ot != null && <span className="ml-1 text-xs bg-blue-50 text-blue-600 px-1 rounded">Manual</span>}
          {parseFloat(row.final_ot) > OT_LIMITS.daily && <span className="ml-1 text-xs text-orange-500">⚠ Over limit</span>}
        </td>
        <td className="table-cell">
          <div className="flex gap-1">
            <button onClick={() => openMark(row)} title="Mark Attendance"
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
              <CheckCircle size={14} />
            </button>
            <button onClick={() => openOT(row)} title="Edit OT"
              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
              <Pencil size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const TableHead = () => (
    <thead className="bg-gray-50 border-b border-gray-100">
      <tr>
        <th className="table-header">Employee</th>
        <th className="table-header">Date</th>
        <th className="table-header">Shift</th>
        <th className="table-header">Status</th>
        <th className="table-header">Check In</th>
        <th className="table-header">Check Out</th>
        <th className="table-header">Hours</th>
        <th className="table-header">Final OT</th>
        <th className="table-header">Actions</th>
      </tr>
    </thead>
  )

  const gStats = genderStats()

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={22} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          {missedPunch > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {missedPunch} missed punch
            </span>
          )}
          {absentStreak.length > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {absentStreak.length} ≥8d absent
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-green-600 border-green-200 hover:bg-green-50">
            <Download size={15} /> Export CSV
          </button>
          <button onClick={load} className="btn-secondary flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: 'Present',      value: present,          color: 'green',  icon: CheckCircle   },
          { label: 'Absent',       value: absent,           color: 'red',    icon: XCircle       },
          { label: 'On Leave',     value: onLeave,          color: 'amber',  icon: FileText      },
          { label: 'Late Entry',   value: late,             color: 'yellow', icon: Clock         },
          { label: 'Missed Punch', value: missedPunch,      color: 'orange', icon: AlertTriangle },
          { label: 'Total OT hrs', value: totalOT.toFixed(1), color: 'blue', icon: TrendingUp    },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-${color}-100`}>
                <Icon size={13} className={`text-${color}-600`} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* OT Limits Banner */}
      <div className="card p-3 flex items-center gap-6 flex-wrap text-xs">
        <p className="font-semibold text-gray-600 flex items-center gap-1"><Clock size={13} /> OT Limits:</p>
        {[
          { label: 'Daily max', val: `${OT_LIMITS.daily}h` },
          { label: 'Weekly max', val: `${OT_LIMITS.weekly}h` },
          { label: 'Monthly max', val: `${OT_LIMITS.monthly}h` },
        ].map(({ label, val }) => (
          <span key={label} className="flex items-center gap-1 text-gray-500">
            {label}: <strong className="text-gray-800">{val}</strong>
          </span>
        ))}
        {otOverLimit.length > 0 && (
          <span className="text-orange-600 font-semibold flex items-center gap-1">
            <AlertCircle size={13} /> {otOverLimit.length} employee(s) exceed daily OT limit
          </span>
        )}
        <span className="text-gray-400 ml-auto">Valid OT windows per shift — A: 2–4 PM | B: 12–2 PM | C: 8–10 PM | G: 5:30–7:30 PM</span>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {[
          { key: 'daily',     label: 'Daily',         icon: Calendar   },
          { key: 'shiftwise', label: 'Shift-wise',    icon: Users      },
          { key: 'ot',        label: 'OT Summary',    icon: TrendingUp },
          { key: 'monthly',   label: 'Monthly',       icon: FileText   },
          { key: 'alerts',    label: 'Alerts',        icon: AlertTriangle, badge: missedPunch + absentStreak.length },
        ].map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
              activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} /> {label}
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-3 flex-wrap items-center">
        {activeTab === 'monthly' ? (
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => { if (month===0){setMonth(11);setYear(y=>y-1)} else setMonth(m=>m-1) }}
              className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={15}/></button>
            <span className="text-sm font-semibold text-gray-700 w-32 text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => { if (month===11){setMonth(0);setYear(y=>y+1)} else setMonth(m=>m+1) }}
              className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={15}/></button>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={useRange} onChange={e => setUseRange(e.target.checked)} />
              Date range
            </label>
            {!useRange ? (
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                <button onClick={() => { const d=new Date(filters.date); d.setDate(d.getDate()-1); setFilters(p=>({...p, date: d.toISOString().slice(0,10)})) }}
                  className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={15}/></button>
                <input type="date" value={filters.date}
                  onChange={e => setFilters(p => ({ ...p, date: e.target.value }))}
                  className="text-sm font-semibold text-gray-700 border-0 outline-none bg-transparent" />
                <button onClick={() => { const d=new Date(filters.date); d.setDate(d.getDate()+1); setFilters(p=>({...p, date: d.toISOString().slice(0,10)})) }}
                  className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={15}/></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="date" className="input w-44" value={filters.from}
                  onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
                <input type="date" className="input w-44" value={filters.to}
                  onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
              </div>
            )}
          </>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-48" placeholder="Search employee…"
            value={filters.employee_id}
            onChange={e => setFilters(p => ({ ...p, employee_id: e.target.value }))} />
        </div>

        <select className="input w-36" value={filters.shift}
          onChange={e => setFilters(p => ({ ...p, shift: e.target.value }))}>
          <option value="">All Shifts</option>
          {Object.entries(SHIFTS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <select className="input w-36" value={filters.dept}
          onChange={e => setFilters(p => ({ ...p, dept: e.target.value }))}>
          <option value="">All Depts</option>
          {[...new Set(rows.map(r=>r.department).filter(Boolean))].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB — DAILY
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'daily' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">{rows.length} records</span>
            <div className="flex gap-3 text-xs">
              <span className="text-green-600">✓ Present: {present}</span>
              <span className="text-red-500">✗ Absent: {absent}</span>
              <span className="text-amber-600">◷ Leave: {onLeave}</span>
              <span className="text-orange-500">⚠ Missed punch: {missedPunch}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead />
              <tbody>
                {loading ? (
                  [...Array(5)].map((_,i) => (
                    <tr key={i}><td colSpan={9} className="table-cell">
                      <div className="h-5 bg-gray-100 rounded animate-pulse" /></td></tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-12">
                    No records for selected date
                  </td></tr>
                ) : rows.map(row => <AttRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — SHIFT-WISE
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'shiftwise' && (
        <div className="space-y-4">
          {Object.entries(SHIFTS).map(([key, shift]) => {
            const sRows = shiftGroups[key] || []
            const sPresent = sRows.filter(r => r.att_code !== '0' && r.att_code !== '6').length
            const sAbsent  = sRows.filter(r => r.att_code === '0').length
            const sLate    = sRows.filter(r => r.is_late).length
            const sMissed  = sRows.filter(r => r.check_in && !r.check_out).length
            const sOT      = sRows.reduce((s,r) => s + (parseFloat(r.final_ot)||0), 0)
            return (
              <div key={key} className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700">{key}</span>
                    <div>
                      <p className="font-bold text-gray-800">{shift.label}</p>
                      <p className="text-xs text-gray-400">{shift.start} – {shift.end} &nbsp;|&nbsp; OT window: {shift.otStart} – {shift.otEnd}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs font-medium flex-wrap">
                    <span className="text-gray-600">Total: <strong>{sRows.length}</strong></span>
                    <span className="text-green-600">Present: {sPresent}</span>
                    <span className="text-red-500">Absent: {sAbsent}</span>
                    <span className="text-amber-600">Late: {sLate}</span>
                    {sMissed > 0 && <span className="text-red-500">⚠ Missed punch: {sMissed}</span>}
                    <span className="text-blue-600">OT: {sOT.toFixed(1)}h</span>
                  </div>
                </div>
                {sRows.length === 0 ? (
                  <p className="text-xs text-gray-400 italic px-5 py-4">No records for this shift today</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <TableHead />
                      <tbody>{sRows.map(row => <AttRow key={row.id} row={row} />)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — OT SUMMARY
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ot' && (
        <div className="space-y-4">
          {/* OT carry-forward calculator */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" /> Month-End OT Summary
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                const totalAbsent = absent
                const adj = calcOTAdjustment(totalOT, totalAbsent)
                const carry = otCarryForward(adj.adjusted)
                return [
                  { label: 'Raw OT Hours',     value: totalOT.toFixed(1),       color: 'blue'   },
                  { label: 'Absent Deduction',  value: `-${adj.deducted.toFixed(1)}h`, color: 'red'    },
                  { label: 'Payable OT',        value: `${carry.payable.toFixed(1)}h`, color: 'green'  },
                  { label: 'Carry Forward',     value: `${carry.carryFwd.toFixed(1)}h`, color: 'purple' },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`rounded-lg p-3 bg-${color}-50 border border-${color}-100`}>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <p className={`text-xl font-bold text-${color}-700 mt-1`}>{value}</p>
                  </div>
                ))
              })()}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Scenario A: absents deducted at 8h/day · Scenario B: 1-day absent exception applied if OT &lt; 24h or result &lt; 16h · Carry-forward after {OT_LIMITS.monthly}h monthly cap
            </p>
          </div>

          {/* OT per employee table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Employee OT Detail</p>
              <span className="text-xs text-gray-400">Daily limit: {OT_LIMITS.daily}h · Weekly: {OT_LIMITS.weekly}h · Monthly: {OT_LIMITS.monthly}h</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="table-header">Employee</th>
                    <th className="table-header">Shift</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Check In</th>
                    <th className="table-header">Check Out</th>
                    <th className="table-header">Total Hours</th>
                    <th className="table-header">System OT</th>
                    <th className="table-header">Manual OT</th>
                    <th className="table-header">Final OT</th>
                    <th className="table-header">OT Window Valid</th>
                    <th className="table-header">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(4)].map((_,i) => (
                      <tr key={i}><td colSpan={11} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>
                    ))
                  ) : rows.filter(r => (parseFloat(r.system_ot)||0) > 0 || (parseFloat(r.manual_ot)||0) > 0 || (parseFloat(r.final_ot)||0) > 0).length === 0 ? (
                    <tr><td colSpan={11} className="table-cell text-center text-gray-400 py-10">No OT records for this period</td></tr>
                  ) : rows
                      .filter(r => (parseFloat(r.final_ot)||0) > 0 || (parseFloat(r.system_ot)||0) > 0)
                      .map(row => {
                        const shift  = SHIFTS[row.shift] || SHIFTS.G
                        const finalOT = parseFloat(row.final_ot) || 0
                        const overLimit = finalOT > OT_LIMITS.daily
                        const missedPunchRow = row.check_in && !row.check_out
                        return (
                          <tr key={row.id} className={`table-row ${overLimit ? 'bg-orange-50' : ''}`}>
                            <td className="table-cell">
                              <p className="font-medium text-xs">{row.full_name}</p>
                              <p className="text-xs text-gray-400">{row.employee_code}</p>
                            </td>
                            <td className="table-cell">
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{row.shift || 'G'}</span>
                              <p className="text-xs text-gray-400 mt-0.5">{shift.otStart}–{shift.otEnd}</p>
                            </td>
                            <td className="table-cell text-xs text-gray-600">{fmtDate(row.attendance_date)}</td>
                            <td className="table-cell text-xs">{fmtTime(row.check_in) || '—'}</td>
                            <td className="table-cell text-xs">
                              {missedPunchRow
                                ? <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={11}/>Missing</span>
                                : fmtTime(row.check_out) || '—'}
                            </td>
                            <td className="table-cell text-xs">{fmtHours(row.total_hours)}</td>
                            <td className="table-cell text-xs text-gray-600">{fmtHours(row.system_ot)}</td>
                            <td className="table-cell text-xs">
                              {row.manual_ot != null
                                ? <span className="text-blue-600 font-medium">{fmtHours(row.manual_ot)}</span>
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="table-cell">
                              <span className={`font-semibold text-xs ${overLimit ? 'text-orange-600' : 'text-blue-600'}`}>
                                {fmtHours(row.final_ot)}
                              </span>
                              {overLimit && <span className="ml-1 text-xs text-orange-500">⚠ Over {OT_LIMITS.daily}h</span>}
                              {missedPunchRow && <p className="text-xs text-red-400">No auto-OT (missed punch)</p>}
                            </td>
                            <td className="table-cell">
                              {missedPunchRow
                                ? <span className="text-xs text-red-400">HR verify needed</span>
                                : <span className="text-xs text-green-600">✓ Valid</span>}
                            </td>
                            <td className="table-cell">
                              <button onClick={() => openOT(row)}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                                <Pencil size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — MONTHLY SUMMARY
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'monthly' && (
        <div className="space-y-4">
          {/* Gender-wise leave/absent summary */}
          <div className="card p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Users size={15} className="text-blue-500" />
              Gender-wise Leave / Absent Summary
              <span className="text-xs text-gray-400 font-normal">({MONTHS[month]} {year})</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(gStats).map(([gender, s]) => {
                const total = s.present + s.absent + s.leave
                const absLeave = s.absent + s.leave
                return (
                  <div key={gender} className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 font-medium mb-1">{gender}</p>
                    <p className="text-lg font-bold text-gray-800">{total}</p>
                    <div className="flex justify-center gap-2 mt-1 text-xs flex-wrap">
                      <span className="text-green-600">P: {s.present} ({total ? ((s.present/total)*100).toFixed(0) : 0}%)</span>
                      <span className="text-amber-600">L: {s.leave} ({total ? ((s.leave/total)*100).toFixed(0) : 0}%)</span>
                      <span className="text-red-500">A: {s.absent} ({total ? ((s.absent/total)*100).toFixed(0) : 0}%)</span>
                    </div>
                    {absLeave > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        {((absLeave/Math.max(total,1))*100).toFixed(0)}% absent/leave total
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Monthly table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{MONTHS[month]} {year} — All Records</p>
              <span className="text-xs text-gray-400">{rows.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <TableHead />
                <tbody>
                  {loading ? (
                    [...Array(5)].map((_,i) => (
                      <tr key={i}><td colSpan={9} className="table-cell">
                        <div className="h-4 bg-gray-100 rounded animate-pulse"/></td></tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-12">
                      No records for {MONTHS[month]} {year}
                    </td></tr>
                  ) : rows.map(row => <AttRow key={row.id} row={row} />)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB — ALERTS
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">

          {/* Missed punch alert */}
          {rows.filter(r => r.check_in && !r.check_out).length > 0 && (
            <div className="card p-0 overflow-hidden border-l-4 border-red-500">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-600" />
                <p className="text-sm font-semibold text-red-700">Missed Punch-Out ({rows.filter(r=>r.check_in&&!r.check_out).length})</p>
                <p className="text-xs text-red-500 ml-2">System OT auto-blocked — HR approval required</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header">Employee</th>
                      <th className="table-header">Date</th>
                      <th className="table-header">Shift</th>
                      <th className="table-header">Check In</th>
                      <th className="table-header">Check Out</th>
                      <th className="table-header">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => r.check_in && !r.check_out).map(row => (
                      <tr key={row.id} className="table-row bg-red-50">
                        <td className="table-cell">
                          <p className="font-medium text-xs">{row.full_name}</p>
                          <p className="text-xs text-gray-400">{row.employee_code}</p>
                        </td>
                        <td className="table-cell text-xs">{fmtDate(row.attendance_date)}</td>
                        <td className="table-cell text-xs">{row.shift || 'G'}</td>
                        <td className="table-cell text-xs">{fmtTime(row.check_in)}</td>
                        <td className="table-cell text-xs text-red-500 font-medium">Missing ⚠</td>
                        <td className="table-cell">
                          <button onClick={() => openOT(row)}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs">
                            <Pencil size={11}/> HR Correct
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8-day continuous absence alert */}
          {absentStreak.length > 0 && (
            <div className="card p-0 overflow-hidden border-l-4 border-orange-500">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                <UserX size={15} className="text-orange-600" />
                <p className="text-sm font-semibold text-orange-700">≥8 Day Absence Streak ({absentStreak.length})</p>
                <p className="text-xs text-orange-500 ml-2">Biometric access should be blocked — HR re-activation required</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header">Employee</th>
                      <th className="table-header">Dept</th>
                      <th className="table-header">Shift</th>
                      <th className="table-header">Consecutive Absents</th>
                      <th className="table-header">Action Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absentStreak.map(row => (
                      <tr key={row.id} className="table-row bg-orange-50">
                        <td className="table-cell">
                          <p className="font-medium text-xs">{row.full_name}</p>
                          <p className="text-xs text-gray-400">{row.employee_code}</p>
                        </td>
                        <td className="table-cell text-xs text-gray-500">{row.department || '—'}</td>
                        <td className="table-cell text-xs">{row.shift || 'G'}</td>
                        <td className="table-cell">
                          <span className="text-orange-700 font-bold text-sm">{row.consecutive_absents} days</span>
                        </td>
                        <td className="table-cell">
                          <span className="text-xs text-orange-600 font-medium">Block access + HR approval to re-enable</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Late entry register */}
          {rows.filter(r=>r.is_late).length > 0 && (
            <div className="card p-0 overflow-hidden border-l-4 border-yellow-400">
              <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
                <Clock size={15} className="text-yellow-600" />
                <p className="text-sm font-semibold text-yellow-700">Late Entry Register ({rows.filter(r=>r.is_late).length})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="table-header">Employee</th>
                      <th className="table-header">Shift</th>
                      <th className="table-header">Expected In</th>
                      <th className="table-header">Actual In</th>
                      <th className="table-header">Late By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r=>r.is_late).map(row => {
                      const shift = SHIFTS[row.shift] || SHIFTS.G
                      return (
                        <tr key={row.id} className="table-row">
                          <td className="table-cell">
                            <p className="font-medium text-xs">{row.full_name}</p>
                            <p className="text-xs text-gray-400">{row.employee_code}</p>
                          </td>
                          <td className="table-cell text-xs">{row.shift || 'G'}</td>
                          <td className="table-cell text-xs text-gray-500">{shift.inTo} (latest allowed)</td>
                          <td className="table-cell text-xs text-amber-600 font-medium">{fmtTime(row.check_in)}</td>
                          <td className="table-cell">
                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              {row.late_by_minutes}m
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missedPunch === 0 && absentStreak.length === 0 && rows.filter(r=>r.is_late).length === 0 && (
            <div className="card p-8 text-center text-gray-400">
              <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
              <p className="font-medium">No alerts for this period</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — Edit OT (HR Override)
      ════════════════════════════════════════════════════════════════════ */}
      <Modal open={otModal.open} onClose={() => setOtModal({ open: false, row: null })}
        title="Edit Overtime — HR Override" size="md">
        {otModal.row && (
          <form onSubmit={saveOT} className="space-y-4">
            {/* Employee summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-800">{otModal.row.full_name}</p>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                  {SHIFTS[otModal.row.shift]?.label || 'General'}
                </span>
              </div>
              <p className="text-xs text-gray-500">{fmtDate(otModal.row.attendance_date)}</p>
              <div className="flex gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                <span>Hours: <strong className="text-gray-700">{fmtHours(otModal.row.total_hours)}</strong></span>
                <span>System OT: <strong className="text-gray-700">{fmtHours(otModal.row.system_ot)}</strong></span>
                <span>Current Final OT: <strong className="text-blue-600">{fmtHours(otModal.row.final_ot)}</strong></span>
              </div>
              {/* OT window info */}
              {(() => {
                const sh = SHIFTS[otModal.row.shift] || SHIFTS.G
                return (
                  <p className="text-xs text-gray-400 mt-1">
                    Valid OT window: <strong>{sh.otStart} – {sh.otEnd}</strong> &nbsp;|&nbsp;
                    Daily limit: <strong>{OT_LIMITS.daily}h</strong>
                  </p>
                )
              })()}
              {otModal.row.check_in && !otModal.row.check_out && (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-1">
                  <AlertTriangle size={11} /> Missed punch-out — OT must be manually verified
                </p>
              )}
            </div>

            {/* Manual OT input */}
            <div>
              <label className="label">Manual OT Hours (max {OT_LIMITS.daily}h/day)</label>
              <input className="input" type="number" step="0.25" min="0" max="24"
                placeholder="Leave blank to use system OT"
                value={otForm.manual_ot}
                onChange={e => setOtForm(p => ({ ...p, manual_ot: e.target.value }))} />
              {parseFloat(otForm.manual_ot) > OT_LIMITS.daily && (
                <p className="text-xs text-orange-500 mt-1">⚠ Exceeds daily limit of {OT_LIMITS.daily}h — HR override will be logged</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Leave blank to revert to system-calculated OT</p>
            </div>

            {/* Absent adjustment */}
            <div className="bg-amber-50 rounded-lg p-3 space-y-2 border border-amber-200">
              <p className="text-xs font-semibold text-amber-700">Month-end Absent Adjustment (Scenario A)</p>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={otForm.adjust_absent}
                  onChange={e => setOtForm(p => ({ ...p, adjust_absent: e.target.checked }))} />
                Deduct OT for absent days (8h per absent day)
              </label>
              {otForm.adjust_absent && (
                <div>
                  <label className="label text-xs">Number of absent days to offset</label>
                  <input className="input w-24" type="number" min="0" max="31"
                    value={otForm.absent_days}
                    onChange={e => setOtForm(p => ({ ...p, absent_days: parseInt(e.target.value)||0 }))} />
                  {(() => {
                    const adj = calcOTAdjustment(parseFloat(otForm.manual_ot)||parseFloat(otModal.row.final_ot)||0, otForm.absent_days)
                    return (
                      <p className="text-xs text-amber-700 mt-1">
                        {adj.skipped
                          ? '✓ 1-day exception applied — no deduction'
                          : `Adjusted OT: ${adj.adjusted.toFixed(2)}h (deducted ${adj.deducted.toFixed(2)}h)`}
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>

            <div>
              <label className="label">Remarks</label>
              <textarea className="input resize-none" rows={2} placeholder="Reason for adjustment…"
                value={otForm.ot_remarks}
                onChange={e => setOtForm(p => ({ ...p, ot_remarks: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className="btn-secondary"
                onClick={() => setOtModal({ open: false, row: null })}>Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save OT'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL — Mark Attendance (HR Manual Override)
      ════════════════════════════════════════════════════════════════════ */}
      <Modal open={markModal.open} onClose={() => setMarkModal({ open: false, row: null })}
        title="Mark Attendance — HR Override" size="sm">
        {markModal.row && (
          <form onSubmit={saveMark} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-bold text-gray-800">{markModal.row.full_name}</p>
              <p className="text-xs text-gray-500">{fmtDate(markModal.row.attendance_date)} · {SHIFTS[markModal.row.shift]?.label || 'General'}</p>
            </div>

            <div>
              <label className="label">Mark as *</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: '1', label: 'Present',      sub: 'Full 8h / permission',   cls: 'border-green-400 bg-green-50 text-green-700' },
                  { code: '6', label: 'Leave',         sub: 'With permission (code 6)', cls: 'border-amber-400 bg-amber-50 text-amber-700' },
                  { code: '0', label: 'Absent',        sub: 'Without permission (code 0)', cls: 'border-red-400 bg-red-50 text-red-700' },
                ].map(({ code, label, sub, cls }) => (
                  <button type="button" key={code}
                    onClick={() => setMarkForm(p => ({ ...p, att_code: code }))}
                    className={`px-2 py-2 rounded-lg border-2 text-center text-xs transition-all ${
                      markForm.att_code === code ? cls : 'border-gray-200 bg-white text-gray-500'
                    }`}>
                    <p className="font-bold">{label}</p>
                    <p className="opacity-70 mt-0.5 leading-tight">{sub}</p>
                  </button>
                ))}
              </div>
              {markForm.att_code === '1' && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Early-going with permission → mark Present (full 8h per policy)
                </p>
              )}
            </div>

            <div>
              <label className="label">Reason / Notes</label>
              <textarea className="input resize-none" rows={2}
                placeholder="Medical emergency, permission granted, etc."
                value={markForm.reason}
                onChange={e => setMarkForm(p => ({ ...p, reason: e.target.value }))} />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className="btn-secondary"
                onClick={() => setMarkModal({ open: false, row: null })}>Cancel</button>
              <button type="submit" disabled={markSaving} className="btn-primary">
                {markSaving ? 'Saving…' : 'Confirm Mark'}
              </button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  )
}
