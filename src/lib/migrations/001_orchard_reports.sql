-- ============================================================
-- Migration: orchard_reports + orchard_records tables
-- Run this ONCE in the Supabase SQL Editor for your project.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

-- 1. Main report header table
CREATE TABLE IF NOT EXISTS orchard_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL DEFAULT '',
  file_path     TEXT        NOT NULL DEFAULT '',
  record_count  INTEGER     NOT NULL DEFAULT 0,
  source_files  TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orchard_reports ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own reports
DROP POLICY IF EXISTS "orchard_reports_owner" ON orchard_reports;
CREATE POLICY "orchard_reports_owner" ON orchard_reports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Per-row records table (child of orchard_reports)
CREATE TABLE IF NOT EXISTS orchard_records (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  orchard_report_id       UUID    NOT NULL REFERENCES orchard_reports(id) ON DELETE CASCADE,
  user_id                 UUID    NOT NULL,
  net_total               FLOAT8  NOT NULL DEFAULT 0,
  gross_total             FLOAT8  NOT NULL DEFAULT 0,
  taxes                   FLOAT8  NOT NULL DEFAULT 0,
  channel_costs           FLOAT8  NOT NULL DEFAULT 0,
  other_costs             FLOAT8  NOT NULL DEFAULT 0,
  currency                TEXT    NOT NULL DEFAULT 'USD',
  artist                  TEXT    NOT NULL DEFAULT '',
  track                   TEXT    NOT NULL DEFAULT '',
  album                   TEXT    NOT NULL DEFAULT '',
  upc                     TEXT    NOT NULL DEFAULT '',
  isrc                    TEXT    NOT NULL DEFAULT '',
  platform                TEXT    NOT NULL DEFAULT '',
  country                 TEXT    NOT NULL DEFAULT '',
  quantity                BIGINT  NOT NULL DEFAULT 0,
  sale_period             TEXT    NOT NULL DEFAULT '',
  raw_stream_type         TEXT    NOT NULL DEFAULT '',
  normalized_stream_type  TEXT    NOT NULL DEFAULT 'UNKNOWN',
  row_index               INTEGER NOT NULL DEFAULT 0,
  source_file             TEXT    NOT NULL DEFAULT ''
);

ALTER TABLE orchard_records ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own records
DROP POLICY IF EXISTS "orchard_records_owner" ON orchard_records;
CREATE POLICY "orchard_records_owner" ON orchard_records
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Performance index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_orchard_records_report_id ON orchard_records (orchard_report_id);
CREATE INDEX IF NOT EXISTS idx_orchard_reports_user_id   ON orchard_reports (user_id, created_at DESC);

-- 3. Storage bucket for Orchard raw files (run only if not already created)
-- You can also do this via Supabase Dashboard → Storage → New Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orchard-files',
  'orchard-files',
  FALSE,  -- private bucket
  104857600,  -- 100 MB limit
  ARRAY[
    'text/csv',
    'text/tab-separated-values',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: users can only access their own folder
DROP POLICY IF EXISTS "orchard_files_owner_insert" ON storage.objects;
CREATE POLICY "orchard_files_owner_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'orchard-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "orchard_files_owner_select" ON storage.objects;
CREATE POLICY "orchard_files_owner_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'orchard-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "orchard_files_owner_delete" ON storage.objects;
CREATE POLICY "orchard_files_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'orchard-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
