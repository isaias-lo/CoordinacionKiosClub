# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-13
Último commit: (pendiente — bye para commitear)
Rama: inicio

## Archivos modificados recientemente
supabase/migrations/044_pionetas.sql (NUEVO)
src/features/despacho/rutas/data/flota.ts
src/features/despacho/rutas/components/FlotaGrid.tsx
src/features/despacho/rutas/components/InputSection.tsx
src/features/despacho/rutas/RutasScreen.tsx
src/features/despacho/rutas/utils/sheets.ts
src/app/api/despacho-records/route.ts
src/app/api/sheets-write/route.ts
src/features/despacho/santiago/utils/sheetsSantiago.ts
src/features/despacho/regiones/utils/sheetsRegiones.ts

## En progreso
Pionetas implementados. Pendiente paso manual: agregar encabezados en Google Sheets.

## Próximos pasos (manuales)
1. En DESPACHO RM: escribir en AA1=PIONETA 1, AB1=PIONETA 2, AC1=FECHA ARMADO
2. En DESPACHO REGIONES: ídem AA1, AB1, AC1
3. Commit + push de todos los cambios (comando bye)

## Tests pendientes
- Asignar pioneta en VehicleCard → Guardar flota → recargar → persiste
- Registrar rutas → DESPACHO RM col AA=PIONETA 1, AB=PIONETA 2 correctos
- Verificar que col AC (FECHA ARMADO) no es pisada por el Enrutador
