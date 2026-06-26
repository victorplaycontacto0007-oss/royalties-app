# Requirements Document

## Introduction

Royalty Engine V2.0 es una actualización mayor del motor universal de importación y auditoría de reportes de regalías (`src/royalty-engine/`). El sistema actual (V1) parsea archivos CSV/XLSX y calcula totales básicos. V2.0 amplía esta base para soportar más formatos de archivo, estrategias de cálculo por proveedor, procesamiento en streaming para archivos grandes (hasta 1 GB), validación avanzada, un modo de depuración completo, un historial de importaciones persistente en Supabase y un informe de auditoría detallado por importación.

El motor debe detectar automáticamente el proveedor de distribución, normalizar los encabezados de columna, seleccionar la columna de pago correcta según la estrategia del proveedor, sumar los valores sin recalcular regalías, validar cada fila, y marcar la importación como válida únicamente cuando el total calculado coincide exactamente con la suma de la columna correcta.

---

## Glossary

- **Engine**: El motor Royalty Engine V2.0 — el sistema descrito en este documento.
- **Provider**: Una distribuidora o DSP (ej. Ditto, DistroKid, Spotify). Detectado automáticamente.
- **Report**: Archivo de regalías subido por el usuario (CSV, XLS, XLSX, TSV, TXT u ODS).
- **Canonical Field**: Campo estandarizado interno (ej. `net_total`, `artist`, `platform`).
- **Normalized Header**: Encabezado de columna convertido a minúsculas, sin tildes, espacios, guiones ni caracteres especiales.
- **Provider Strategy**: Regla que indica qué columna usar para calcular el total neto según el proveedor detectado.
- **Audit Report**: Resumen generado tras cada importación con metadatos, totales y estado de validación.
- **Debug Mode**: Vista ampliada que muestra columnas detectadas, primeras/últimas filas, total acumulado y errores.
- **Import History**: Registro persistente en Supabase de cada importación realizada.
- **Streaming Processing**: Lectura del archivo por chunks para evitar cargar todo en memoria.
- **ParsedRow**: Fila normalizada con todos los campos canónicos más alias de compatibilidad con la base de datos.
- **RUPEStats**: Estructura de estadísticas calculadas tras parsear todas las filas válidas.
- **Decimal(20,8)**: Tipo de dato de precisión fija para valores monetarios; nunca se usa float.
- **EARS**: Easy Approach to Requirements Syntax — convención estructural para redactar requisitos.

---

## Requirements

### Requirement 1: File Format and Encoding Support

**User Story:** As a user, I want to upload royalty reports in any common file format, so that I am not limited by which distributor or export format generated the file.

#### Acceptance Criteria

1. THE Engine SHALL accept files with extensions `.csv`, `.xls`, `.xlsx`, `.tsv`, `.txt`, and `.ods`.
2. WHEN a file is uploaded, THE Engine SHALL auto-detect its character encoding from the set: UTF-8, UTF-8 BOM, Latin-1, ISO-8859-1, CP1252, and UTF-16.
3. WHEN a text-based file is uploaded (CSV, TSV, TXT), THE Engine SHALL auto-detect the column separator from the set: `,`, `;`, `TAB`, and `|`.
4. IF a file format is not in the supported set, THEN THE Engine SHALL return an error message identifying the unsupported format and SHALL NOT attempt to parse the file.
5. IF encoding detection is not attempted or fails, THEN THE Engine SHALL use UTF-8 as the default encoding without requiring prior detection to have been attempted.


---

### Requirement 2: Header Normalization

**User Story:** As a developer, I want all column headers to be normalized before any mapping, so that column detection works regardless of capitalization, accents, spaces, or formatting differences across providers.

#### Acceptance Criteria

1. WHEN a file is parsed, THE Engine SHALL normalize every column header by: (a) converting to lowercase, (b) removing accent marks, (c) removing spaces, hyphens, underscores, and special characters, producing a single contiguous lowercase string.
2. THE Engine SHALL apply normalization before any alias lookup or column mapping.
3. THE Engine SHALL map normalized headers to Canonical Fields using the Alias Dictionary defined in `AliasDictionary.ts`.
4. FOR ALL header strings that differ only in casing, accents, spaces, or separators, THE Engine SHALL produce the same normalized key. For example: "Net Total", "NET TOTAL", "net_total", "Net-Total" SHALL all normalize to `"nettotal"`.
5. THE Engine SHALL perform an exact normalized match first; only if no exact match is found SHALL THE Engine attempt a partial normalized match for non-monetary fields.
6. THE Engine SHALL never apply partial matching to monetary fields (`net_total`, `gross_total`, `taxes`, `channel_costs`, `other_costs`, `currency_net_total`).


