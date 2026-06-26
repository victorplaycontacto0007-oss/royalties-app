-- ============================================================
-- currency_records migration
-- payment-column-currency-strategy feature
-- Requirements: 9.1, 9.4, 9.5
--
-- Safe to run multiple times (all statements use IF NOT EXISTS).
-- Does NOT modify, rename, or drop any existing table or column.
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: currency_records
-- Persists per-currency totals for each imported report.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.currency_records (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id           UUID        NOT NULL REFERENCES public.reports(id)   ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  provider            TEXT        NOT NULL,
  currency            TEXT        NOT NULL,
  payment_column_used TEXT        NOT NULL,
  total               NUMERIC(20, 8) NOT NULL DEFAULT 0,
  record_count        INTEGER     NOT NULL DEFAULT 0,
  import_date         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- INDEX: efficient per-report currency queries (Requirement 9.5)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_currency_records_report_currency
  ON public.currency_records(report_id, currency);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (Requirement 9.4)
-- ------------------------------------------------------------
ALTER TABLE public.currency_records ENABLE ROW LEVEL SECURITY;

-- Users can read their own records; admins can read all
CREATE POLICY "Users can view own currency records"
  ON public.currency_records FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Users can insert only their own records
CREATE POLICY "Users can insert own currency records"
  ON public.currency_records FOR INSERT
  WITH CHECK (user_id = auth.uid());
