/**
 * orchardReportService.ts
 *
 * Supabase persistence layer for Orchard reports.
 *
 * Data model:
 *   Table: orchard_reports
 *     id          uuid PK
 *     user_id     uuid FK → profiles.id
 *     file_name   text
 *     file_path   text          (Supabase Storage path, may be empty for migrated)
 *     created_at  timestamptz
 *     record_count int
 *     source_files text[]       (all file names accumulated in this session)
 *
 *   Table: orchard_records
 *     id                        uuid PK
 *     orchard_report_id         uuid FK → orchard_reports.id
 *     user_id                   uuid
 *     net_total                 float8
 *     gross_total               float8
 *     taxes                     float8
 *     channel_costs             float8
 *     other_costs               float8
 *     currency                  text
 *     artist                    text
 *     track                     text
 *     album                     text
 *     upc                       text
 *     isrc                      text
 *     platform                  text
 *     country                   text
 *     quantity                  int8
 *     sale_period               text
 *     raw_stream_type           text
 *     normalized_stream_type    text
 *     row_index                 int4
 *     source_file               text
 *
 * SQL migration (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * -- orchard_reports
 * create table if not exists orchard_reports (
 *   id            uuid primary key default gen_random_uuid(),
 *   user_id       uuid not null references profiles(id) on delete cascade,
 *   file_name     text not null default '',
 *   file_path     text not null default '',
 *   record_count  int  not null default 0,
 *   source_files  text[] not null default '{}',
 *   created_at    timestamptz not null default now()
 * );
 * alter table orchard_reports enable row level security;
 * create policy "orchard_reports_owner" on orchard_reports
 *   using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * -- orchard_records
 * create table if not exists orchard_records (
 *   id                      uuid primary key default gen_random_uuid(),
 *   orchard_report_id       uuid not null references orchard_reports(id) on delete cascade,
 *   user_id                 uuid not null,
 *   net_total               float8 not null default 0,
 *   gross_total             float8 not null default 0,
 *   taxes                   float8 not null default 0,
 *   channel_costs           float8 not null default 0,
 *   other_costs             float8 not null default 0,
 *   currency                text   not null default 'USD',
 *   artist                  text   not null default '',
 *   track                   text   not null default '',
 *   album                   text   not null default '',
 *   upc                     text   not null default '',
 *   isrc                    text   not null default '',
 *   platform                text   not null default '',
 *   country                 text   not null default '',
 *   quantity                int8   not null default 0,
 *   sale_period             text   not null default '',
 *   raw_stream_type         text   not null default '',
 *   normalized_stream_type  text   not null default 'UNKNOWN',
 *   row_index               int4   not null default 0,
 *   source_file             text   not null default ''
 * );
 * alter table orchard_records enable row level security;
 * create policy "orchard_records_owner" on orchard_records
 *   using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * -- Storage bucket (run only if not exists)
 * -- insert into storage.buckets (id, name, public) values ('orchard-files', 'orchard-files', false)
 * -- on conflict do nothing;
 * -- create policy "orchard_files_owner" on storage.objects
 * --   for all using (auth.uid() = owner) with check (auth.uid() = owner);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase'
import type { OrchardRecord } from '../royalty-engine/StreamTypeClassifier'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const BATCH_SIZE    = 500
const MAX_CONCURRENCY = 5

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SavedOrchardReport {
  id:           string
  user_id:      string
  file_name:    string
  file_path:    string
  record_count: number
  source_files: string[]
  created_at:   string
}

export interface LoadOrchardResult {
  reports:    SavedOrchardReport[]
  records:    OrchardRecord[]
}

// ─── saveOrchardReport() ──────────────────────────────────────────────────────

/**
 * Saves an array of OrchardRecords to Supabase under a new orchard_reports row.
 * Returns the new report ID on success.
 *
 * Uses batched parallel inserts identical to UploadPage's approach.
 * Rolls back the report header row on insert failure.
 */
export async function saveOrchardReport(
  userId:    string,
  fileName:  string,
  records:   OrchardRecord[],
  filePath?: string,
): Promise<string> {

  // 1. Create the report header row
  const { data: reportRow, error: reportErr } = await db
    .from('orchard_reports')
    .insert({
      user_id:      userId,
      file_name:    fileName,
      file_path:    filePath ?? '',
      record_count: records.length,
      source_files: [fileName],
    })
    .select('id')
    .single()

  if (reportErr) throw new Error(`Error creando reporte Orchard: ${reportErr.message}`)

  const reportId: string = reportRow.id

  // 2. Build insert batches
  const batches: object[][] = []
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    batches.push(
      records.slice(i, i + BATCH_SIZE).map(r => ({
        orchard_report_id:      reportId,
        user_id:                userId,
        net_total:              r.net_total,
        gross_total:            r.gross_total,
        taxes:                  r.taxes,
        channel_costs:          r.channel_costs,
        other_costs:            r.other_costs,
        currency:               r.currency,
        artist:                 r.artist || r.artist_name,
        track:                  r.track  || r.song_title,
        album:                  r.album  || r.album_name,
        upc:                    r.upc,
        isrc:                   r.isrc,
        platform:               r.platform || r.store,
        country:                r.country,
        quantity:               r.quantity,
        sale_period:            r.sale_period,
        raw_stream_type:        r.rawStreamType,
        normalized_stream_type: r.normalizedStreamType,
        row_index:              r.rowIndex,
        source_file:            r.sourceFile,
      }))
    )
  }

  // 3. Execute batches with limited concurrency
  for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
    const chunk   = batches.slice(i, i + MAX_CONCURRENCY)
    const results = await Promise.all(chunk.map(b => db.from('orchard_records').insert(b)))

    for (const { error: insErr } of results) {
      if (insErr) {
        // Best-effort rollback
        await db.from('orchard_reports').delete().eq('id', reportId)
        throw new Error(`Error guardando registros Orchard: ${insErr.message}`)
      }
    }
  }

  return reportId
}

