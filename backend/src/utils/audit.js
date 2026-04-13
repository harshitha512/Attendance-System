const pool = require('../config/db');

const createAuditLog = async ({ adminId, action, tableName, recordId, oldValues, newValues, ipAddress }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, action, tableName, recordId, oldValues ? JSON.stringify(oldValues) : null,
       newValues ? JSON.stringify(newValues) : null, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { createAuditLog };
