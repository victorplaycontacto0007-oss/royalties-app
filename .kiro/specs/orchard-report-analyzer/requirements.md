# Requirements Document

## Introduction

Este documento define los requisitos para ampliar la aplicación de royalties con la capacidad de leer, clasificar y analizar reportes de ingresos provenientes de The Orchard con total fidelidad al reporte original.

La aplicación actualmente puede importar reportes de múltiples distribuidoras y sumar streams y revenue. El objetivo es transformarla en un verdadero analizador de royalties que pueda responder preguntas detalladas sobre tipos de stream, plataformas, países, artistas, canciones y releases, sin inventar ni inferir datos que no estén en el reporte original.

## Glossary

| Término | Definición |
|---|---|
| **FULL_PAY** | Stream de suscripción de pago (Premium, Paid, Subscription, Full Pay) |
| **FREE_AD_SUPPORTED** | Stream gratuito con publicidad (Ad-Supported, Free, AVOD) |
| **FREE_TRIAL** | Stream de prueba gratuita, solo cuando el reporte lo identifica explícitamente |
| **UNQUALIFIED** | Stream que no cumplió criterios de calidad (no genera royalty) |
| **FRAUDULENT** | Stream identificado como fraudulento o artificial |
| **OTHER** | Categoría de stream presente en el reporte pero que no encaja en las anteriores |
| **UNKNOWN** | El reporte no proporciona información suficiente para clasificar el stream |
| **Tipo de stream original** | El valor literal tal como aparece en el reporte de The Orchard |
| **Tipo de stream normalizado** | La categoría interna asignada por la aplicación (ej: FULL_PAY) |
| **Registro original** | Una fila individual del archivo importado, conservada sin modificaciones |
| **Métrica derivada** | Cualquier suma, promedio o agregado calculado a partir de registros originales |
| **Promedio efectivo por 1.000 streams** | (Revenue / Streams) × 1.000, mostrado solo cuando Streams > 0 |
| **Streams monetizables** | Streams de categorías FULL_PAY y FREE_AD_SUPPORTED con revenue > 0 |
| **Streams sin royalty** | Streams con revenue = 0, independientemente de su categoría |

## Requirements

### Requirement 1: Importar y preservar el reporte original sin alteraciones

**User Story:** As an administrador de royalties, I want importar el reporte de The Orchard conservando cada fila como un registro individual, so that pueda auditar cualquier cifra regresando al dato original.

#### Acceptance Criteria

1. WHEN el usuario sube un archivo de The Orchard en formato TSV, CSV o XLSX, THEN the system SHALL almacenar internamente cada fila del archivo como un registro individual con: índice de fila original, nombre del archivo fuente, y todos los valores de columna sin modificar.
2. WHEN la aplicación normaliza los datos, THEN the system SHALL asignar un `rowIndex` secuencial único por archivo que permita localizar el registro en el archivo fuente.
3. THE system SHALL never combinar dos filas en un solo registro, aunque tengan idénticos valores de artista, canción, país y plataforma.
4. WHEN se calculan métricas derivadas (totales, promedios, rankings), THEN the system SHALL generarlas a partir de los registros individuales almacenados, no de subtotales previos.
5. THE system SHALL conservar el valor original del tipo de stream exactamente como aparece en el reporte, junto con el tipo normalizado asignado.

### Requirement 2: Detección automática de columnas del reporte de The Orchard

**User Story:** As an administrador, I want que la aplicación detecte automáticamente las columnas del reporte aunque The Orchard cambie los nombres entre periodos, so that no tenga que configurar manualmente cada importación.

#### Acceptance Criteria

1. WHEN se importa un archivo de The Orchard, THEN the system SHALL detectar automáticamente las columnas equivalentes a: Platform/DSP/Service/Store, Country/Territory, Quantity/Units/Streams, Revenue/Net Revenue/Gross Revenue, Transaction Type/Usage Type/Stream Type/Subscription Type, Artist, Track/Song, Release/Album/Product, Label/Imprint, ISRC, UPC, Release ID, Date/Period, Currency.
2. WHEN una columna no existe en el archivo importado, THEN the system SHALL dejar ese campo como `null` en el registro y SHALL NOT inventar ni inferir valores para ese campo.
3. WHEN el archivo contiene columnas desconocidas, THEN the system SHALL registrarlas como "no mapeadas" en el log de importación.
4. THE system SHALL extender el `AliasDictionary` existente con aliases específicos de The Orchard para el campo `transaction_type`: ["transaction type", "usage type", "stream type", "subscription type", "transaction type description", "play type", "stream category"].
5. WHEN el archivo de The Orchard contiene una columna de tipo de stream, THEN the system SHALL mapearla al campo canónico `transaction_type` y utilizarla como fuente primaria para la clasificación.