---

### Requirement 3: Provider Auto-Detection

**User Story:** As a user, I want the engine to automatically recognize which distributor generated the report, so that the correct calculation strategy is applied without manual configuration.

#### Acceptance Criteria

1. WHEN a file is uploaded, THE Engine SHALL attempt to detect the provider by examining the file name and normalized column headers.
2. THE Engine SHALL support detection of the following providers: Ditto, DistroKid, TuneCore, ONErpm, Believe, Symphonic, CD Baby, UnitedMasters, FUGA, RouteNote, Too Lost, Amuse, Spotify, Apple Music, Amazon Music, Tidal, YouTube Content ID, TikTok, and Meta.
3. IF the provider cannot be matched to a known provider, THEN THE Engine SHALL set the provider to `UNKNOWN` and SHALL continue processing using generic alias matching.
4. THE Engine SHALL log the detected provider name at the start of processing.
5. WHEN the provider is `UNKNOWN`, THE Engine SHALL log a warning indicating that a generic strategy is being used.


---

### Requirement 4: Provider Strategy and Net Total Calculation

**User Story:** As a user, I want the engine to use the correct earnings column for each distributor, so that the net total always reflects the actual payment amount as reported.

#### Acceptance Criteria

1. WHEN the provider is detected, THE Engine SHALL apply the Provider Strategy for that provider to select the earnings column, using the following priority order:
   - **Ditto**: `net_total`; also capture `currency_net_total` as a secondary field.
   - **DistroKid**: first found among `net_earnings`, `royalty_amount`, `payment`.
   - **TuneCore**: first found among `net_revenue`, `royalty_amount`, `net_amount`.
   - **ONErpm**: first found among `net_revenue`, `amount`, `royalty`.
   - **Believe**: first found among `net_amount`, `royalty`.
   - **CD Baby**: first found among `net_payable`, `net_earnings`.
   - **Symphonic**: `net_revenue`.
   - **UnitedMasters**: `royalty_amount`.
   - **Too Lost**: first found among `net_revenue`, `royalty`.
   - **RouteNote**: `net_amount`.
   - **FUGA**: `royalty_amount`.
   - **Amuse**: `net_revenue`.
   - **Spotify**: first found among `royalty`, `revenue`.
   - **Apple Music**: first found among `royalty`, `net_amount`.
   - **Amazon Music**: `royalty`.
   - **Tidal**: `royalty`.
   - **YouTube Content ID**: first found among `partner_revenue`, `net_revenue`, `royalty`.
   - **UNKNOWN**: use generic Alias Dictionary matching for `net_total`.
2. THE Engine SHALL calculate the net total by summing ONLY the values in the selected earnings column across all valid rows.
3. THE Engine SHALL NOT calculate net total by subtracting taxes or costs from gross total.
4. THE Engine SHALL NOT calculate net total by multiplying price by stream count.
5. THE Engine SHALL NOT recalculate royalty amounts derived from any formula.
6. IF the selected earnings column is not found in the file, THEN THE Engine SHALL fall back to the next column in the provider strategy list, and SHALL log a warning identifying which column was used.
7. IF no column from the provider strategy is found, THEN THE Engine SHALL fall back to generic alias matching and SHALL log an error.


---

### Requirement 5: Numeric Parsing

**User Story:** As a user, I want to upload reports with numbers formatted in any regional style, so that the engine correctly parses amounts regardless of decimal and thousands separators.

#### Acceptance Criteria

1. THE Money_Parser SHALL parse numeric strings in all of the following formats: `100`, `100.55`, `100,55`, `1,500.50`, `1.500,50`, `15 000.55`, `15 000,55`.
2. THE Money_Parser SHALL auto-remove currency symbol prefixes from numeric strings, including `$`, `€`, `£`, and currency codes `USD`, `EUR`, `COP`, `MXN`.
3. IF a cell in a monetary column contains a non-numeric value after symbol removal, THEN THE Engine SHALL treat the value as `0`, log a validation warning for that row, and SHALL continue processing.
4. THE Money_Parser SHALL correctly distinguish between a decimal comma (`1234,56`) and a thousands comma (`1,234`).
5. FOR ALL valid numeric strings, parsing then formatting then parsing SHALL produce an equivalent numeric value (round-trip property).


