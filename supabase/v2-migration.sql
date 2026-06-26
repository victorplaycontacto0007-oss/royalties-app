-- ============================================================
-- V2 additive migration; does NOT alter or drop existing columns
-- Royalty Engine V2.0 — reports table additions
-- Requirements: 12, 14, 19
--
-- Safe to run multiple times (all statements use IF NOT EXISTS).
-- Does NOT modify, rename, or drop any existing column.
-- ============================================================

-- ------------------------------------------------------------
-- Add V2 columns to public.reports
-- ------------------------------------------------------------
ALTER TABLE public.reports
  -- Provider / distribution platform that generated this report
  ADD COLUMN IF NOT EXISTS provider          TEXT,

  -- Currency of the report (ISO-4217). Defaults to 'USD'.
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'USD',

  -- Financial totals stored as Decimal(20,8) for full precision
  ADD COLUMN IF NOT EXISTS net_total         NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_total       NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes             NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_costs     NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs       NUMERIC(20, 8) DEFAULT 0,

  -- Audit / validation status for this report
  ADD COLUMN IF NOT EXISTS audit_status      TEXT DEFAULT 'pending'
                             CHECK (audit_status IN ('pending', 'valid', 'discrepancy', 'error')),

  -- Human-readable note when audit_status = 'discrepancy' or 'error'
  ADD COLUMN IF NOT EXISTS discrepancy_note  TEXT,

  -- How long the parse + import took, in milliseconds
  ADD COLUMN IF NOT EXISTS processing_ms     INTEGER DEFAULT 0,

  -- The billing/royalty month reported in the file (YYYY-MM)
  ADD COLUMN IF NOT EXISTS reported_month    TEXT,

  -- Structural metadata about the source file
  ADD COLUMN IF NOT EXISTS total_columns     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_rows        INTEGER DEFAULT 0;

-- ------------------------------------------------------------
-- Additional indexes for V2 query patterns
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_provider
  ON public.reports(provider);

CREATE INDEX IF NOT EXISTS idx_reports_audit_status
  ON public.reports(audit_status);
