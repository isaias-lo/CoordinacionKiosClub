-- ============================================================
-- 054 — Migración de datos: código de tienda 37VIN → 37VIÑ (Viña del Mar)
-- Alinea el código con Odoo y el catálogo, igual que se hizo con 23PEN→23PEÑ.
-- El código de la app ya usa "37VIÑ" como canónico; esto actualiza los datos
-- existentes para que no queden referencias a "37VIN".
-- NOTA: el `id` canónico histórico (que embebe el cod) NO se migra — es solo
-- identificador; el matching/semaforo usa la columna `cod`/`store_cod`.
-- ============================================================

UPDATE despacho_rm            SET cod          = '37VIÑ' WHERE cod          = '37VIN';
UPDATE despacho_regiones      SET cod          = '37VIÑ' WHERE cod          = '37VIN';
UPDATE tiendas                SET codigo       = '37VIÑ' WHERE codigo       = '37VIN';
UPDATE ruta_guias             SET store_cod    = '37VIÑ' WHERE store_cod    = '37VIN';
UPDATE guias_subidas          SET store_cod    = '37VIÑ' WHERE store_cod    = '37VIN';
UPDATE ruta_tiendas           SET store_cod    = '37VIÑ' WHERE store_cod    = '37VIN';
UPDATE trazabilidad_unidades  SET codigo_tienda= '37VIÑ' WHERE codigo_tienda= '37VIN';
UPDATE recepcion              SET cod          = '37VIÑ' WHERE cod          = '37VIN';
UPDATE tiendas_adelanto       SET store_cod    = '37VIÑ' WHERE store_cod    = '37VIN';

-- Calendario central (blob JSON): reemplazar "37VIN" por "37VIÑ" en el array costa.
UPDATE calendario_central
SET data = REPLACE(data::text, '"37VIN"', '"37VIÑ"')::jsonb
WHERE data::text LIKE '%"37VIN"%';

-- (Opcional / autoregenerable) datos de picking del día — se rehacen solos cada
-- jornada, pero se pueden migrar para no ver residuos hoy:
-- UPDATE picking_pallets        SET store_cod = '37VIÑ' WHERE store_cod = '37VIN';
-- UPDATE picking_eventos        SET store_cod = '37VIÑ' WHERE store_cod = '37VIN';
-- UPDATE picking_pallets        SET state_key = REPLACE(state_key, '37VIN__', '37VIÑ__') WHERE state_key LIKE '37VIN__%';
-- UPDATE picking_session_state  SET state_key = REPLACE(state_key, '37VIN__', '37VIÑ__') WHERE state_key LIKE '37VIN__%';
-- UPDATE picking_prints         SET state_key = REPLACE(state_key, '37VIN__', '37VIÑ__') WHERE state_key LIKE '37VIN__%';
