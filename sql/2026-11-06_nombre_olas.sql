-- [PLANILLA → OLAS] El nombre con que cada cuenta de Odoo se escribe en la planilla
-- «Abastecimiento por Olas», hoja PICKING, columna F (Pistolero).
--
-- ── POR QUÉ NO ALCANZA CON display_name ───────────────────────────────────────────────────────
--
-- `picker_canonical_names` ya traduce la cuenta de la pistola a la persona: «Pickers 18» →
-- «Cristian Morales». Pero el nombre que esa planilla espera NO es el mismo string, y la
-- diferencia se paga en plata:
--
--     Tiempo Picking!D  =XLOOKUP(CONCAT(fecha; cuenta); PICKING!T:T; PICKING!F:F; cuenta; 0; 1)
--     Bono Picking      SUMIFS sobre 'Tiempo Picking'!D, cruzando POR EL NOMBRE
--
-- O sea: PICKING!F es lo que decide a quién se le abona cada unidad. Medido el 05/11/2026 sobre
-- los últimos 30 días de la hoja, **15 de 30 cuentas** tienen un nombre que NO coincide con
-- `display_name` de una forma que el SUMIFS no perdona. Las mayúsculas sí las perdona; las
-- tildes, los espacios al final y los apellidos distintos NO:
--
--     Pickers 18   la hoja: 'Cristian Morales '     display_name: 'Cristian Morales'
--     Pickers 4    la hoja: 'Simón Sabathier'       display_name: 'Simon Sabathier'
--     Pickers 5    la hoja: 'Ariana Nikol Velazco ' display_name: 'Nikol Velazco'
--     Inventario   la hoja: 'Bryan montesino'       display_name: 'Bryan Montecinos'
--     Pickers 1    la hoja: 'Maria Camila Gonzalez' display_name: 'Maria Camila'
--
-- Escribir `display_name` en la columna F habría dejado el bono de esas 15 personas en CERO sin
-- ningún error visible: la fórmula no falla, simplemente no encuentra y suma 0.
--
-- Por eso esta columna guarda el string EXACTO que la planilla espera, verrugas incluidas. El día
-- que se quiera unificar, se corrigen los nombres en «Bono Picking» y recién ahí se cambia acá.
--
-- ── OJO: VARIOS VALORES LLEVAN ESPACIO AL FINAL ───────────────────────────────────────────────
--
-- 'Cristian Morales ', 'Javiera Gonzalez ', 'CRISTOBAL LABRA ', 'Jhon Negrette ' y
-- 'Ariana Nikol Velazco ' terminan en espacio. No es un error de tipeo de esta migración: es lo
-- que la hoja tiene, y quitarlo rompe el cruce. Están marcados con «‹esp›» en el comentario de
-- cada línea para que nadie los "limpie" al leer el archivo.
--
-- ── NULL SIGNIFICA «NO SÉ», Y SE AVISA ────────────────────────────────────────────────────────
--
-- Una cuenta sin `nombre_olas` no se adivina: el registro la salta y la nombra en el informe. Es
-- preferible una celda vacía que alguien completa, a un nombre inventado que desvía un bono.
--
-- Quedan en NULL las tres cuentas que la hoja nunca usó en los 30 días medidos: «Congelado 1»,
-- «Congelado 2» y «Sofia Sanchez». Y hay dos cuentas que la hoja SÍ usa y que no existen en esta
-- tabla —«Mario Patiño» (Joe Idrovo) y «Sofía Leonor Sánchez Roiatti» (DANNAE ABARCA)—; son de
-- congelados, que esta planilla no registra, así que no se crean acá.
--
-- Idempotente: la columna se agrega si no está, y la siembra solo toca las filas que siguen en
-- NULL, así que volver a correrlo no pisa lo que alguien haya editado después desde Config.

alter table picker_canonical_names
  add column if not exists nombre_olas text;

comment on column picker_canonical_names.nombre_olas is
  'Nombre EXACTO con que esta cuenta se escribe en la columna F (Pistolero) de la hoja PICKING de '
  '«Abastecimiento por Olas». Puede diferir de display_name en tildes y espacios finales; de ese '
  'string depende el cruce del bono (Tiempo Picking!D → Bono Picking). NULL = no se conoce: el '
  'registro automático salta esa fila y lo informa.';

-- Siembra medida el 05/11/2026 sobre PICKING!A35600:S36210 (28/10 al 05/11). El comentario de
-- cada línea dice en cuántas filas de ese período la hoja usó ese nombre para esa cuenta: donde
-- dice 25/25 no hubo ninguna otra grafía; donde dice 6/8, las otras 2 fueron tipeos de un día
-- suelto y se descartaron por minoría.
update picker_canonical_names t
   set nombre_olas = v.nombre
  from (values
    ('Adquisiciones',        'SEBASTHIAN CORTEZ'),      -- 25/25
    ('Bodega Web',           'Karla Solar'),            -- 8/10
    ('Calidad',              'CESAR SALAZAR'),          -- 15/15
    ('control interno',      'FRANCISCA FARIAS'),       -- 3/3
    ('Inventario',           'Bryan montesino'),        -- 12/13
    ('Isaac Henriquez',      'Benjamín Lara'),          -- 6/6
    ('Jefferson Negrete',    'Javiera Gonzalez '),      -- 23/23  ‹esp›
    ('Laura Roiatti Finato', 'Diego Echeverría'),       -- 10/10
    ('Movimiento interno',   'Josué Suazo'),            -- 21/21
    ('Pickers 1',            'Maria Camila Gonzalez'),  -- 13/13
    ('Pickers 10',           'Fabián Hernández'),       -- 22/22
    ('Pickers 11',           'Diego Farr'),             -- 6/8
    ('Pickers 12',           'Israel Bustos'),          -- 20/20
    ('Pickers 13',           'Valentina Conejera'),     -- 5/6
    ('Pickers 14',           'Zervens Louissant'),      -- 20/20
    ('Pickers 15',           'CRISTOBAL LABRA '),       -- 23/23  ‹esp›
    ('Pickers 16',           'Christian Flores'),       -- 20/20
    ('Pickers 17',           'Camilo Sanchez'),         -- 19/19
    ('Pickers 18',           'Cristian Morales '),      -- 29/29  ‹esp›
    ('Pickers 2',            'Martin barraza'),         -- 27/29
    ('Pickers 3',            'Jhon Negrette '),         -- 29/29  ‹esp›
    ('Pickers 4',            'Simón Sabathier'),        -- 19/19
    ('Pickers 5',            'Ariana Nikol Velazco '),  -- 8/8    ‹esp›
    ('Pickers 6',            'Juliette Mendoza'),       -- 21/21
    ('Pickers 7',            'MARCELO VERGARA'),        -- 23/23
    ('Pickers 8',            'Gaston Canales'),         -- 21/21
    ('Pickers 9',            'Ignacio Poblete'),        -- 25/25
    ('Supervisor Web',       'Fernanda Mardones')       -- 15/15
  ) as v(clave, nombre)
 where t.key = v.clave
   and t.nombre_olas is null;
