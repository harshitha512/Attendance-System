const pool = require('../config/db');
const XLSX = require('xlsx');

const SHIFT_MAP = {
  'A': { shift_start: '06:00', shift_end: '14:00' },
  'B': { shift_start: '14:00', shift_end: '22:00' },
  'C': { shift_start: '22:00', shift_end: '06:00' },
  'G': { shift_start: '09:00', shift_end: '17:30' },
};

const bulkImportEmployees = async (req, res, next) => {
  try {
    const fileBuffer = req.file?.buffer;
    if (!fileBuffer) return res.status(400).json({ success: false, message: 'Excel file required' });

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) return res.status(400).json({ success: false, message: 'No data found in Excel file' });

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const employee_code = (row['Employee Code *'] || row['employee_code'] || '').toString().trim();
      const full_name     = (row['Full Name *']     || row['full_name']     || '').toString().trim();
      const email         = (row['Email']           || row['email']         || '').toString().trim() || null;
      const phone         = (row['Phone']           || row['phone']         || '').toString().trim() || null;
      const department    = (row['Department']      || row['department']    || '').toString().trim() || null;
      const designation   = (row['Designation']     || row['designation']   || '').toString().trim() || null;
      const status        = (row['Status']          || row['status']        || 'active').toString().trim();
      const shiftKey      = (row['Shift']           || row['shift']         || 'G').toString().trim().toUpperCase();
      const shift         = SHIFT_MAP[shiftKey] || SHIFT_MAP['G'];

      if (!employee_code && !full_name) continue;
      if (!employee_code) { results.failed++; results.errors.push(`Row ${rowNum}: Missing employee code`); continue; }
      if (!full_name)     { results.failed++; results.errors.push(`Row ${rowNum}: Missing full name`); continue; }
      if (!SHIFT_MAP[shiftKey]) results.errors.push(`Row ${rowNum} (${employee_code}): Invalid shift "${shiftKey}" — defaulted to G`);

      // FIX: validate status value before insert
      const validStatuses = ['active', 'inactive', 'terminated'];
      const safeStatus = validStatuses.includes(status) ? status : 'active';
      if (!validStatuses.includes(status)) {
        results.errors.push(`Row ${rowNum} (${employee_code}): Invalid status "${status}" — defaulted to active`);
      }

      try {
        // FIX: include email and phone in upsert (were missing before)
        await pool.query(
          `INSERT INTO employees (employee_code, full_name, email, phone, department, designation, shift_start, shift_end, shift, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (employee_code) DO UPDATE SET
             full_name=$2, email=$3, phone=$4, department=$5, designation=$6,
             shift_start=$7, shift_end=$8, shift=$9, status=$10, updated_at=NOW()`,
          [employee_code, full_name, email, phone, department, designation, shift.shift_start, shift.shift_end, shiftKey, safeStatus]
        );
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${rowNum} (${employee_code}): ${err.message}`);
      }
    }

    res.json({ success: true, message: `Import complete: ${results.success} added/updated, ${results.failed} failed`, results });
  } catch (err) { next(err); }
};

module.exports = { bulkImportEmployees };
