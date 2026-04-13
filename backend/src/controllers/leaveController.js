const pool = require('../config/db');
const { createAuditLog } = require('../utils/audit');

// ── GET /leaves ───────────────────────────────────────────────────────────────
const getLeaves = async (req, res, next) => {
  try {
    const { year, month, status, type, shift } = req.query;
    const params = [];
    const conditions = [];

    // FIX: replaced broken arithmetic SQL with simple date range overlap
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay    = new Date(y, m, 0).getDate();
      const monthEnd   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      params.push(monthStart); // $1
      params.push(monthEnd);   // $2
      // Leave overlaps month if it starts on/before month-end AND ends on/after month-start
      conditions.push(`l.from_date <= $${params.length} AND l.to_date >= $${params.length - 1}`);
    } else if (year) {
      params.push(parseInt(year));
      conditions.push(`EXTRACT(YEAR FROM l.from_date) = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`l.leave_type = $${params.length}`);
    }
    if (shift) {
      params.push(shift);
      conditions.push(`l.shift = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(
      `SELECT l.*,
        e.full_name, e.employee_code, e.department
       FROM leaves l
       LEFT JOIN employees e ON e.id = l.employee_id
       ${where}
       ORDER BY l.from_date DESC`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// ── POST /leaves ──────────────────────────────────────────────────────────────
const createLeave = async (req, res, next) => {
  try {
    const {
      employee_id, leave_type, shift,
      from_date, to_date, days,
      reason, status, attendance_code, requested_at,
    } = req.body;

    if (!employee_id || !leave_type || !from_date || !to_date) {
      return res.status(400).json({ success: false, message: 'employee_id, leave_type, from_date, to_date are required' });
    }

    const result = await pool.query(
      `INSERT INTO leaves
        (employee_id, leave_type, shift, from_date, to_date, days, reason,
         status, attendance_code, requested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        employee_id, leave_type, shift || 'G',
        from_date, to_date, days || 1,
        reason || null,
        status || 'pending',
        attendance_code || '6',
        requested_at || new Date().toISOString(),
      ]
    );

    await createAuditLog({
      adminId: req.adminId, action: 'CREATE_LEAVE',
      tableName: 'leaves', recordId: result.rows[0].id,
      newValues: result.rows[0], ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// ── PATCH /leaves/:id ─────────────────────────────────────────────────────────
const updateLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM leaves WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Leave not found' });

    const prev = existing.rows[0];
    const {
      status, approved_at, rejected_at, rejection_reason,
      leave_type, shift, from_date, to_date, days, reason, attendance_code,
    } = req.body;

    const result = await pool.query(
      `UPDATE leaves SET
        status           = COALESCE($1,  status),
        approved_at      = COALESCE($2,  approved_at),
        rejected_at      = COALESCE($3,  rejected_at),
        rejection_reason = COALESCE($4,  rejection_reason),
        leave_type       = COALESCE($5,  leave_type),
        shift            = COALESCE($6,  shift),
        from_date        = COALESCE($7,  from_date),
        to_date          = COALESCE($8,  to_date),
        days             = COALESCE($9,  days),
        reason           = COALESCE($10, reason),
        attendance_code  = COALESCE($11, attendance_code),
        updated_at       = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        status        || null,
        approved_at   || null,
        rejected_at   || null,
        rejection_reason || null,
        leave_type    || null,
        shift         || null,
        from_date     || null,
        to_date       || null,
        days          || null,
        reason        || null,
        attendance_code || null,
        id,
      ]
    );

    await createAuditLog({
      adminId: req.adminId, action: 'UPDATE_LEAVE',
      tableName: 'leaves', recordId: id,
      oldValues: prev, newValues: result.rows[0], ipAddress: req.ip,
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// ── DELETE /leaves/:id ────────────────────────────────────────────────────────
const deleteLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM leaves WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Leave not found' });

    await pool.query('DELETE FROM leaves WHERE id = $1', [id]);
    await createAuditLog({
      adminId: req.adminId, action: 'DELETE_LEAVE',
      tableName: 'leaves', recordId: id,
      oldValues: existing.rows[0], ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Leave deleted' });
  } catch (err) { next(err); }
};

// ── GET /leaves/balances ──────────────────────────────────────────────────────
const getBalances = async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    const [empRes, balRes] = await Promise.all([
      pool.query('SELECT id, full_name, employee_code, department FROM employees WHERE status = $1 ORDER BY full_name', ['active']),
      pool.query('SELECT * FROM leave_balances WHERE year = $1', [targetYear]),
    ]);

    const balMap = {};
    balRes.rows.forEach(b => { balMap[b.employee_id] = b; });

    const data = empRes.rows.map(emp => {
      const bal = balMap[emp.id] || {};
      return {
        employee_id:          emp.id,
        full_name:            emp.full_name,
        employee_code:        emp.employee_code,
        department:           emp.department,
        year:                 targetYear,
        casual_allotted:      bal.casual_allotted      ?? 12,
        sick_allotted:        bal.sick_allotted        ?? 8,
        earned_allotted:      bal.earned_allotted      ?? 15,
        permission_allotted:  bal.permission_allotted  ?? 10,
        special_allotted:     bal.special_allotted     ?? 5,
        maternity_allotted:   bal.maternity_allotted   ?? 90,
        mandatory_allotted:   bal.mandatory_allotted   ?? 1,
      };
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = { getLeaves, createLeave, updateLeave, deleteLeave, getBalances };