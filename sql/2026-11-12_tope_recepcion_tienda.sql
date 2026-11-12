-- [BODEGA] Cuántos pallets aguanta recibir cada tienda.
--
-- Hay locales donde el muelle, el ascensor o la bodega no dan para más de tres o cuatro pallets.
-- El coordinador tenía ese número en una lista impresa y Bodega no lo sabía: se armaban los
-- pallets sin saber cuántos entran. Esta columna lo trae a la pantalla donde se decide.
--
-- ── NULL ES «SIN TOPE», Y NO ES CERO ──────────────────────────────────────────────────────────
--
-- 25 tiendas de Región, cuatro de RM que la lista no trae (35BN2, 62PLD, 63CAL, 60PBL) y los
-- cinco puntos (CAJAS, GD, GDHO, LUN, OFIKC) no tienen número. Si la columna fuera `0 not null`,
-- cada una de ellas quedaría excedida desde el primer pallet y el aviso sería ruido permanente.
-- Sin tope no se dibuja ningún chip.
--
-- ── NO VA A LA HOJA TIENDAS ───────────────────────────────────────────────────────────────────
--
-- Igual que `recepcion_pallet`: vive solo en la base y en Config. La hoja TIENDAS se escribe por
-- POSICIÓN (A..T) desde cuatro sitios a la vez —`buildSheetRow`, los rangos de `api/tiendas`, los
-- tres de `export-sheets` y los índices de `parseTSheetAuth`— y agregarle una columna obliga a
-- ampliarlos juntos. Este dato no lo necesita.
--
-- ── QUÉ CUENTA CONTRA EL TOPE ─────────────────────────────────────────────────────────────────
--
-- Pallets + CONTENEDORES. Un contenedor ocupa piso igual que un pallet; es la regla que ya rige
-- en todo el enrutamiento (`poolDespacho`, `conteoFlota`, `backlogSegundaVuelta`). Los bultos y
-- los chocolates no: van arriba del pallet o al costado. Ver `shared/topeTienda.ts`.
--
-- Idempotente: la columna se agrega si no está, y la siembra solo toca las filas que siguen en
-- NULL, así que volver a correrlo no pisa lo que alguien haya editado desde Config → Topes.

alter table tiendas
  add column if not exists max_pallets smallint;

comment on column tiendas.max_pallets is
  'Tope de recepción: cuántas posiciones de piso (pallets + contenedores) aguanta recibir la '
  'tienda de una vez. NULL = sin tope cargado, que NO es cero: la tienda no muestra aviso. '
  'Es una señal para Bodega, no un bloqueo — ver shared/topeTienda.ts.';

-- Lista del coordinador, 11/11/2026. 35 tiendas de RM/Costa; las de Región van sin tope.
-- El calce nombre→código se verificó contra el catálogo y no tiene ambigüedades: hay un solo
-- «San Carlos» (02SCL) y la lista trae «COSTANERA» (20CTC, Costanera Center) y «NUEVA COSTANERA»
-- (21NUC) como dos filas distintas. Lo mismo «FLORIDA» (18FLO) y «CENCO FLORIDA» (29CFL, Florida
-- Center), y «BUENAVENTURA» (32BNV), que no es Buenaventura 2 (35BN2, sin tope en la lista).
--
-- La columna «promedio / pico / días que se pasó» son los últimos 45 días medidos en
-- picking_pallets al 11/11/2026, contando pallets+contenedores por día. Sirve para dos cosas:
-- ver de antemano dónde va a salir el ámbar, y detectar un tope mal transcrito. Trece tiendas no
-- se pasaron nunca; sus topes existen y no van a avisar nada, que es lo correcto.
update tiendas t
   set max_pallets = v.tope
  from (values
    -- cod        tope        prom  pico  días que se pasó
    ('01TPS', 5),  -- Trapenses                 3,2   6   2 de 25
    ('21NUC', 5),  -- Nueva Costanera           3,0   5   0 de 15
    ('16PQA', 5),  -- Parque Arauco             3,1   6   3 de 27
    ('06MQH', 5),  -- Manquehue                 2,3   6   1 de 26
    ('32BNV', 5),  -- Buenaventura              1,2   3   0 de 27
    ('22LGN', 5),  -- Laguna                    2,2   5   0 de 27
    ('30PHU', 5),  -- Padre Hurtado             2,2   6   1 de 28
    ('45EST', 5),  -- Estoril                   2,4   3   0 de 14
    ('12LAS', 4),  -- Las Condes                1,5   4   0 de 22
    ('58TAM', 4),  -- El Tamarugo               1,8   4   0 de 18
    ('59EGN', 4),  -- Plaza Egaña               2,0   6   4 de 23
    ('23PEÑ', 4),  -- Peñalolén                 1,5   3   0 de 22
    ('29CFL', 4),  -- Florida Center            2,0   4   0 de 24
    ('13PIE', 3),  -- Pie Andino                2,4   5   5 de 25
    ('10TRQ', 3),  -- El Tranque                1,8   3   0 de 17
    ('11ILC', 3),  -- Isabel la Católica        1,5   4   2 de 22
    ('02SCL', 3),  -- San Carlos de Apoquindo   2,4   7   9 de 26  ← el peor caso
    ('55ITA', 3),  -- Barrio Italia             2,5   5   3 de 20
    ('20CTC', 3),  -- Costanera Center          2,2   4   6 de 26
    ('52MUT', 3),  -- El MUT                    1,5   4   1 de 20
    ('56PZA', 3),  -- Plaza de Armas            1,9   6   4 de 18
    ('05LP',  3),  -- Luis Pasteur              2,1   6   5 de 27
    ('17MAI', 3),  -- Maipú                     2,6   4   4 de 20
    ('19SUB', 3),  -- Subcentro                 2,0   4   1 de 20
    ('14PF',  3),  -- Pedro Fontova             1,6   5   4 de 24
    ('04PDG', 3),  -- Principe de Gales         1,1   3   0 de 21
    ('34SMB', 3),  -- Simon Bolivar             1,6   5   4 de 21
    ('48BRU', 3),  -- Las Brujas                1,4   4   1 de 22
    ('18FLO', 3),  -- Florida                   1,3   3   0 de 21
    ('27MCH', 3),  -- Machalí                   2,5   4   1 de 14
    ('40LIL', 3),  -- Las Lilas                 1,6   4   2 de 22
    ('09LEO', 3),  -- Los Leones                1,2   3   0 de 21
    ('07CCR', 3),  -- Chicureo                  1,7   3   0 de 27
    ('49PTA', 3),  -- Los Toros (Puente Alto)   1,4   4   2 de 22
    ('26ALC', 3)   -- Alto las Condes           1,8   3   0 de 19
  ) as v(cod, tope)
 where t.codigo = v.cod
   and t.max_pallets is null;