### Requirement 3: Clasificación de streams en categorías normalizadas

**User Story:** As an administrador, I want que la aplicación clasifique cada stream en su categoría correcta (Full Pay, Free, Free Trial, Unqualified, Fraudulent), so that pueda saber exactamente qué tipo de reproducción generó cada ingreso.

#### Acceptance Criteria

1. WHEN el valor del campo `transaction_type` de un registro contiene cualquiera de: "Subscription Audio Streams", "Premium", "Paid Subscription", "Full Pay", "Subscription", "Paid", THEN the system SHALL asignar la categoría normalizada `FULL_PAY`.
2. WHEN el valor del campo `transaction_type` contiene cualquiera de: "Ad-Supported Audio Streams", "Ad Supported", "Free", "AVOD", "Ad-Supported", THEN the system SHALL asignar `FREE_AD_SUPPORTED`.
3. WHEN el valor del campo `transaction_type` contiene cualquiera de: "Free Trial", "Trial", "Trial Subscription", "Promotional Trial", THEN the system SHALL asignar `FREE_TRIAL`. IF el reporte no contiene ningún registro con estos valores, THEN the system SHALL mostrar "Free Trial: No identificado en el reporte".
4. THE system SHALL NEVER clasificar un registro como `FREE_TRIAL` basándose en que su revenue es cero, su país de origen, o que tenga categoría `FREE_AD_SUPPORTED`. `FREE_AD_SUPPORTED` y `FREE_TRIAL` son categorías mutuamente excluyentes.
5. WHEN el valor del campo `transaction_type` contiene cualquiera de: "Unqualified Audio Streams", "Unqualified Streams", "Non-qualified", "No Qualifying Streams", "Unqualified", THEN the system SHALL asignar `UNQUALIFIED`.
6. WHEN el valor del campo `transaction_type` contiene cualquiera de: "Fraudulent Streams", "Fraud", "Artificial Streams", "Invalid Streams", "Fraudulent", THEN the system SHALL asignar `FRAUDULENT`. THE system SHALL NEVER combinar registros `FRAUDULENT` con registros `UNQUALIFIED`.
7. WHEN no existe campo `transaction_type` en el reporte o cuando el valor no coincide con ninguna categoría conocida, THEN the system SHALL asignar `UNKNOWN` y mostrar el valor original del campo como referencia.
8. WHEN existen valores de `transaction_type` no mapeados a ninguna categoría estándar, THEN the system SHALL asignar `OTHER` y conservar el valor original en todos los totales y reconciliaciones.
9. THE classification SHALL basarse únicamente en el campo `transaction_type` del reporte. THE system SHALL NOT inferir la categoría a partir del revenue, el país, la plataforma ni ningún otro campo.

### Requirement 4: Distinción entre Total Streams y subcategorías

**User Story:** As an administrador, I want que la aplicación distinga claramente entre streams totales y cada subcategoría, so that no se reporte incorrectamente que todos los streams fueron pagados.

#### Acceptance Criteria

1. THE system SHALL calcular y mostrar de forma diferenciada: Total Streams, Streams FULL_PAY, Streams FREE_AD_SUPPORTED, Streams FREE_TRIAL (si existe en el reporte), Streams UNQUALIFIED, Streams FRAUDULENT, Streams OTHER, Streams UNKNOWN.
2. WHEN se muestra el total de streams de una plataforma, THEN the system SHALL mostrar la suma de todas las categorías, no solo las pagadas.
3. THE system SHALL mostrar "Streams monetizables" como la suma de FULL_PAY + FREE_AD_SUPPORTED con revenue > 0, diferenciado del total.
4. WHEN se calcula revenue por categoría, THEN the system SHALL calcularlo solo a partir de los registros de esa categoría sin mezclar revenue de UNQUALIFIED o FRAUDULENT con FULL_PAY.

### Requirement 5: Análisis por plataforma con desglose por tipo de stream

**User Story:** As an administrador, I want ver un resumen por plataforma que incluya cada tipo de stream y su revenue correspondiente, so that pueda evaluar el rendimiento de cada DSP.

#### Acceptance Criteria

