import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Clock, ShieldOff, Sun, Sunset, Moon, Coffee } from 'lucide-react';
import { attendanceAPI } from '../api';
import StatCard from '../components/StatCard';

const SkeletonCard = () => (
  <div style={{
    background: '#f0f0f0',
    borderRadius: '12px',
    height: '112px',
    animation: 'pulse 1.5s ease-in-out infinite',
  }} />
);

const SkeletonRow = () => (
  <div style={{
    background: '#f0f0f0',
    borderRadius: '10px',
    height: '72px',
    animation: 'pulse 1.5s ease-in-out infinite',
  }} />
);

// Shift metadata
const SHIFT_META = {
  A: { label: 'A Shift', time: '6:00 AM – 2:00 PM',  icon: Sun,    color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  B: { label: 'B Shift', time: '2:00 PM – 10:00 PM', icon: Sunset, color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#5b21b6' },
  C: { label: 'C Shift', time: '10:00 PM – 6:00 AM', icon: Moon,   color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  G: { label: 'G Shift', time: '9:00 AM – 5:30 PM',  icon: Coffee, color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
};

const DashboardPage = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError('Request timed out. The server may be unreachable.');
    }, 10000);

    attendanceAPI.todaySummary()
      .then(res => {
        clearTimeout(timeoutId);
        setSummary(res.data);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        const message = err?.response?.data?.message || err?.message || 'Failed to load dashboard data.';
        setError(message);
        setSummary({
          total_employees: 0, present: 0, absent: 0,
          total_ot_hours: 0, blocked_employees: 0,
          shift_wise: {},
        });
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => clearTimeout(timeoutId);
  }, []);

  // ── Percentage helpers ─────────────────────────────────────────────────────
  const total   = summary?.total_employees   ?? 0;
  const present = summary?.present           ?? 0;
  const absent  = summary?.absent            ?? 0;
  const blocked = summary?.blocked_employees ?? 0;

  const pct = (value, base = total) =>
    base > 0 ? `${((value / base) * 100).toFixed(1)}%` : '—';

  const coveredPct = total > 0
    ? `${(((present + absent) / total) * 100).toFixed(1)}% workforce logged`
    : '—';

  // ── Shift-wise data ────────────────────────────────────────────────────────
  // Expected shape from API: summary.shift_wise = { A: { total, present, absent }, B: {...}, ... }
  // Falls back to empty object gracefully if not yet supported by backend
  const shiftWise = summary?.shift_wise ?? {};

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Today's attendance overview</p>
      </div>

      {error && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px',
          padding: '12px 16px', marginBottom: '24px', color: '#856404', fontSize: '14px',
        }}>
          ⚠️ {error}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Summary Cards ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <StatCard title="Total Employees" value={total}   icon={Users}     color="blue"   subtitle={coveredPct} />
          <StatCard title="Present Today"   value={present} icon={UserCheck} color="green"  subtitle={`${pct(present)} of workforce`} />
          <StatCard title="Absent"          value={absent}  icon={UserX}     color="red"    subtitle={`${pct(absent)} of workforce`} />
          <StatCard title="Blocked"         value={blocked} icon={ShieldOff} color="orange" subtitle={`${pct(blocked)} of workforce`} />
          <StatCard
            title="OT Hours"
            value={summary?.total_ot_hours ?? 0}
            icon={Clock}
            color="yellow"
            subtitle={total > 0 ? `Avg ${((summary?.total_ot_hours ?? 0) / total).toFixed(1)} hrs/employee` : '—'}
          />
        </div>
      )}

      {/* ── Shift-wise Breakdown ── */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
            Shift-wise Attendance
          </h2>
          <span style={{
            fontSize: '11px', background: '#f3f4f6', color: '#6b7280',
            padding: '2px 8px', borderRadius: '999px', fontWeight: 500,
          }}>
            Today
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {Object.entries(SHIFT_META).map(([key, meta]) => {
              const data        = shiftWise[key] ?? { total: 0, present: 0, absent: 0 }
              const shiftTotal  = data.total   || 0
              const shiftPres   = data.present || 0
              const shiftAbs    = data.absent  || 0
              const presPct     = shiftTotal > 0 ? ((shiftPres / shiftTotal) * 100).toFixed(1) : 0
              const absPct      = shiftTotal > 0 ? ((shiftAbs  / shiftTotal) * 100).toFixed(1) : 0
              const Icon        = meta.icon

              return (
                <div key={key} style={{
                  background: meta.bg,
                  border: `1px solid ${meta.border}`,
                  borderRadius: '12px',
                  padding: '16px',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: meta.color + '22',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={16} color={meta.color} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: '600', fontSize: '14px', color: meta.text }}>{meta.label}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>{meta.time}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: meta.text, lineHeight: 1 }}>
                        {shiftTotal}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>total</p>
                    </div>
                  </div>

                  {/* Progress bar — present vs absent */}
                  <div style={{
                    height: '6px', borderRadius: '999px', background: '#e5e7eb',
                    overflow: 'hidden', marginBottom: '10px',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${presPct}%`,
                      background: meta.color,
                      borderRadius: '999px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {/* Present */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta.color }} />
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Present</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>{shiftPres}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: meta.color, fontWeight: 600 }}>{presPct}%</p>
                    </div>

                    {/* Divider */}
                    <div style={{ width: '1px', background: meta.border }} />

                    {/* Absent */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Absent</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>{shiftAbs}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>{absPct}%</p>
                    </div>

                    {/* Divider */}
                    <div style={{ width: '1px', background: meta.border }} />

                    {/* Attendance rate */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>Rate</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#111827' }}>
                        {presPct}%
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>attendance</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;

