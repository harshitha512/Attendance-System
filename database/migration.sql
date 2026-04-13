-- ============================================================
-- Migration: fix face_encodings + overtime_adjustments
-- Safe to run on both fresh and existing databases
-- ============================================================

-- ── Fix face_encodings: ensure employee_id is INTEGER ────────
ALTER TABLE face_encodings
  DROP CONSTRAINT IF EXISTS face_encodings_employee_id_fkey;

ALTER TABLE face_encodings
  ALTER COLUMN employee_id TYPE INTEGER USING (employee_id::INTEGER),
  ALTER COLUMN registered_by TYPE INTEGER USING NULL;

ALTER TABLE face_encodings
  ADD CONSTRAINT face_encodings_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

-- ── Add missing columns to employees if not present ──────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS shift VARCHAR(5) DEFAULT 'G';

-- ── Add updated_by to overtime_adjustments if not present ────
ALTER TABLE overtime_adjustments
  ADD COLUMN IF NOT EXISTS updated_by INTEGER;

-- ── Add UNIQUE constraint on attendance_logs if not present ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_logs_employee_id_attendance_date_key'
  ) THEN
    ALTER TABLE attendance_logs
      ADD CONSTRAINT attendance_logs_employee_id_attendance_date_key
      UNIQUE (employee_id, attendance_date);
  END IF;
END $$;

-- ── Ensure all indexes exist ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance_logs (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_date             ON overtime_adjustments (ot_date);
CREATE INDEX IF NOT EXISTS idx_face_employee       ON face_encodings (employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_code      ON employees (employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_status    ON employees (status);
