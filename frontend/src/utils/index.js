import { format, parseISO } from 'date-fns'

export const fmtDate = (d) => d ? format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy') : '—'
export const fmtTime = (d) => d ? format(typeof d === 'string' ? parseISO(d) : d, 'hh:mm a') : '—'
export const fmtDateTime = (d) => d ? format(typeof d === 'string' ? parseISO(d) : d, 'dd MMM yyyy hh:mm a') : '—'
export const fmtHours = (h) => h != null ? `${parseFloat(h).toFixed(2)}h` : '—'

export const downloadCSV = (rows, filename) => {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const today = () => format(new Date(), 'yyyy-MM-dd')
export const currentMonth = () => format(new Date(), 'yyyy-MM')
