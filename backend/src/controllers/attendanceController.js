const pool = require('../config/db');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { createAuditLog } = require('../utils/audit');

// Mark attendance via facial recognition
const markAttendance = async (req, res, next) => {
  try {
    const imageBuffer = req.file?.buffer;
    if (!imageBuffer) return res.status(400).json({ success: false, message: 'Image required' });

    // Call face service
    const formData = new FormData();
    formData.append('image', imageBuffer, { filename: 'frame.jpg', contentType: 'image/jpeg' });

    const faceRes = await fetch(`${process.env.FACE_SERVICE_URL}/recognize`, {
      method: 'POST', body: formData,
    });
    const faceData = await faceRes.json();

    if (!faceData.employee_id) {
      return res.status(404).json({ success: false, message: 'Face not recognized', data: faceData });
    }

    const employeeId = faceData.employee_id;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Get employee shift
    const empResult = await pool.query('SELECT * FROM employees WHERE id = $1', [employeeId]);
    if (!empResult.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    const employee = empResult.rows[0];

    // Check existing record
    const existing = await pool.query(
      'SELECT * FROM attendance_logs WHERE employee_id = $1 AND attendance_date = $2',
      [employeeId, today]
    );

    let attendance;
    let action;

    if (existing.rows.length === 0) {
      // CHECK-IN
      const shiftStart = new Date(`${today}T${employee.shift_start}`);
      const lateByMs = now - shiftStart;
      const isLate = lateByMs > 0;
      const lateByMinutes = isLate ? Math.floor(lateByMs / 60000) : 0;

      const result = await pool.query(
        `INSERT INTO attendance_logs (employee_id, attendance_date, check_in, is_late, late_by_minutes, status, check_in_snapshot)
         VALUES ($1,$2,$3,$4,$5,'present',$6) RETURNING *`,
        [employeeId, today, now, isLate, lateByMinutes, req.body.snapshot || null]
      );
      attendance = result.rows[0];
      action = 'CHECK_IN';
    } else if (!existing.rows[0].check_out) {
      // CHECK-OUT
      const checkIn = new Date(existing.rows[0].check_in);
      const totalHours = parseFloat(((now - checkIn) / 3600000).toFixed(2));

      // Calculate system OT
      const shiftEnd = new Date(`${today}T${employee.shift_end}`);
      const shiftDurationHours = (shiftEnd - new Date(`${today}T${employee.shift_start}`)) / 3600000;
      const systemOt = Math.max(0, parseFloat((totalHours - shiftDurationHours).toFixed(2)));

      const result = await pool.query(
        `UPDATE attendance_logs SET check_out=$1, total_hours=$2, check_out_snapshot=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [now, totalHours, req.body.snapshot || null, existing.rows[0].id]
      );
      attendance = result.rows[0];
      action = 'CHECK_OUT';

      // Create/update OT record
      await pool.query(
        `INSERT INTO overtime_adjustments (attendance_id, employee_id, ot_date, actual_hours, system_ot)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (attendance_id) DO UPDATE SET actual_hours=$4, system_ot=$5, updated_at=NOW()`,
        [attendance.id, employeeId, today, totalHours, systemOt]
      );
    } else {
      return res.json({ success: true, message: 'Already checked out today', data: existing.rows[0] });
    }

    res.json({
      success: true,
      action,
      employee: { id: employee.id, name: employee.full_name, code: employee.employee_code },
      attendance,
    });
  } catch (err) { next(err); }
};

// Get attendance list
const getAttendance = async (req, res, next) => {
  try {
    const { date, employee_id, from, to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    // date and from/to are mutually exclusive — date takes priority
    if (date) {
      params.push(date);
      conditions.push(`a.attendance_date = $${params.length}`);
    } else if (from && to) {
      params.push(from, to);
      conditions.push(`a.attendance_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    if (employee_id) { params.push(employee_id); conditions.push(`a.employee_id = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM attendance_logs a ${where}`, params);
    params.push(limit, offset);

    const result = await pool.query(
      `SELECT a.*, e.full_name, e.employee_code, e.department, e.designation,
              ot.system_ot, ot.manual_ot, ot.final_ot, ot.ot_remarks, ot.id as ot_id
       FROM attendance_logs a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN overtime_adjustments ot ON ot.attendance_id = a.id
       ${where} ORDER BY a.attendance_date DESC, e.full_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) { next(err); }
};

// Get today's summary
const getTodaySummary = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalEmp = await pool.query(`SELECT COUNT(*) FROM employees WHERE status = 'active'`);
    const present = await pool.query(`SELECT COUNT(*) FROM attendance_logs WHERE attendance_date = $1`, [today]);
    const late = await pool.query(`SELECT COUNT(*) FROM attendance_logs WHERE attendance_date = $1 AND is_late = true`, [today]);
    const otSum = await pool.query(`SELECT COALESCE(SUM(ot.final_ot), 0) as total_ot FROM overtime_adjustments ot WHERE ot.ot_date = $1`, [today]);

    const totalEmployees = parseInt(totalEmp.rows[0].count);
    const presentCount = parseInt(present.rows[0].count);

    res.json({
      success: true,
      data: {
        total_employees: totalEmployees,
        present: presentCount,
        absent: totalEmployees - presentCount,
        late: parseInt(late.rows[0].count),
        total_ot_hours: parseFloat(otSum.rows[0].total_ot),
        date: today,
      },
    });
  } catch (err) { next(err); }
};

// Update OT
const updateOT = async (req, res, next) => {
  try {
    const { attendance_id, manual_ot, ot_remarks } = req.body;

    const existing = await pool.query('SELECT * FROM overtime_adjustments WHERE attendance_id = $1', [attendance_id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'OT record not found' });

    const old = existing.rows[0];
    const manualOtVal = (manual_ot !== '' && manual_ot != null) ? manual_ot : null;
    const result = await pool.query(
      `UPDATE overtime_adjustments
       SET manual_ot=$1, ot_remarks=$2, updated_by=$3, updated_at=NOW()
       WHERE attendance_id=$4 RETURNING *`,
      [manualOtVal, ot_remarks, req.adminId, attendance_id]
    );

    await createAuditLog({
      adminId: req.adminId, action: 'UPDATE_OT', tableName: 'overtime_adjustments',
      recordId: old.id, oldValues: { manual_ot: old.manual_ot, ot_remarks: old.ot_remarks },
      newValues: { manual_ot, ot_remarks }, ipAddress: req.ip,
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

// Reports
const getReports = async (req, res, next) => {
  try {
    const { type = 'daily', date, month, year, employee_id } = req.query;

    let query, params = [];
    if (type === 'daily') {
      const d = date || new Date().toISOString().split('T')[0];
      params.push(d);
      query = `SELECT a.*, e.full_name, e.employee_code, e.department,
                      ot.final_ot, ot.ot_remarks, ot.system_ot, ot.manual_ot
               FROM attendance_logs a
               JOIN employees e ON a.employee_id = e.id
               LEFT JOIN overtime_adjustments ot ON ot.attendance_id = a.id
               WHERE a.attendance_date = $1 ORDER BY e.full_name`;
    } else {
      const m = month || new Date().getMonth() + 1;
      const y = year || new Date().getFullYear();
      params.push(y, m);
      query = `SELECT a.*, e.full_name, e.employee_code, e.department,
                      ot.final_ot, ot.ot_remarks, ot.system_ot, ot.manual_ot
               FROM attendance_logs a
               JOIN employees e ON a.employee_id = e.id
               LEFT JOIN overtime_adjustments ot ON ot.attendance_id = a.id
               WHERE EXTRACT(YEAR FROM a.attendance_date) = $1 AND EXTRACT(MONTH FROM a.attendance_date) = $2
               ORDER BY a.attendance_date, e.full_name`;
    }

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

module.exports = { markAttendance, getAttendance, getTodaySummary, updateOT, getReports };