1. WHEN se visualiza el análisis por plataforma, THEN the system SHALL mostrar para cada plataforma: nombre, total streams, streams por cada categoría, revenue total y revenue por categoría.
2. THE system SHALL ONLY mostrar plataformas presentes en el archivo importado. SHALL NOT crear plataformas ficticias.
3. WHEN una plataforma no tiene una categoría de stream determinada, THEN the system SHALL mostrar 0 para esa categoría, excepto FREE_TRIAL que mostrará "No identificado" si no existe en el reporte.
4. WHEN se muestra el "Promedio efectivo por 1.000 streams", THEN the system SHALL calcularlo solo cuando el divisor de streams sea mayor que 0 y usará la etiqueta "Promedio efectivo según este reporte".

### Requirement 6: Análisis por país dentro de cada plataforma

**User Story:** As an administrador, I want ver el desglose por país dentro de cada plataforma, so that pueda saber exactamente qué mercados generaron qué tipo de streams y qué revenue.

#### Acceptance Criteria

1. THE system SHALL mostrar, para cada combinación plataforma-país presente en el reporte: total streams, streams por categoría, revenue total y revenue por categoría.
2. WHEN el campo `country` contiene un código ISO de 2 letras, THEN the system SHALL expandirlo al nombre completo del país usando el diccionario de códigos existente.
3. THE system SHALL ONLY mostrar países que aparezcan en el archivo importado. SHALL NOT crear filas para países sin datos.
4. WHEN el usuario navega a una plataforma específica, THEN the system SHALL mostrar la lista completa de países con sus métricas.

### Requirement 7: Matriz País × Tipo de Stream

**User Story:** As an administrador, I want una tabla que muestre plataforma, país y todos los tipos de stream en columnas separadas, so that pueda comparar mercados de un vistazo.

#### Acceptance Criteria

1. THE system SHALL mostrar una tabla con las columnas: Plataforma, País, Total Streams, FULL_PAY, FREE_AD_SUPPORTED, FREE_TRIAL, UNQUALIFIED, FRAUDULENT, Revenue.
2. WHEN FREE_TRIAL no está identificado en el reporte, THEN the column SHALL mostrar "N/I" (No Identificado) en lugar de 0.
3. THE table SHALL ser filtrable y ordenable por cualquier columna numérica.
4. THE table SHALL incluir una fila de totales al final que sume cada columna numérica.

### Requirement 8: Análisis de ingresos por plataforma y categoría

**User Story:** As an administrador, I want calcular el revenue por stream y por 1.000 streams para cada plataforma y categoría, so that pueda comparar el valor efectivo de cada tipo de reproducción.

#### Acceptance Criteria

1. WHEN se muestra el análisis de ingresos, THEN the system SHALL calcular: revenue total, revenue por categoría, revenue por stream (Revenue / Streams), revenue por 1.000 streams ((Revenue / Streams) × 1.000).
2. WHEN el divisor de streams sea igual a 0, THEN the system SHALL NOT mostrar ese cálculo y SHALL mostrar "N/A".
3. THE label del promedio por 1.000 streams SHALL ser siempre "Promedio efectivo según este reporte". THE system SHALL NOT llamarlo "tarifa oficial" ni ningún término que implique valor contractual fijo.
4. THE cálculo de promedio SHALL excluir registros UNQUALIFIED y FRAUDULENT, mostrándolos por separado como "sin royalty".

### Requirement 9: Análisis por artista, canción y release

**User Story:** As an administrador, I want navegar los datos en jerarquía artista → plataforma → país → tipo de stream y también canción → plataforma → país → tipo de stream, so that pueda responder preguntas sobre el rendimiento de cada catálogo.

#### Acceptance Criteria

1. WHEN se visualiza el análisis por artista, THEN the system SHALL mostrar: total streams, revenue, y desglose por plataforma → país → tipo de stream con cantidad y revenue.
2. WHEN se visualiza el análisis por canción, THEN the system SHALL mostrar: nombre de la canción, artista, ISRC (si existe), y desglose por plataforma → país → tipo de stream.
3. WHEN se visualiza el análisis por release, THEN the system SHALL mostrar: nombre del release, artista, UPC (si existe), y desglose por plataforma → país → tipo de stream.
4. THE jerarquía principal SHALL ser: REPORTE → PLATAFORMA → PAÍS → ARTISTA → RELEASE → CANCIÓN → TIPO DE STREAM → CANTIDAD → REVENUE.
5. THE jerarquía inversa SHALL también estar disponible: PLATAFORMA → PAÍS → TIPO DE STREAM → ARTISTA → CANCIÓN → REGISTROS ORIGINALES.

