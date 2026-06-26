-- ============================================================
-- PLANS TABLE — Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plans (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  price          NUMERIC(10,2) NOT NULL CHECK (price > 0),
  currency       TEXT NOT NULL DEFAULT 'USD',
  duration_days  INTEGER NOT NULL CHECK (duration_days > 0),
  badge          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_slug ON public.plans(slug);
CREATE INDEX IF NOT EXISTS idx_plans_display_order ON public.plans(display_order);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION update_plans_updated_at();

-- RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can read active plans
CREATE POLICY "Public can read active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- Admins can do everything
CREATE POLICY "Admins full access on plans"
  ON public.plans FOR ALL
  USING (public.is_admin());

-- ── Seed data ──────────────────────────────────────────────
INSERT INTO public.plans (name, slug, price, currency, duration_days, badge, is_active, display_order)
VALUES
  ('Diario',     'daily',     3,  'USD', 1,   NULL,          true, 1),
  ('Mensual',    'monthly',   15, 'USD', 30,  'Popular',     true, 2),
  ('Trimestral', 'quarterly', 25, 'USD', 90,  NULL,          true, 3),
  ('Anual',      'annual',    80, 'USD', 365, 'Mejor precio', true, 4)
ON CONFLICT (slug) DO UPDATE SET
  price         = EXCLUDED.price,
  duration_days = EXCLUDED.duration_days,
  badge         = EXCLUDED.badge,
  display_order = EXCLUDED.display_order,
  updated_at    = now();