// ─── loadOrchardReports() ─────────────────────────────────────────────────────

/**
 * Loads all orchard report headers + their records for a given user.
 * Records are returned as OrchardRecord[] so OrchardReportPage can use them
 * directly without transformation.
 */
export async function loadOrchardReports(userId: string): Promise<LoadOrchardResult> {
  // 1. Fetch report headers
  const { data: reports, error: repErr } = await db
    .from('orchard_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (repErr) throw new Error(`Error cargando reportes Orchard: ${repErr.message}`)
  if (!reports || reports.length === 0) return { reports: [], records: [] }

  // 2. Fetch all orchard_records for these reports
  const reportIds = (reports as SavedOrchardReport[]).map(r => r.id)
  const allRecords: OrchardRecord[] = []

  // Load in pages of 1000 (Supabase default limit is 1000 per request)
  const PAGE_SIZE = 1000
  let offset = 0
  let fetched = true

  while (fetched) {
    const { data: rows, error: rowsErr } = await db
      .from('orchard_records')
      .select('*')
      .in('orchard_report_id', reportIds)
      .range(offset, offset + PAGE_SIZE - 1)

    if (rowsErr) throw new Error(`Error cargando registros Orchard: ${rowsErr.message}`)

    if (!rows || rows.length === 0) {
      fetched = false
      break
    }

    for (const row of rows) {
      allRecords.push(dbRowToOrchardRecord(row))
    }

    if (rows.length < PAGE_SIZE) {
      fetched = false
    } else {
      offset += PAGE_SIZE
    }
  }

  return { reports: reports as SavedOrchardReport[], records: allRecords }
}

// ─── deleteOrchardReport() ────────────────────────────────────────────────────

/**
 * Deletes an orchard report and all its records.
 * The cascade delete on orchard_records handles the child rows.
 * Also deletes the file from Storage if a file_path is set.
 */
export async function deleteOrchardReport(reportId: string, filePath?: string): Promise<void> {
  if (filePath) {
    // Best-effort file removal — ignore errors (file may already be gone)
    await supabase.storage.from('orchard-files').remove([filePath]).catch(() => {})
  }

  const { error } = await db.from('orchard_reports').delete().eq('id', reportId)
  if (error) throw new Error(`Error eliminando reporte Orchard: ${error.message}`)
}

// ─── dbRowToOrchardRecord() ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToOrchardRecord(row: any): OrchardRecord {
  return {
    net_total:              row.net_total     ?? 0,
    gross_total:            row.gross_total   ?? 0,
    taxes:                  row.taxes         ?? 0,
    channel_costs:          row.channel_costs ?? 0,
    other_costs:            row.other_costs   ?? 0,
    currency:               row.currency      ?? 'USD',
    artist:                 row.artist        ?? '',
    track:                  row.track         ?? '',
    album:                  row.album         ?? '',
    upc:                    row.upc           ?? '',
    isrc:                   row.isrc          ?? '',
    platform:               row.platform      ?? '',
    country:                row.country       ?? '',
    quantity:               row.quantity      ?? 0,
    sale_period:            row.sale_period   ?? '',
    // compat aliases expected by analytics
    artist_name:            row.artist        ?? '',
    song_title:             row.track         ?? '',
    album_name:             row.album         ?? '',
    store:                  row.platform      ?? '',
    earnings_usd:           row.net_total     ?? 0,
    // Orchard-specific
    rawStreamType:          row.raw_stream_type        ?? '',
    normalizedStreamType:   row.normalized_stream_type ?? 'UNKNOWN',
    rowIndex:               row.row_index     ?? 0,
    sourceFile:             row.source_file   ?? '',
  }
}

// ─── uploadOrchardFile() ─────────────────────────────────────────────────────

/**
 * Uploads the raw file to Supabase Storage bucket 'orchard-files'.
 * Returns the storage path on success, or '' if upload fails (non-fatal).
 */
export async function uploadOrchardFile(userId: string, file: File): Promise<string> {
  try {
    const path = `${userId}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('orchard-files').upload(path, file)
    if (error) {
      console.warn('Orchard file upload to Storage failed (non-fatal):', error.message)
      return ''
    }
    return path
  } catch (err) {
    console.warn('Orchard file upload exception (non-fatal):', err)
    return ''
  }
}