### Requirement 10: Detección y reporte de streams sin royalty

**User Story:** As an administrador, I want que la aplicación identifique claramente los streams que no generaron revenue separados por categoría, so that pueda explicar por qué ciertos streams no produjeron ingresos.

#### Acceptance Criteria

1. WHEN existen registros con `revenue = 0` o `revenue < 0`, THEN the system SHALL NOT eliminarlos ni ignorarlos.
2. THE system SHALL mostrar una sección "Streams registrados sin royalty" con: streams UNQUALIFIED con revenue = 0, streams FRAUDULENT con revenue = 0, streams FREE_AD_SUPPORTED con revenue = 0, streams FREE_TRIAL con revenue = 0, streams UNKNOWN con revenue = 0.
3. WHEN se muestran streams sin royalty, THEN the system SHALL distinguir la causa: UNQUALIFIED (no calificó), FRAUDULENT (fraude detectado), FREE_AD_SUPPORTED (categoría no monetizada), u OTRAS categorías con revenue cero.
4. THE sección de streams sin royalty SHALL incluir el conteo de streams y la plataforma/país de origen.

### Requirement 11: Reconciliación matemática de streams

**User Story:** As an administrador, I want que la aplicación verifique que la suma de todas las categorías coincida con el total de streams, so that pueda detectar si hay registros sin clasificar.

#### Acceptance Criteria

1. WHEN se completa la importación de un archivo, THEN the system SHALL calcular automáticamente: Total Streams importados vs (FULL_PAY + FREE_AD_SUPPORTED + FREE_TRIAL + UNQUALIFIED + FRAUDULENT + OTHER + UNKNOWN).
2. WHEN la diferencia entre el total y la suma de categorías sea distinta de cero, THEN the system SHALL mostrar una alerta: "Existen [N] streams no clasificados" indicando exactamente cuántos registros quedaron sin categoría.
3. THE reconciliación SHALL realizarse por plataforma y también a nivel global del reporte.
4. THE system SHALL NEVER ocultar ni ajustar silenciosamente la diferencia de reconciliación.

### Requirement 12: Reconciliación matemática de revenue

**User Story:** As an administrador, I want que la aplicación verifique que la suma del revenue por categorías coincida con el revenue total del reporte, so that pueda detectar discrepancias de cálculo.

#### Acceptance Criteria

1. WHEN se completa la importación, THEN the system SHALL calcular: Revenue total importado vs (Revenue FULL_PAY + Revenue FREE_AD_SUPPORTED + Revenue FREE_TRIAL + Revenue UNQUALIFIED + Revenue FRAUDULENT + Revenue OTHER + Revenue UNKNOWN).
2. WHEN la diferencia sea mayor que $0.01 (tolerancia de redondeo), THEN the system SHALL mostrar una advertencia con el monto exacto de la discrepancia.
3. THE reconciliación de revenue SHALL realizarse por plataforma y a nivel global.
4. THE system SHALL NEVER modificar valores de revenue para forzar la coincidencia.

### Requirement 13: Dashboard principal con rankings

**User Story:** As an administrador, I want un dashboard con resumen global del reporte y rankings de plataformas, países, artistas y canciones, so that pueda tener una visión rápida del periodo.

#### Acceptance Criteria

1. THE dashboard SHALL mostrar en totales globales: total streams, total revenue, streams por cada categoría normalizada.
2. THE dashboard SHALL mostrar un ranking de plataformas ordenado por revenue descendente con: nombre, total streams, revenue, streams por categoría.
3. THE dashboard SHALL mostrar un ranking de países ordenado por revenue descendente con: nombre del país, total streams, revenue, FULL_PAY, FREE_AD_SUPPORTED, UNQUALIFIED, FRAUDULENT.
4. THE dashboard SHALL mostrar un ranking de artistas y canciones ordenados por revenue descendente con los mismos campos.
5. WHEN el periodo del reporte no está unificado, THEN the dashboard SHALL mostrar el rango de fechas cubierto.

### Requirement 14: Filtros combinables

**User Story:** As an administrador, I want poder filtrar los datos por múltiples dimensiones simultáneamente, so that pueda responder preguntas específicas como "streams Full Pay de Spotify en Estados Unidos".

#### Acceptance Criteria

