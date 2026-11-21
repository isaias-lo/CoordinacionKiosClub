-- [MANTENCIÓN · FASE 1] Las siete tablas del registro de solicitudes.
--
-- PROPUESTA — todavía NO aplicada. Ver `docs/PROMPT_Mantencion_Fase1.md`, Etapa 1.
--
-- Hoy los supervisores piden arreglos por WhatsApp y no queda registro. Esto lo reemplaza: el
-- supervisor ingresa la solicitud con fotos, Jesús le pone la urgencia y la ve en un tablero por
-- tienda. Los técnicos, las rutas, el precierre y los materiales son la Fase 2 y NO están acá;
-- las tablas se diseñaron para que esa fase se agregue sin tocar lo de abajo.
--
-- ══ CADA SUPERVISOR VE SOLO SUS TIENDAS · JESÚS VE TODO ══════════════════════════════════════
--
-- Decisión del coordinador, 19/11/2026. Y se cumple en la BASE, no solo en la pantalla: si el
-- filtro viviera únicamente en la consulta del front, bastaría abrir las herramientas del
-- navegador para pedir la tabla entera.
--
-- La pregunta era contra qué comparar. Hay tres candidatos en el proyecto y dos no sirven:
--
--   · `profiles.role` — es la que usan las políticas viejas de `audit_active_sessions` y
--     `profiles`. Medido el 19/11/2026: 20 filas, de las cuales 12 dicen `pending`, 6 `admin`,
--     1 `control-interno` y 1 `despachador`. El catálogo real (`roles`) tiene 12 roles. Quedó
--     atrás y **no es la verdad**: colgar de ahí el permiso sería construir sobre un dato malo.
--   · La tabla `roles` — es el CATÁLOGO de roles, no dice qué rol tiene cada persona.
--   · **El JWT** — es lo que la aplicación entera obedece y lo único al día, y una política lo
--     lee con `auth.jwt()`. Se usa este, y de él **`app_metadata.role`, NO `user_metadata.role`**.
--     `user_metadata` lo escribe el propio usuario desde el navegador
--     (`supabase.auth.updateUser({ data: { role: 'admin' } })`): colgar de ahí el permiso dejaba a
--     cualquier supervisor verlo todo con dos líneas en la consola. El PR #826 movió el rol de la
--     app entera a `app_metadata`, que solo escribe el servidor.
--
-- Entonces, para leer una solicitud hay que cumplir una de dos cosas:
--
--   1. La tienda está entre las del usuario en `mant_supervisor_tiendas` (ahí no hace falta
--      ningún rol: la pertenencia ES el permiso), o
--   2. el rol del JWT está en la lista de los que ven todo: `admin` y `encargado-mantencion`.
--
-- **La trampa operativa, que hay que saber:** `app_metadata` viaja dentro del token. Cambiarle
-- el rol a alguien NO cambia su token: sigue con el rol viejo hasta que vuelve a iniciar sesión.
-- Ya es así hoy para el middleware, así que no es nuevo — pero cuando se cree el rol
-- `encargado-mantencion` en la Etapa 4, Jesús tiene que cerrar sesión y volver a entrar.
--
-- ══ ESCRIBIR, NUNCA DESDE EL NAVEGADOR ═══════════════════════════════════════════════════════
--
-- No hay ninguna política de insert, update ni delete para `authenticated`: con la clave pública
-- —la que viaja al navegador— estas tablas son de SOLO LECTURA. Toda escritura pasa por una ruta
-- de API con service role, que es donde se aplican las reglas que RLS no puede expresar bien:
-- «el supervisor no asigna urgencia», «el supervisor no cierra», «la aclaración se suma, no pisa».
-- Es el mismo patrón de `/api/backlog-v2`, y tiene una ventaja concreta: la regla queda escrita
-- UNA vez, en TypeScript, con tests, en vez de repartida en catorce políticas.
--
-- ══ Y POR QUÉ CADA TABLA TIENE SU POLÍTICA AUNQUE PAREZCA DE MÁS ═════════════════════════════
--
-- Porque una tabla con RLS activo y NINGUNA política devuelve cero filas **sin error**. Este
-- repositorio ya lo pagó: `rutas_despacho` es así, y el backlog de 2ª vuelta mostró 164
-- pendientes donde había 15. Un `select` vacío es una respuesta perfectamente creíble.
--
-- La lectura desde el navegador hace falta para el Realtime del Tablero: Realtime respeta RLS, y
-- una tabla que el navegador no puede leer tampoco le emite eventos.
--
-- ══ IDEMPOTENTE ══════════════════════════════════════════════════════════════════════════════
--
-- Todo es `if not exists` / `on conflict do nothing` / `drop ... if exists` antes de crear.
-- Correrlo dos veces no cambia nada la segunda vez.

