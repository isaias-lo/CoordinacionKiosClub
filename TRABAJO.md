# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-13
Último commit: WIP: auto-save antes de compactar contexto
Rama: inicio

## Archivos modificados recientemente
TRABAJO.md
supabase/migrations/044_pionetas.sql
supabase/migrations/045_canonical_id.sql
src/types.ts
src/features/despacho/santiago/types/index.ts
src/features/despacho/santiago/steps/StepForm.tsx
src/features/despacho/regiones/pages/TiendasPage.tsx
src/features/despacho/santiago/utils/sheetsSantiago.ts
src/features/despacho/regiones/utils/sheetsRegiones.ts
src/app/api/sheets-write/route.ts
src/app/api/despacho-records/route.ts
src/features/despacho/rutas/RutasScreen.tsx
src/features/despacho/rutas/components/FlotaGrid.tsx
src/features/despacho/rutas/components/InputSection.tsx
src/features/despacho/rutas/data/flota.ts
src/features/despacho/rutas/utils/sheets.ts

## Implementado en esta sesión
### Pionetas
- Interfaz Vehiculo con p1/p2
- FlotaGrid: inputs Pioneta 1 y Pioneta 2 en VehicleCard activo
- InputSection, RutasScreen: handler handlePionetaChange
- Enrutador: escribe PIONETA 1 (AA) y PIONETA 2 (AB) en Sheets via batchUpdate selectivo
- API despacho-records PATCH: guarda pioneta_1, pioneta_2 en Supabase
- Migración 044_pionetas.sql: columnas pioneta_1, pioneta_2 en despacho_rm y despacho_regiones

### Canonical ID
- SantiagoItem y DispatchItem: nuevo campo canonical_id?
- StepForm.tsx y TiendasPage.tsx: en saveRow(), busca canonical_id en pickingSlotsFull y lo copia al item
- sheetsSantiago.ts y sheetsRegiones.ts: buildRows escribe canonical_id en índice [29] = columna AD
- sheets-write/route.ts: toRmRecord y toRegionesRecord leen row[29] como canonical_id; Supabase update incluye canonical_id
- Migración 045_canonical_id.sql: columna canonical_id en despacho_rm y despacho_regiones (APLICADA)

## Pendiente paso manual
1. En DESPACHO RM: verificar/agregar encabezados AA1=PIONETA 1, AB1=PIONETA 2, AC1=FECHA ARMADO, AD1=CÓDIGO
2. En DESPACHO REGIONES: ídem AA1, AB1, AC1, AD1
3. Commit + push (comando bye)