---

### Requirement 6: Decimal Precision

**User Story:** As a user, I want monetary values stored and calculated with high precision, so that the final totals exactly match distributor-reported totals without rounding errors.

#### Acceptance Criteria

1. THE Engine SHALL store all monetary values internally with a precision equivalent to `Decimal(20,8)` (20 significant digits, 8 decimal places).
2. THE Engine SHALL NOT use JavaScript `number` (float) for accumulating monetary totals; THE Engine SHALL use a decimal-safe accumulation strategy for summing earnings. JavaScript `number` types are permitted for non-accumulation monetary operations such as parsing individual cell values.
3. THE Engine SHALL NOT round values during internal calculation or storage.
4. WHEN displaying monetary values in the UI or Audit Report, THE Engine SHALL round to 2 decimal places for display only, and SHALL retain full precision in the stored value.


---

### Requirement 7: Row Validation

**User Story:** As a user, I want the engine to detect and report data quality issues in my report, so that I can identify corrupt or suspicious rows before relying on the totals.

#### Acceptance Criteria

1. WHEN processing each row, THE Engine SHALL detect the following validation issues: (a) empty values in required fields (`artist`, `track`, `platform`, `country`, `sale_period`, `net_total`), (b) non-numeric text in monetary columns, (c) negative values in the earnings column, (d) duplicate rows (identical values in all canonical fields), (e) rows with a currency code that differs from the file-level detected currency, (f) rows with structurally corrupt data (wrong number of columns).
2. WHEN a validation issue is detected in a row, THE Engine SHALL log the issue with the row number and a description, and SHALL continue processing the remaining rows. WHILE no validation issues are detected in a row, THE Engine SHALL NOT produce validation log entries for that row.
3. THE Engine SHALL count the total number of rows with validation errors and include this count in the Audit Report.
4. THE Engine SHALL NOT discard rows solely due to validation warnings; rows with recoverable issues SHALL be included in the output with corrected or default values.
5. IF a row is structurally corrupt (wrong column count), THEN THE Engine SHALL skip that row and log an error for it.


---

### Requirement 8: Streaming Processing for Large Files

**User Story:** As a user, I want to upload royalty reports up to 1 GB in size, so that I am not limited by the size of my distributor's export files.

#### Acceptance Criteria

1. THE Engine SHALL process files via streaming or chunked reading, and SHALL NOT load the entire file content into memory at once.
2. THE Engine SHALL support processing files of size 10 MB, 100 MB, 500 MB, and 1 GB without crashing or running out of memory in a standard browser or Node.js environment.
3. WHILE a large file is being processed, THE Engine SHALL emit progress updates at regular intervals indicating the number of rows processed so far.
4. THE Engine SHALL process rows incrementally and accumulate totals without storing all parsed rows in memory simultaneously.
5. IF a file exceeds the maximum supported size defined in the Engine configuration, THEN THE Engine SHALL reject the file before reading it and SHALL return a descriptive error message.


---

### Requirement 9: Statistics Calculation

**User Story:** As a user, I want a comprehensive breakdown of my royalties after import, so that I can understand earnings by artist, song, platform, country, and time period.

#### Acceptance Criteria

1. AFTER processing all rows, THE Engine SHALL compute and return the following aggregate statistics: Total Neto, Total Bruto, Impuestos, Costos de Canal, Otros Costos, total Streams, total Downloads, total Records, unique Songs, unique Artists, unique Albums, unique Platforms, unique Countries, unique ISRCs, and unique UPCs.
2. THE Engine SHALL compute and return Top Artists, Top Songs, Top Albums, Top Platforms, and Top Countries, each ranked by net total descending, returning up to 20 entries per list.
3. THE Engine SHALL compute Revenue by Month as a list of `{ month: string, net: number }` objects sorted by month ascending, where the month key is in `YYYY-MM` format.
4. THE Engine SHALL include the total row count, error count, detected currency, and detected provider in the statistics output.
5. THE Engine SHALL compute all aggregate statistics without modifying the precision of individual row values.


---

### Requirement 10: Audit Report

**User Story:** As a user, I want to see a full audit report after each import, so that I can verify the import was processed correctly and review key metadata.

#### Acceptance Criteria