begin;

-- ── 1 · QUÉ TIENDAS VE CADA SUPERVISOR ───────────────────────────────────────────────────────
--
-- Una fila por (supervisor, tienda). No se usa la columna `supervisor` de `tiendas` directamente
-- porque ahí el supervisor es un NOMBRE escrito a mano y acá hace falta el usuario de Supabase
-- Auth, que es con lo que entra a la app. La carga inicial sale de esa columna, pero confirmada
-- una por una (Etapa 4): medido el 18/11/2026, de 66 tiendas activas **11 no tienen supervisor**.
create table if not exists mant_supervisor_tiendas (
  id              bigint generated always as identity primary key,
  supervisor_id   uuid not null references auth.users (id) on delete cascade,
  codigo_tienda   text not null references tiendas (codigo) on update cascade,
  created_at      timestamptz not null default now(),
  created_by_name text,
  unique (supervisor_id, codigo_tienda)
);

comment on table mant_supervisor_tiendas is
  'Qué tiendas ve cada supervisor en Mantención. La LECTURA la filtra RLS (mant_es_mi_tienda); '
  'la escritura va solo por la API con service role. Ver la cabecera de sql/2026-11-19_mantencion_fase1.sql.';

create index if not exists mant_sup_tiendas_por_tienda
  on mant_supervisor_tiendas (codigo_tienda);

-- ── 2 · CATEGORÍAS ───────────────────────────────────────────────────────────────────────────
--
-- Sugeridas, no obligatorias: el supervisor puede escribir otra cosa y por eso `mant_solicitudes`
-- guarda la categoría como TEXTO LIBRE y no como una llave foránea a esta tabla. Si fuera una FK,
-- una categoría nueva escrita desde el celular haría fallar el INSERT entero — y en Postgres un
-- INSERT que falla no guarda nada, no guarda «casi todo».
create table if not exists mant_categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  activa  boolean not null default true,
  orden   smallint not null default 0
);

comment on table mant_categorias is
  'Lista SUGERIDA de categorías, editable por el encargado. La solicitud guarda texto libre: '
  'esta tabla alimenta el desplegable, no restringe lo que se puede escribir.';

insert into mant_categorias (nombre, orden) values
  ('Eléctrico',               1),
  ('Gasfitería',              2),
  ('Refrigeración',           3),
  ('Cortinas y cerrajería',   4),
  ('Mobiliario',              5),
  ('Infraestructura',         6),
  ('Climatización',           7)
on conflict (nombre) do nothing;

-- ── 3 · LAS SOLICITUDES ──────────────────────────────────────────────────────────────────────
--
-- `id` es UUID y no un correlativo, por el celular sin señal: la solicitud se arma offline, las
-- fotos se guardan bajo `AAAA/MM/<tienda>/<id>/<uuid>.jpg`, y esa ruta tiene que existir ANTES de
-- que la fila llegue a la base. Con un `bigserial` el id lo pone Postgres al insertar y las fotos
-- no tendrían dónde vivir hasta que hubiera señal.
--
-- `urgencia` nace en NULL **a propósito**: null = «sin clasificar», y es el estado que hace que la
-- solicitud aparezca en «Por revisar». No lleva default: un default la clasificaría sola, que es
-- exactamente lo que la regla de negocio prohíbe.
--
-- El `check` de `estado` lleva los siete estados completos aunque la Fase 1 solo use `pendiente` y
-- `descartada`. Ampliar un check después obliga a revalidar la tabla entera; dejarlo completo hoy
-- cuesta cero.
create table if not exists mant_solicitudes (
  id               uuid primary key default gen_random_uuid(),
  codigo_tienda    text not null references tiendas (codigo) on update cascade,
  categoria        text,
  descripcion      text not null check (length(btrim(descripcion)) > 0),
  urgencia         text check (urgencia in ('leve', 'media', 'urgente')),
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'programada', 'en_ejecucion',
                                       'por_cerrar', 'cerrada', 'no_resuelta', 'descartada')),
  origen           text not null default 'app' check (origen in ('app', 'whatsapp')),
  duplicada_de     uuid references mant_solicitudes (id) on delete set null,
  espera_material  boolean not null default false,
  creada_por       uuid references auth.users (id) on delete set null,
  creada_por_nombre text,
  -- Idempotencia de la cola offline: el mismo `clientOpId` reintentado no crea una segunda
  -- solicitud. Admite NULL —las que carga Jesús por WhatsApp no vienen de la cola— y en Postgres
  -- un unique deja pasar todos los NULL que quieran.
  client_op_id     text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column mant_solicitudes.urgencia is
  'NULL = sin clasificar, y es el estado inicial: solo Mantención la clasifica. Sin default a '
  'propósito.';
