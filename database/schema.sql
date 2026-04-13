-- ============================================================
-- Attendance Facial Recognition System - PostgreSQL Schema
-- ============================================================
-- Safe to re-run: all tables use IF NOT EXISTS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Employees ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id               SERIAL PRIMARY KEY,
  employee_code    VARCHAR(50)  UNIQUE NOT NULL,
  full_name        VARCHAR(255) NOT NULL,
  email            VARCHAR(255),
  phone            VARCHAR(20),
  department       VARCHAR(100),
  designation      VARCHAR(100),
  shift            VARCHAR(5)   DEFAULT 'G',
  shift_start      TIME         DEFAULT '09:00',
  shift_end        TIME         DEFAULT '18:00',
  status           VARCHAR(20)  DEFAULT 'active',
  created_at       TIMESTAMP    DEFAULT NOW(),
  updated_at       TIMESTAMP    DEFAULT NOW()
);

-- ── Face encodings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS face_encodings (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL,
  encoding       JSONB   NOT NULL,
  registered_by  INTEGER,
  registered_at  TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- ── Attendance logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                  SERIAL PRIMARY KEY,
  employee_id         INTEGER NOT NULL,
  attendance_date     DATE    NOT NULL,
  check_in            TIMESTAMP,
  check_out           TIMESTAMP,
  total_hours         DECIMAL(5,2),
  is_late             BOOLEAN DEFAULT FALSE,
  late_by_minutes     INTEGER DEFAULT 0,
  status              VARCHAR(20) DEFAULT 'present',
  check_in_snapshot   TEXT,
  check_out_snapshot  TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE (employee_id, attendance_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- ── Overtime adjustments ─────────────────────────────────────
-- final_ot = manual_ot if set, otherwise system_ot
CREATE TABLE IF NOT EXISTS overtime_adjustments (
  id            SERIAL PRIMARY KEY,
  attendance_id INTEGER NOT NULL UNIQUE,
  employee_id   INTEGER NOT NULL,
  ot_date       DATE    NOT NULL,
  actual_hours  DECIMAL(5,2),
  system_ot     DECIMAL(5,2) DEFAULT 0,
  manual_ot     DECIMAL(5,2),
  final_ot      DECIMAL(5,2) GENERATED ALWAYS AS (
                  COALESCE(manual_ot, system_ot, 0)
                ) STORED,
  ot_remarks    TEXT,
  updated_by    INTEGER,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (attendance_id) REFERENCES attendance_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id)   REFERENCES employees(id)       ON DELETE CASCADE
);

-- ── Audit logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER,
  action      VARCHAR(100) NOT NULL,
  table_name  VARCHAR(100),
  record_id   INTEGER,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Indexes for performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_date       ON attendance_logs (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee   ON attendance_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_date               ON overtime_adjustments (ot_date);
CREATE INDEX IF NOT EXISTS idx_face_employee         ON face_encodings (employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_code        ON employees (employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_status      ON employees (status);