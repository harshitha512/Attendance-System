const pool = require('../config/db');
const { createAuditLog } = require('../utils/audit');

const getAll = async (req, res, next) => {
  try {
    const { status, department, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
    if (department) { params.push(department); conditions.push(`e.department = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.full_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM employees e ${where}`, params);
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT e.*, 
        (SELECT registered_at FROM face_encodings fe WHERE fe.employee_id = e.id ORDER BY registered_at DESC LIMIT 1) as face_registered_at
       FROM employees e ${where} ORDER BY e.full_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const { employee_code, full_name, email, phone, department, designation, shift_start, shift_end } = req.body;
    const result = await pool.query(
      `INSERT INTO employees (employee_code, full_name, email, phone, department, designation, shift_start, shift_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [employee_code, full_name, email, phone, department, designation, shift_start || '09:00', shift_end || '18:00']
    );
    await createAuditLog({ adminId: req.adminId, action: 'CREATE_EMPLOYEE', tableName: 'employees', recordId: result.rows[0].id, newValues: result.rows[0], ipAddress: req.ip });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const old = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });

    const prev = old.rows[0];
    const full_name   = req.body.full_name   !== undefined ? req.body.full_name   : prev.full_name;
    const email       = req.body.email       !== undefined ? req.body.email       : prev.email;
    const phone       = req.body.phone       !== undefined ? req.body.phone       : prev.phone;
    const department  = req.body.department  !== undefined ? req.body.department  : prev.department;
    const designation = req.body.designation !== undefined ? req.body.designation : prev.designation;
    const shift_start = req.body.shift_start !== undefined ? req.body.shift_start : prev.shift_start;
    const shift_end   = req.body.shift_end   !== undefined ? req.body.shift_end   : prev.shift_end;
    const status      = req.body.status      !== undefined ? req.body.status      : prev.status;

    const result = await pool.query(
      `UPDATE employees SET full_name=$1, email=$2, phone=$3, department=$4, designation=$5,
       shift_start=$6, shift_end=$7, status=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [full_name, email, phone, department, designation, shift_start, shift_end, status, req.params.id]
    );
    await createAuditLog({ adminId: req.adminId, action: 'UPDATE_EMPLOYEE', tableName: 'employees', recordId: req.params.id, oldValues: prev, newValues: result.rows[0], ipAddress: req.ip });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const old = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    await createAuditLog({ adminId: req.adminId, action: 'DELETE_EMPLOYEE', tableName: 'employees', recordId: req.params.id, oldValues: old.rows[0], ipAddress: req.ip });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) { next(err); }
};

const getDepartments = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT DISTINCT department FROM employees WHERE department IS NOT NULL ORDER BY department');
    res.json({ success: true, data: result.rows.map(r => r.department) });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, remove, getDepartments };