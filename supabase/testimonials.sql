-- ============================================================
-- TESTIMONIALS — tabla pública con moderación
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.testimonials (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  comment     TEXT NOT NULL,
  stars       INTEGER NOT NULL DEFAULT 5 CHECK (stars BETWEEN 1 AND 5),
  approved    BOOLEAN NOT NULL DEFAULT false,  -- moderación manual
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para cargar solo los aprobados ordenados
CREATE INDEX IF NOT EXISTS idx_testimonials_approved ON public.testimonials(approved, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer los testimonios aprobados (landing pública)
CREATE POLICY "testimonials_read_approved"
  ON public.testimonials FOR SELECT
  USING (approved = true);

-- Cualquiera puede insertar (sin autenticación requerida)
CREATE POLICY "testimonials_insert_public"
  ON public.testimonials FOR INSERT
  WITH CHECK (true);

-- Solo admins pueden actualizar / eliminar (via service role o dashboard)
-- No se necesita policy de UPDATE/DELETE para usuarios anónimos