1. THE system SHALL permitir filtrar por: periodo/mes, plataforma, país, artista, canción, release, ISRC, UPC, tipo de stream normalizado, tipo de stream original (valor literal del reporte).
2. WHEN se aplican múltiples filtros, THEN the system SHALL aplicarlos con lógica AND (todos los filtros deben cumplirse simultáneamente).
3. WHEN se aplica un filtro de plataforma + país + tipo de stream, THEN the system SHALL devolver únicamente los registros que cumplan las tres condiciones exactamente.
4. THE system SHALL actualizar todas las métricas visibles en tiempo real al modificar un filtro.
5. WHEN los filtros están activos, THEN the system SHALL mostrar un indicador visible de los filtros aplicados y un botón "Limpiar filtros".

### Requirement 15: Drill-down a registros originales para auditoría

**User Story:** As an administrador, I want poder hacer clic en cualquier métrica y ver los registros originales del reporte que la componen, so that pueda auditar cualquier cifra hasta el dato fuente.

#### Acceptance Criteria

1. WHEN el usuario hace clic en una métrica, THEN the system SHALL mostrar una vista de detalle con los registros originales del archivo que conforman esa cifra.
2. THE vista de detalle SHALL mostrar para cada registro: índice de fila original, nombre del archivo fuente, todos los campos detectados del registro, tipo de stream original y normalizado.
3. THE vista de detalle SHALL indicar el total de registros que componen la métrica seleccionada.
4. WHEN la vista de detalle está abierta, THEN the system SHALL permitir exportar esos registros específicos como CSV.
5. THE trazabilidad SHALL funcionar para: totales de plataforma, totales de país, totales de artista, totales de canción, totales por tipo de stream, y cualquier combinación de filtros activos.

### Requirement 16: Regla de no-suposición en clasificaciones

**User Story:** As an administrador, I want que la aplicación nunca invente una clasificación que no esté en el reporte, so that los datos sean completamente confiables.

#### Acceptance Criteria

1. THE system SHALL NEVER inferir el tipo de stream a partir del revenue, el país de origen, la plataforma, el nombre del artista ni ningún campo que no sea el campo de tipo de stream del reporte.
2. WHEN el campo de tipo de stream no existe o está vacío, THEN the system SHALL asignar `UNKNOWN` y mostrar "Tipo de stream no identificado".
3. WHEN el tipo de stream tiene un valor presente en el reporte pero no coincide con ninguna categoría conocida, THEN the system SHALL asignar `OTHER` y mostrar el valor original sin modificarlo.
4. THE system SHALL NEVER asumir que un stream de Spotify es Premium si el reporte no lo especifica.
5. THE system SHALL NEVER asumir que un stream con revenue = 0 es Free Trial si el reporte no lo identifica así.

### Requirement 17: Compatibilidad con diferentes reportes y periodos

**User Story:** As an administrador, I want que la aplicación funcione correctamente con cualquier reporte de The Orchard, so that no tenga que adaptar manualmente cada importación.

#### Acceptance Criteria

1. WHEN se importan reportes de diferentes periodos, THEN the system SHALL preservar el periodo de cada registro y SHALL permitir filtrar por periodo.
2. THE sistema de detección de columnas SHALL funcionar correctamente aunque el reporte incluya plataformas distintas entre periodos.
3. WHEN un reporte contiene columnas adicionales no conocidas, THEN the system SHALL importarlas como campos extra sin fallar la importación.
4. THE system SHALL soportar importación de múltiples archivos de The Orchard de diferentes periodos, acumulando los registros sin mezclar los datos.
5. WHEN se importan múltiples archivos, THEN el campo `sourceFile` de cada registro SHALL conservar el nombre del archivo de origen.

### Requirement 18: Trazabilidad completa de cada cifra

**User Story:** As an administrador, I want que cada cifra del dashboard pueda rastrearse hasta los registros originales del reporte, so that pueda responder preguntas de auditoría con exactitud.

#### Acceptance Criteria

1. WHEN se almacena un registro importado, THEN the system SHALL guardar internamente: `sourceFile`, `rowIndex`, `platform`, `country`, `artist`, `track`, `release`, `rawStreamType`, `normalizedStreamType`, `quantity`, `revenue`, `salePeriod`.
2. WHEN se calcula cualquier métrica derivada, THEN the system SHALL mantener la referencia a los `rowIndex` de los registros que la componen.
3. THE system SHALL poder responder "¿de dónde salen estos N streams?" mostrando los registros exactos con su fila de origen.
4. WHEN un registro no pudo ser clasificado, THEN the system SHALL incluirlo en el log de importación con su `rowIndex` y el valor original del tipo de stream.
