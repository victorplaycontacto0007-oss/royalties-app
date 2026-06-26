-- ============================================================
-- REFERRAL SYSTEM — Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. referral_links ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_referral_links_code      ON public.referral_links(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_links_affiliate ON public.referral_links(affiliate_id);

-- ── 2. affiliate_balances ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_balances (
  affiliate_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. commissions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commissions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id          UUID NOT NULL REFERENCES public.profiles(id),
  buyer_id              UUID NOT NULL REFERENCES public.profiles(id),
  purchase_amount_usd   NUMERIC(10,2) NOT NULL CHECK (purchase_amount_usd > 0),
  commission_percentage NUMERIC(5,2)  NOT NULL CHECK (commission_percentage BETWEEN 0.01 AND 100),
  commission_amount     NUMERIC(10,2) NOT NULL CHECK (commission_amount >= 0),
  status                TEXT NOT NULL DEFAULT 'Pendiente'
                          CHECK (status IN ('Pendiente','Aprobada','Pagada','Rechazada','Cancelada')),
  payment_method        TEXT NOT NULL
                          CHECK (payment_method IN ('PayPal','Bold','Transferencia','Otro')),
  paypal_order_id       TEXT UNIQUE,
  admin_id              UUID REFERENCES public.profiles(id),
  notes                 TEXT,
  paid_at               TIMESTAMPTZ,
  payment_proof         TEXT,
  payment_notes         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate    ON public.commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_buyer        ON public.commissions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status       ON public.commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_paypal_order ON public.commissions(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS commissions_updated_at ON public.commissions;
CREATE TRIGGER commissions_updated_at
  BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION update_commissions_updated_at();

-- ── 4. commission_history (append-only) ────────────────────
CREATE TABLE IF NOT EXISTS public.commission_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commission_id UUID NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  admin_id      UUID NOT NULL REFERENCES public.profiles(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address    INET,
  action        TEXT NOT NULL,
  field_changed TEXT,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT
);

CREATE INDEX IF NOT EXISTS idx_commission_history_commission ON public.commission_history(commission_id);

-- ── 5. Add referral_code column to subscriptions ───────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- ── 6. RLS ─────────────────────────────────────────────────

-- referral_links
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates read own referral links"
  ON public.referral_links FOR SELECT
  USING (affiliate_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins full access on referral_links"
  ON public.referral_links FOR ALL
  USING (public.is_admin());

-- affiliate_balances
ALTER TABLE public.affiliate_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates read own balance"
  ON public.affiliate_balances FOR SELECT
  USING (affiliate_id = auth.uid());

CREATE POLICY "Admins full access on affiliate_balances"
  ON public.affiliate_balances FOR ALL
  USING (public.is_admin());

-- commissions
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates read own commissions"
  ON public.commissions FOR SELECT
  USING (affiliate_id = auth.uid());

CREATE POLICY "Admins full access on commissions"
  ON public.commissions FOR ALL
  USING (public.is_admin());

-- commission_history (admins read/insert only; no UPDATE/DELETE for non-superuser)
ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read commission history"
  ON public.commission_history FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins insert commission history"
  ON public.commission_history FOR INSERT
  WITH CHECK (public.is_admin());

-- ── 7. Atomic SQL functions ────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_commission(
  p_commission_id UUID,
  p_admin_id      UUID,
  p_ip            INET DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount    NUMERIC;
  v_affiliate UUID;
  v_old_status TEXT;
BEGIN
  SELECT commission_amount, affiliate_id, status
    INTO v_amount, v_affiliate, v_old_status
    FROM public.commissions
   WHERE id = p_commission_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found';
  END IF;

  IF v_old_status = 'Aprobada' THEN
    RAISE EXCEPTION 'already_approved';
  END IF;

  UPDATE public.commissions
     SET status = 'Aprobada', updated_at = now()
   WHERE id = p_commission_id;

  INSERT INTO public.affiliate_balances (affiliate_id, available_balance, updated_at)
    VALUES (v_affiliate, v_amount, now())
    ON CONFLICT (affiliate_id) DO UPDATE
      SET available_balance = public.affiliate_balances.available_balance + EXCLUDED.available_balance,
          updated_at        = now();

  INSERT INTO public.commission_history
    (commission_id, admin_id, ip_address, action, old_value, new_value)
  VALUES
    (p_commission_id, p_admin_id, p_ip, 'approved', v_old_status, 'Aprobada');
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_commission_approval(
  p_commission_id UUID,
  p_admin_id      UUID,
  p_new_status    TEXT,
  p_reason        TEXT DEFAULT NULL,
  p_ip            INET DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount    NUMERIC;
  v_affiliate UUID;
  v_old_status TEXT;
BEGIN
  SELECT commission_amount, affiliate_id, status
    INTO v_amount, v_affiliate, v_old_status
    FROM public.commissions
   WHERE id = p_commission_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission_not_found';
  END IF;

  IF v_old_status != 'Aprobada' THEN
    RAISE EXCEPTION 'commission_not_approved';
  END IF;

  IF p_new_status NOT IN ('Rechazada','Cancelada') THEN
    RAISE EXCEPTION 'invalid_target_status';
  END IF;

  UPDATE public.commissions
     SET status = p_new_status, updated_at = now()
   WHERE id = p_commission_id;

  UPDATE public.affiliate_balances
     SET available_balance = GREATEST(0, available_balance - v_amount),
         updated_at        = now()
   WHERE affiliate_id = v_affiliate;

  INSERT INTO public.commission_history
    (commission_id, admin_id, ip_address, action, old_value, new_value, reason)
  VALUES
    (p_commission_id, p_admin_id, p_ip,
     CASE p_new_status WHEN 'Rechazada' THEN 'rejected' ELSE 'cancelled' END,
     v_old_status, p_new_status, p_reason);
END;
$$;
