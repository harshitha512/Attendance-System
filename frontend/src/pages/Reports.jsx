import { useState, useEffect, useCallback } from 'react'
import { reportAPI } from '../api'
import { fmtDate, fmtHours, downloadCSV } from '../utils'
import { Download, FileBarChart2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function Reports() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [department, setDepartment] = useState('')
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  // ✅ LOAD DATA
  const load = useCallback(async () => {
    setLoading(true)

    try {
      const params = {
        from_date: fromDate,
        to_date: toDate,
        department,
        search,
      }

      const res = await reportAPI.get(params)
      setRows(res.data?.data || [])

    } catch (err) {
      console.error(err)
      toast.error('Failed to load report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, department, search])

  useEffect(() => {
    load()
  }, [load])

  // ✅ SUMMARY
  const summary = {
    totalPresent: rows.length,
    totalHours: rows.reduce((s, r) => s + Number(r.total_hours || 0), 0).toFixed(2),
    totalOT: rows.reduce((s, r) => s + Number(r.final_ot || 0), 0).toFixed(2),
    lateCount: rows.filter(r => r.is_late).length,
  }

  // ✅ EXPORT
  const handleExport = () => {
    if (!rows.length) return toast.error('No data to export')

    downloadCSV(
      rows.map(r => ({
        Date: fmtDate(r.attendance_date),
        Employee: r.full_name,
        Code: r.employee_code,
        Department: r.department,
        'Check In': r.check_in,
        'Check Out': r.check_out,
        Hours: r.total_hours,
        Late: r.is_late ? 'Yes' : 'No',
        OT: r.final_ot,
      })),
      `report_${fromDate}_to_${toDate}.csv`
    )
  }

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="flex justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileBarChart2 size={22} />
          <h1 className="text-2xl font-bold">Advanced Reports</h1>
        </div>

        <button onClick={handleExport} className="btn-secondary btn-sm">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* FILTERS */}
      <div className="card p-4 grid md:grid-cols-4 gap-4">

        {/* DATE RANGE */}
        <div>
          <label className="text-xs text-gray-500">From Date</label>
          <input type="date" className="input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-gray-500">To Date</label>
          <input type="date" className="input" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>

        {/* DEPARTMENT */}
        <div>
          <label className="text-xs text-gray-500">Department</label>
          <select className="input" value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All</option>
            <option value="HR">HR</option>
            <option value="IT">IT</option>
            <option value="Production">Production</option>
          </select>
        </div>

        {/* SEARCH */}
        <div>
          <label className="text-xs text-gray-500">Search</label>
          <input
            type="text"
            className="input"
            placeholder="Name or Code"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-xl font-bold">{summary.totalPresent}</p>
          <p className="text-xs text-gray-500">Present</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold">{summary.totalHours}h</p>
          <p className="text-xs text-gray-500">Hours</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold">{summary.totalOT}h</p>
          <p className="text-xs text-gray-500">OT</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold">{summary.lateCount}</p>
          <p className="text-xs text-gray-500">Late</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="card overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Dept</th>
              <th>In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Late</th>
              <th>OT</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan="8">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8">No data</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r.attendance_date)}</td>
                <td>{r.full_name}</td>
                <td>{r.department}</td>
                <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString() : '-'}</td>
                <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString() : '-'}</td>
                <td>{fmtHours(r.total_hours)}</td>
                <td>{r.is_late ? 'Yes' : 'No'}</td>
                <td>{fmtHours(r.final_ot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}