1. AFTER each file is successfully imported, THE Engine SHALL generate an Audit Report containing: detected Provider, original File Name, Reported Month, Year, Currency, total Rows read, total Columns detected, Gross Total, Taxes, Channel Costs, Other Costs, Net Total, import Status, and Processing Time in milliseconds.
2. THE Engine SHALL mark the import Status as `valid` only if the calculated net total exactly matches the sum of the earnings column for all included rows.
3. IF the calculated net total does not match the expected sum, THEN THE Engine SHALL mark the import Status as `discrepancy` and SHALL NOT mark the import as valid until the discrepancy is reviewed.
4. THE Engine SHALL persist the Audit Report data to the `reports` table in Supabase upon import completion.
5. THE Engine SHALL display the Audit Report to the user in the UI after the import completes.


---

### Requirement 11: Debug Mode

**User Story:** As a user, I want a "Ver Auditoría" debug view after importing, so that I can inspect exactly how the engine detected columns, read rows, and calculated the total.

#### Acceptance Criteria

1. THE Upload_Page SHALL display a "Ver Auditoría" button after a successful or discrepant import.
2. WHEN the user activates Debug Mode, THE Engine SHALL display: (a) the detected Provider name, (b) all detected Canonical Field-to-column mappings, (c) the specific column name used for net total calculation, (d) the first 20 data rows as read from the file, (e) the last 20 data rows as read from the file, (f) the accumulated net total, and (g) a list of all validation errors found.
3. IF the calculated total does not match the expected total, THEN Debug Mode SHALL indicate exactly which column was used and show a breakdown of how the result was obtained.
4. THE Engine SHALL capture all debug data during processing and make it available without re-reading the file.


---

### Requirement 12: Import History

**User Story:** As a user, I want a persistent history of all my imports, so that I can track what reports have been processed and review past results.

#### Acceptance Criteria

1. AFTER each import attempt (successful or failed), THE Engine SHALL save an Import History record to Supabase containing: File Name, User ID, detected Provider, import Date and Time (UTC), Currency, Net Total, Record Count, and import Status.
2. THE Engine SHALL associate each Import History record with the authenticated user via `user_id`.
3. WHEN a user views their Import History, THE Engine SHALL return only the records belonging to the authenticated user.
4. THE Engine SHALL store the Import History in the existing `reports` table with the additional V2 metadata fields, or in a dedicated `import_history` table if the schema requires it.
5. IF the import fails before completion, THEN THE Engine SHALL save the Import History record with Status `error` and include an error description.


---

### Requirement 13: Currency Detection

**User Story:** As a user, I want the engine to automatically detect the currency of my report, so that totals are always displayed with the correct currency code.

#### Acceptance Criteria

1. WHEN a file is parsed, THE Currency_Detector SHALL scan the file content and headers to detect the currency code.
2. THE Currency_Detector SHALL recognize the following currency codes: USD, EUR, GBP, CAD, AUD, JPY, MXN, COP, BRL, CHF, SEK, NOK, DKK.
3. THE Currency_Detector SHALL also detect currency from symbols: `$` → USD, `€` → EUR, `£` → GBP.
4. IF multiple different currency codes are detected across rows, THEN THE Engine SHALL log a validation warning for each row with a differing currency and SHALL use the most frequently occurring currency as the file-level currency.
5. IF no currency is detected, THEN THE Currency_Detector SHALL force the currency to USD, log a warning that no currency was detected and USD is being used as the default, and SHALL apply USD regardless of any other inferred values.


---

### Requirement 14: Database Persistence

**User Story:** As a user, I want all royalty records from my import to be saved to the database, so that I can query and analyze them later through the reports and dashboard views.

#### Acceptance Criteria

1. AFTER a successful import, THE Engine SHALL insert all valid parsed rows into the `royalty_records` table in Supabase.
2. THE Engine SHALL insert rows in parallel batches of up to 1,000 records with a concurrency of up to 5 simultaneous batch inserts.
3. WHILE batch inserts are in progress, THE Engine SHALL emit progress updates indicating the number of records saved.
4. IF a batch insert fails, THEN THE Engine SHALL update the corresponding `reports` record status to `error` with the error message and SHALL stop further inserts.
5. THE Engine SHALL store the following fields per record: `report_id`, `user_id`, `sale_period`, `store` (platform), `country`, `artist_name`, `song_title`, `album_name`, `quantity`, `earnings_usd`.
6. THE Engine SHALL apply Row Level Security so that each user can only read and write their own records.


---