comment on column mant_solicitudes.client_op_id is
  'Idempotencia de la cola offline. NULL en las cargadas a mano por WhatsApp.';

create index if not exists mant_solicitudes_por_tienda
  on mant_solicitudes (codigo_tienda, estado);
-- Para el contador de «Por revisar»: las sin clasificar, de las más viejas a las más nuevas.
create index if not exists mant_solicitudes_sin_clasificar
  on mant_solicitudes (created_at) where urgencia is null;

-- ── 4 · COMENTARIOS ──────────────────────────────────────────────────────────────────────────
--
-- Lo que escribió la tienda no se edita ni se borra: las aclaraciones se SUMAN. Por eso la
-- conversación es una tabla aparte y no un campo que se reescribe.
create table if not exists mant_comentarios (
  id            bigint generated always as identity primary key,
  solicitud_id  uuid not null references mant_solicitudes (id) on delete cascade,
  autor_id      uuid references auth.users (id) on delete set null,
  autor_nombre  text,
  tipo          text not null check (tipo in ('pregunta', 'respuesta', 'nota_mantencion')),
  texto         text not null check (length(btrim(texto)) > 0),
  created_at    timestamptz not null default now()
);

create index if not exists mant_comentarios_por_solicitud
  on mant_comentarios (solicitud_id, created_at);
-- «Te esperan»: las preguntas de Mantención que la tienda todavía no respondió.
create index if not exists mant_comentarios_preguntas
  on mant_comentarios (solicitud_id) where tipo = 'pregunta';

-- ── 5 · FOTOS ────────────────────────────────────────────────────────────────────────────────
--
-- Se guarda la RUTA dentro del bucket, nunca una URL: el bucket es privado y la URL firmada dura
-- una hora. Guardar la URL dejaría la tabla llena de enlaces vencidos que parecen datos.
--
-- `respaldada_drive` existe desde hoy aunque la copia a Drive sea de la Fase 3: agregar la
-- columna después obligaría a decidir qué dice en las filas viejas. Nace en `false`, que es la
-- verdad.
create table if not exists mant_fotos (
  id               bigint generated always as identity primary key,
  solicitud_id     uuid not null references mant_solicitudes (id) on delete cascade,
  tipo             text not null default 'antes' check (tipo in ('antes', 'despues')),
  ruta             text not null,
  subida_por       uuid references auth.users (id) on delete set null,
  subida_por_nombre text,
  respaldada_drive boolean not null default false,
  created_at       timestamptz not null default now()
);

comment on column mant_fotos.ruta is
  'Ruta DENTRO del bucket privado mantencion-fotos: AAAA/MM/<codigo_tienda>/<id_solicitud>/<uuid>.jpg. '
  'Nunca una URL: las firmadas vencen.';

create index if not exists mant_fotos_por_solicitud
  on mant_fotos (solicitud_id, created_at);

-- ── 6 · BITÁCORA ─────────────────────────────────────────────────────────────────────────────
--
-- Quién cambió qué y cuándo. Es la tabla que contesta «¿por qué esto quedó en urgente?» tres
-- semanas después. La escribe la API, no un trigger: el trigger no sabe QUIÉN hizo el cambio —el
-- servidor entra con service role, siempre con el mismo usuario de base— y una bitácora sin
-- persona no sirve para nada.
create table if not exists mant_eventos (
  id              bigint generated always as identity primary key,
  solicitud_id    uuid not null references mant_solicitudes (id) on delete cascade,
  campo           text not null,
  valor_anterior  text,
  valor_nuevo     text,
  usuario_id      uuid references auth.users (id) on delete set null,
  usuario_nombre  text,
  created_at      timestamptz not null default now()
);

create index if not exists mant_eventos_por_solicitud
  on mant_eventos (solicitud_id, created_at);

