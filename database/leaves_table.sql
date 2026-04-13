-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: create leaves + leave_balances tables
-- Run once against your PostgreSQL database:
--   psql -U <user> -d <database> -f create_leaves_table.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── leaves ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id               SERIAL PRIMARY KEY,
  employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  leave_type       VARCHAR(20) NOT NULL
                   CHECK (leave_type IN ('casual','sick','earned','permission','absent','special','abandonment','maternity','mandatory')),
  shift            VARCHAR(5)  NOT NULL DEFAULT 'G'
                   CHECK (shift IN ('A','B','C','G')),

  from_date        DATE        NOT NULL,
  to_date          DATE        NOT NULL,
  days             INTEGER     NOT NULL DEFAULT 1,

  reason           TEXT,
  attendance_code  VARCHAR(5)  NOT NULL DEFAULT '6',

  status           VARCHAR(10) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),

  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at      TIMESTAMPTZ,
  rejected_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaves_employee_id ON leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_from_date   ON leaves(from_date);
CREATE INDEX IF NOT EXISTS idx_leaves_status       ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_leaves_shift        ON leaves(shift);

-- ── leave_balances ────────────────────────────────────────────────────────────
-- Optional: stores per-employee allotments per year.
-- If no row exists the controller falls back to the default values.
CREATE TABLE IF NOT EXISTS leave_balances (
  id                   SERIAL PRIMARY KEY,
  employee_id          INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year                 INTEGER NOT NULL,

  casual_allotted      INTEGER NOT NULL DEFAULT 12,
  sick_allotted        INTEGER NOT NULL DEFAULT 8,
  earned_allotted      INTEGER NOT NULL DEFAULT 15,
  permission_allotted  INTEGER NOT NULL DEFAULT 10,
  special_allotted     INTEGER NOT NULL DEFAULT 5,
  maternity_allotted   INTEGER NOT NULL DEFAULT 90,
  mandatory_allotted   INTEGER NOT NULL DEFAULT 1,

  UNIQUE (employee_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year
  ON leave_balances(employee_id, year);