### Requirement 15: Upload Pipeline and UI

**User Story:** As a user, I want a clear step-by-step upload experience, so that I know what is happening at each stage of the import process.

#### Acceptance Criteria

1. THE Upload_Page SHALL guide the user through the following sequential steps: (a) file selection via drag-and-drop or file picker, (b) period detection and selection, (c) processing and saving, (d) results display with Audit Report.
2. WHILE the Engine is processing a file, THE Upload_Page SHALL display a progress indicator and a human-readable status message.
3. THE Upload_Page SHALL accept files with extensions `.csv`, `.xls`, `.xlsx`, `.tsv`, `.txt`, and `.ods` via the file picker and drag-and-drop zone.
4. WHEN processing completes successfully, THE Upload_Page SHALL display the Audit Report summary and a "Ver Auditoría" button to enter Debug Mode.
5. IF processing fails at any step, THE Upload_Page SHALL display a clear error message and a button to retry the upload.
6. THE Upload_Page SHALL allow the user to cancel and reset to the initial state from any step before the insert phase begins. WHILE a batch insert is in progress, THE Upload_Page SHALL NOT allow the user to cancel the operation.


---

### Requirement 16: Header Row Detection

**User Story:** As a developer, I want the engine to automatically find the correct header row in files that may contain metadata rows above the actual data, so that column mapping is always accurate regardless of file layout.

#### Acceptance Criteria

1. WHEN a file is parsed, THE Header_Finder SHALL scan the first 20 rows to identify the row most likely to contain column headers.
2. THE Header_Finder SHALL select the header row as the row with the highest number of recognized Canonical Field aliases after normalization.
3. IF no row in the first 20 rows matches any known alias, THEN THE Header_Finder SHALL use row 0 as the header row and log a warning.
4. THE Engine SHALL treat all rows after the detected header row as data rows. WHEN the header row is detected at row 0, THE Engine SHALL treat rows starting from row 1 as data rows.


---

### Requirement 17: Logging and Processing Log

**User Story:** As a user, I want to see a processing log after import, so that I can understand what decisions the engine made and identify any warnings or errors.

#### Acceptance Criteria

1. THE Logger SHALL capture all INFO, WARN, and ERROR level messages produced during a single import processing run.
2. THE Engine SHALL include the full processing log in the `RUPEStats` structure returned after parsing.
3. THE Upload_Page SHALL display the processing log in a collapsible section after a successful import, with ERROR entries highlighted in red and WARN entries highlighted in yellow.
4. THE Logger SHALL prefix each log entry with its level tag: `[INFO]`, `[WARN]`, or `[ERROR]`.
5. AFTER processing completes, THE Logger SHALL emit a summary line indicating total rows processed, rows skipped, and total errors encountered.


---

### Requirement 18: ODS File Support

**User Story:** As a user, I want to upload OpenDocument Spreadsheet (ODS) files, so that I can import reports exported from LibreOffice or other open-source tools.

#### Acceptance Criteria

1. THE Engine SHALL parse `.ods` files using a library compatible with the OpenDocument Spreadsheet format.
2. WHEN an ODS file is uploaded, THE Engine SHALL extract cell values as strings for text fields and as numbers for numeric fields, using the same normalization pipeline as XLS/XLSX files.
3. IF an ODS file contains multiple sheets, THE Engine SHALL select the sheet with the most data rows, consistent with the existing XLS/XLSX multi-sheet behavior.


---

### Requirement 19: Backward Compatibility

**User Story:** As a developer, I want V2.0 to be a drop-in replacement for V1, so that existing upload flows and database records are not broken by the upgrade.

#### Acceptance Criteria

1. THE Engine SHALL continue to export `parseFile`, `RUPEStats`, `ParsedRow`, and `RUPEResult` from `src/royalty-engine/index.ts` with the same signatures as V1.
2. THE Engine SHALL continue to populate `ParsedRow` with the `artist_name`, `song_title`, `album_name`, `store`, and `earnings_usd` alias fields for backward compatibility with `UploadPage.tsx` inserts.
3. THE Engine SHALL remain compatible with the existing `royalty_records` schema in `supabase/schema.sql` without requiring breaking schema changes.
4. WHERE new database columns are required for V2 features (Audit Report metadata, Import History), THE Engine SHALL add them via additive schema migrations that do not alter or drop existing columns. THE Engine SHALL prohibit any modification to existing columns, even when new features would benefit from such changes.