-- ── 7 · UMBRALES Y PESOS ─────────────────────────────────────────────────────────────────────
--
-- Una sola fila, forzada por el check `id = 1`. Sin eso, un INSERT de más crearía una segunda
-- configuración y la pantalla leería la primera que devuelva Postgres, que no tiene orden
-- garantizado: el tablero cambiaría de umbrales entre dos cargas sin que nadie tocara nada.
create table if not exists mant_config (
  id                    smallint primary key default 1 check (id = 1),
  umbral_total          smallint not null default 5,
  umbral_sin_programar  smallint not null default 5,
  dias_antiguedad       smallint not null default 7,
  dias_aviso_precierre  smallint not null default 3,
  peso_urgente          smallint not null default 5,
  dias_por_solicitud    smallint not null default 2,
  updated_at            timestamptz not null default now(),
  updated_by_name       text
);

insert into mant_config (id) values (1) on conflict (id) do nothing;

-- ── `updated_at` AL DÍA ──────────────────────────────────────────────────────────────────────
create or replace function mant_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mant_solicitudes_updated_at on mant_solicitudes;
create trigger trg_mant_solicitudes_updated_at
  before update on mant_solicitudes
  for each row execute function mant_touch_updated_at();

drop trigger if exists trg_mant_config_updated_at on mant_config;
create trigger trg_mant_config_updated_at
  before update on mant_config
  for each row execute function mant_touch_updated_at();

-- ── NADIE BORRA SOLICITUDES NI EVENTOS ───────────────────────────────────────────────────────
--
-- Va en un TRIGGER y no en una política de RLS porque **service role se salta RLS entero**. Una
-- regla escrita como policy sería verdad para el navegador y mentira para el servidor, que es
-- justo quien escribe. El trigger corre siempre, venga de donde venga.
--
-- Para retirar una solicitud está `estado = 'descartada'`, que deja rastro. Si alguna vez hiciera
-- falta borrar de verdad —un dato personal mal cargado— se baja el trigger a mano, se borra y se
-- vuelve a subir, y queda en la bitácora de quien lo hizo.
create or replace function mant_prohibir_borrado() returns trigger
language plpgsql as $$
begin
  raise exception
    'No se borran filas de %: una solicitud se retira con estado = ''descartada''.',
    tg_table_name;
end;
$$;

drop trigger if exists trg_mant_solicitudes_no_delete on mant_solicitudes;
create trigger trg_mant_solicitudes_no_delete
  before delete on mant_solicitudes
  for each row execute function mant_prohibir_borrado();

drop trigger if exists trg_mant_eventos_no_delete on mant_eventos;
create trigger trg_mant_eventos_no_delete
  before delete on mant_eventos
  for each row execute function mant_prohibir_borrado();

-- ── LAS DOS PREGUNTAS DEL PERMISO ────────────────────────────────────────────────────────────
--
-- Se escriben una vez, como funciones, y no catorce veces dentro de las políticas. Si mañana
-- cambia quién ve todo, se cambia acá y vale para todas las tablas de golpe.
--
-- `stable` y no `volatile`: el planificador puede llamarlas una vez por consulta en vez de una
-- por fila. `security definer` para que la función pueda mirar `mant_supervisor_tiendas` sin que
-- la política de ESA tabla vuelva a entrar y se muerda la cola.
create or replace function mant_ve_todo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'encargado-mantencion'),
    false);
$$;

comment on function mant_ve_todo() is
  'El rol sale del JWT, de app_metadata.role (solo lo escribe el servidor; user_metadata lo escribe '
  'el propio usuario, ver PR #826). profiles.role quedó atrás (12 de 20 en «pending»). OJO: cambiarle el rol a alguien no '
  'cambia su token — tiene que volver a iniciar sesión.';

create or replace function mant_es_mi_tienda(cod text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from mant_supervisor_tiendas st
     where st.supervisor_id = auth.uid()
       and st.codigo_tienda = cod);
$$;

comment on function mant_es_mi_tienda(text) is
  'Pertenencia, no rol: estar en mant_supervisor_tiendas ES el permiso de ver esa tienda.';

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Lectura: solo lo propio, salvo que el rol vea todo. Escritura: ninguna desde el navegador — no
-- hay policy de insert/update/delete para `authenticated`. El porqué completo está en la cabecera.
alter table mant_supervisor_tiendas enable row level security;
alter table mant_categorias         enable row level security;
alter table mant_solicitudes        enable row level security;
alter table mant_comentarios        enable row level security;
alter table mant_fotos              enable row level security;
alter table mant_eventos            enable row level security;
alter table mant_config             enable row level security;

-- Cada uno ve sus propias asignaciones; Jesús, todas. Es también lo que hace que la pantalla del
-- supervisor pueda armar su selector de tiendas sin pedirle nada al servidor.
drop policy if exists mant_sup_tiendas_select on mant_supervisor_tiendas;
create policy mant_sup_tiendas_select on mant_supervisor_tiendas
  for select to authenticated
  using (supervisor_id = auth.uid() or mant_ve_todo());

-- Las categorías y los umbrales los ve cualquiera con sesión: son el desplegable y los números
-- con los que se dibuja la pantalla, no datos de nadie.
drop policy if exists mant_categorias_select on mant_categorias;
create policy mant_categorias_select on mant_categorias
  for select to authenticated using (true);

drop policy if exists mant_config_select on mant_config;
create policy mant_config_select on mant_config
  for select to authenticated using (true);

-- El corazón: una solicitud se ve si es de una tienda mía, o si la creé yo —por si alguien
-- ingresa una de una tienda que después le sacan y quedaría sin poder ver lo que escribió—, o si
-- el rol ve todo.
drop policy if exists mant_solicitudes_select on mant_solicitudes;
create policy mant_solicitudes_select on mant_solicitudes
  for select to authenticated
  using (mant_ve_todo() or creada_por = auth.uid() or mant_es_mi_tienda(codigo_tienda));

-- Los comentarios, las fotos y la bitácora cuelgan de la solicitud: se ven exactamente con la
-- misma regla, preguntándosela a la solicitud. Repetir la condición acá sería tener dos reglas
-- que pueden separarse — y separadas, la que quede más floja es la que manda.
drop policy if exists mant_comentarios_select on mant_comentarios;
create policy mant_comentarios_select on mant_comentarios
  for select to authenticated
  using (exists (select 1 from mant_solicitudes s where s.id = solicitud_id));

drop policy if exists mant_fotos_select on mant_fotos;
create policy mant_fotos_select on mant_fotos
  for select to authenticated
  using (exists (select 1 from mant_solicitudes s where s.id = solicitud_id));

drop policy if exists mant_eventos_select on mant_eventos;
create policy mant_eventos_select on mant_eventos
  for select to authenticated
  using (exists (select 1 from mant_solicitudes s where s.id = solicitud_id));

-- ── STORAGE: UN BUCKET PRIVADO ───────────────────────────────────────────────────────────────
--
-- Privado y con URLs firmadas, no público. Una foto de Mantención puede mostrar la caja, la
-- bodega o una puerta forzada: un bucket público es una URL que, adivinada o reenviada, abre sin
-- sesión.
--
-- Sin políticas sobre `storage.objects`: sube el servidor con service role y la pantalla recibe
-- una URL firmada. Es el mismo trato que el resto de las tablas de esta migración.
--
-- OJO para la Etapa 0: medido el 19/11/2026 en `storage.buckets`, el proyecto vivo tiene 5 buckets
-- —`guides` (831 archivos), `audit-photos`, `entrega-fotos`, `recepcion-fotos` y `signatures`— y
-- los cuatro últimos están VACÍOS. Un bucket vacío no aparece consultando `storage.objects` —esa
-- tabla solo lista los que tienen archivos— así que «no existe» y «existe sin archivos» se ven
-- igual desde SQL. Hay que mirar `storage.buckets`.
--
-- Y los CINCO son `public = true`. Este es el primero privado del proyecto, así que la subida y la
-- lectura no se pueden copiar de lo que ya hay: van por el servidor, con URL firmada.
insert into storage.buckets (id, name, public)
values ('mantencion-fotos', 'mantencion-fotos', false)
on conflict (id) do nothing;

commit;

-- ══ LO QUE ESTA MIGRACIÓN NO HACE ════════════════════════════════════════════════════════════
--
-- · **No crea los roles.** `supervisor-tienda`, `encargado-mantencion` y `tecnico-mantencion` van
--   en la Etapa 4, cuando existan las rutas que les tocan: un rol con `allowed_paths` apuntando a
--   pantallas que todavía no están deja al usuario en una página en blanco.
--
--   Mientras tanto, `mant_ve_todo()` solo le dice que sí a `admin`. Es lo correcto: hasta la
--   Etapa 4 nadie es `encargado-mantencion`, y la función no inventa permisos que todavía no se
--   otorgaron. Cuando el rol exista, Jesús tiene que **cerrar sesión y volver a entrar** para que
--   su token lo traiga.
-- · **No carga `mant_supervisor_tiendas`.** Sale de la columna `supervisor` de `tiendas`, pero esa
--   columna trae nombres y acá hacen falta usuarios de Auth, y además 11 tiendas activas no tienen
--   supervisor. Se confirma una por una en la Etapa 4.
-- · **No toca rutas, paradas ni materiales.** Fase 2.
