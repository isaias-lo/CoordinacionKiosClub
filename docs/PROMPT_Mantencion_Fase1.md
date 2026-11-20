# Mantención KiosClub · Fase 1: Registro

Pega este texto completo en Claude Code, abierto en la carpeta de CoordinacionKiosClub.

---

Vamos a construir la Fase 1 de un módulo nuevo, **Mantención**, dentro de este repositorio. Lee primero `CLAUDE.md` y respeta todas sus reglas: una sentencia SQL por llamada, RLS revisado antes de consultar desde el navegador, tests para la lógica pura, un PR por cambio y los cuatro chequeos en verde (`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`) antes de cada commit.

Todo va en el **proyecto vivo** de Supabase (`epiwlmegimfftivqzzup`), nunca en el congelado.

Trabaja por etapas. **Al terminar cada etapa, detente, muéstrame el resultado y espera mi confirmación antes de seguir.**

## Qué es Mantención

Hoy los supervisores de tienda piden arreglos a Mantención por WhatsApp y no queda registro. Este módulo los reemplaza:

- El **supervisor de tienda** ingresa la solicitud desde el celular, con fotos.
- **Jesús**, encargado de Mantención, la revisa, le asigna la urgencia y ve todo en un tablero por tienda.
- Los **técnicos** (3) entran en la Fase 2, junto con rutas, precierre y materiales. No los construyas ahora.

El mockup aprobado está en el canvas "Mockup — Mantención KiosClub" y el plan completo en el doc "Plan de proyecto — Herramienta de Mantención KiosClub". Si algo de este prompt choca con lo que encuentres en el código, pregúntame antes de decidir.

## Reglas de negocio que no se negocian

- **El supervisor no asigna urgencia.** Toda solicitud nace "Sin clasificar". Solo Jesús la clasifica: leve, media o urgente.
- **El supervisor no cierra ni aprueba.** Solo crea, responde preguntas de Mantención y ve el estado.
- **La categoría es opcional.** Hay una lista sugerida que Jesús edita, y el supervisor puede escribir otra.
- **Al menos una foto** para crear una solicitud. Máximo 5.
- **Lo que escribió la tienda no se borra.** Las aclaraciones se suman como comentarios.
- **Umbrales y pesos editables** por Jesús, guardados en base de datos, nunca en el código.

---

## Etapa 0 · Inventario (solo lectura, no escribas nada)

Antes de diseñar, revisa y repórtame:

1. **Usuarios y roles.** Cómo se liga un usuario de Supabase Auth a una fila de `roles`, qué columnas tiene `roles` (`allowed_paths`, `home_path`, `permissions`) y cómo los usa `middleware.ts`. Necesito crear tres roles: `supervisor-tienda`, `encargado-mantencion` y `tecnico-mantencion`.
2. **Tiendas.** Columnas reales de la tabla `tiendas`: código, nombre, dirección, `sector_comuna`, `region`, `lat`, `lon`, `supervisor`. Cuántas filas activas hay y cuántas tienen coordenadas.
3. **Zonas.** Cómo `src/lib/sectores.ts` deriva la zona (`santiago`, `costa`, `sur`, `norte`) desde el sector. En Mantención se mostrarán como RM, Costa, Ruta Sur y Ruta Norte.
4. **Piezas reutilizables.** Confirma con archivo y línea: la cola offline (`src/lib/offline`), la compresión de fotos (`auditoria/utils/photos.ts`), la bitácora (`src/lib/bitacora.ts`) y el registro de rutas en `src/config/routes.ts`.
5. **Storage.** En el proyecto vivo solo existe el bucket `guides` (831 archivos, 164 MB, medido el 18/11/2026). Pero el código sube a `recepcion-fotos`, `audit-photos` y al bucket de entregas. Lista los buckets que existen de verdad y dime si esas subidas están fallando. En `AuditoriaScreen.tsx` un error de subida solo descarta la URL, así que podría estar perdiendo fotos sin aviso. **No lo arregles ahora**: solo repórtalo.
6. **Plan de Supabase** de la organización del proyecto vivo: gratuito o Pro.

**Detente y muéstrame el inventario.**

## Etapa 1 · Base de datos

Propón la migración en `sql/AAAA-MM-DD_mantencion_fase1.sql`, con comentarios que expliquen el porqué, como el resto de los archivos de esa carpeta. **Muéstramela antes de aplicarla.**

Tablas, todas con prefijo `mant_`:

| Tabla | Contenido |
| --- | --- |
| `mant_supervisor_tiendas` | supervisor (usuario) y código de tienda. Qué tiendas ve cada supervisor. |
| `mant_categorias` | nombre, activa, orden. Semilla: Eléctrico, Gasfitería, Refrigeración, Cortinas y cerrajería, Mobiliario, Infraestructura, Climatización. |
| `mant_solicitudes` | id, código de tienda, categoría (texto libre opcional), descripción, urgencia (`null` = sin clasificar, `leve`, `media`, `urgente`), estado, origen (`app` o `whatsapp`), `duplicada_de`, `espera_material` (bool), creada por, timestamps, `client_op_id` único para idempotencia. |
| `mant_comentarios` | solicitud, autor, tipo (`pregunta`, `respuesta`, `nota_mantencion`), texto, fecha. |
| `mant_fotos` | solicitud, tipo (`antes`, `despues`), ruta en storage, subida por, `respaldada_drive` (bool). |
| `mant_eventos` | bitácora: solicitud, campo, valor anterior, valor nuevo, usuario, fecha. |
| `mant_config` | una sola fila: `umbral_total` 5, `umbral_sin_programar` 5, `dias_antiguedad` 7, `dias_aviso_precierre` 3, `peso_urgente` 5, `dias_por_solicitud` 2. |

Estados de solicitud, con `check`: `pendiente`, `programada`, `en_ejecucion`, `por_cerrar`, `cerrada`, `no_resuelta`, `descartada`. La Fase 1 solo usa `pendiente` y `descartada`, pero deja el check completo.

No crees todavía las tablas de rutas, paradas ni materiales: van en la Fase 2.

**Storage:** un bucket nuevo y **privado**, `mantencion-fotos`, con URLs firmadas, no públicas. Ruta de cada archivo: `AAAA/MM/<codigo_tienda>/<id_solicitud>/<uuid>.jpg`. Así la copia a Drive de la Fase 3 queda ordenada sin trabajo extra.

**RLS en todas las tablas**, con políticas explícitas:

- `supervisor-tienda`: lee y crea solicitudes, fotos y comentarios solo de sus tiendas (vía `mant_supervisor_tiendas`). No puede cambiar urgencia, estado ni `duplicada_de`.
- `encargado-mantencion`: lee todo; cambia urgencia, estado y duplicados; crea comentarios y notas; edita categorías y `mant_config`.
- Nadie borra filas de `mant_solicitudes` ni de `mant_eventos`.

Si en este repositorio el patrón es leer por API con service role, como `/api/backlog-v2`, síguelo y explícame por qué.

**Detente con la migración escrita y sin aplicar.**

## Etapa 2 · Lógica pura, con tests

En `src/features/mantencion/utils/`, cada archivo con su `__tests__/`:

1. **`prioridad.ts`.** Puntaje de una tienda = `peso_urgente × urgentes + sin_programar + días_de_la_más_antigua ÷ dias_por_solicitud`. Una tienda sin nada pendiente sin programar va al fondo. Tests: el ejemplo del plan (7 sin programar, 1 urgente, 12 días = 18) y casos vacíos.
2. **`alertas.ts`.** Para una tienda y la config devuelve qué alertas aplican: `sin_programar` (> umbral, roja), `volumen_total` (> umbral, ámbar), `urgencia`, `antiguedad`, `espera_material`. Tests en el límite exacto: 5 no alerta y 6 sí.
3. **`duplicados.ts`.** Posible duplicado = misma tienda y misma categoría que otra solicitud abierta. Sin categoría no se marca.
4. **`zonaTienda.ts`.** Envuelve `sectores.ts` y traduce a las etiquetas de Mantención. No dupliques la regla.
5. **`validarSolicitud.ts`** con zod, como `src/lib/schemas.ts`: tienda obligatoria y asignada al usuario, descripción obligatoria, de 1 a 5 fotos, categoría opcional.

**Detente con los tests en verde.**

## Etapa 3 · Pantallas

Ruta base `/mantencion`, registrada en `src/config/routes.ts` como un `ModuleGroup` nuevo, para que aparezca en el panel de permisos. Revisa también `EXTRA_REAL_PATHS` y `HOME_OPTIONS`.

**Supervisor de tienda (celular primero):**

- `/mantencion/tienda`: arriba, "Te esperan", con las preguntas de Mantención sin responder. Debajo, sus solicitudes, con filtro por tienda y estado.
- `/mantencion/tienda/nueva`:
  - Selector de tienda: solo las suyas, con la primera preseleccionada si tiene una.
  - Categoría sugerida o escrita.
  - Descripción.
  - Fotos desde la cámara, comprimidas con la utilidad existente.
  - Aviso de posible duplicado antes de enviar.
  - Texto fijo: "La urgencia la define Mantención. Si es una emergencia, llama o escribe por WhatsApp."
- **Sin señal:** usa la cola offline existente. Agrega `'mantencion'` a `ModuloOffline` y reutiliza `clientOpId` para no duplicar. La solicitud se ve como "Por enviar" hasta que sube.

**Encargado de Mantención (escritorio):**

- `/mantencion`: **Tablero.**
  - Tarjetas por tienda, ordenadas por `prioridad.ts`.
  - Filtro de zona: Todas, RM, Costa, Ruta Sur, Ruta Norte.
  - Contadores arriba: abiertas, tiendas en alerta, urgentes, por revisar.
  - Tiempo real con Supabase Realtime, como ya se usa en el repositorio.
- `/mantencion/revisar`: **Por revisar.** Solicitudes sin clasificar y posibles duplicados.
  - Botones Leve, Media y Urgente.
  - "Preguntar a la tienda", que crea un comentario tipo `pregunta`.
  - Nota de Mantención para el técnico.
  - Duplicados lado a lado: "Unir con la original" o "No es duplicado".
- `/mantencion/tienda/[codigo]`: detalle de una tienda, con sus solicitudes, fotos (URL firmada) y conversación.
- `/mantencion/ajustes`: umbrales, pesos y categorías. Cada cambio queda en la bitácora.
- **Ingreso por WhatsApp:** Jesús puede crear una solicitud a nombre de una tienda, con `origen = 'whatsapp'`.

Usa los componentes y la apariencia del resto de la aplicación, no los del mockup. El mockup define el flujo, no el estilo.

**Detente y muéstrame las pantallas funcionando en local.**

## Etapa 4 · Cierre de la fase

1. Crea los tres roles en `roles`, con sus `allowed_paths` y `home_path`. El técnico queda creado pero sin pantallas.
2. Prepara un script o una vista de administración para cargar `mant_supervisor_tiendas`. Parte de la columna `supervisor` de `tiendas` y deja que yo confirme cada asignación.
3. Los cuatro chequeos en verde, un PR y su descripción en español.

## Fuera de esta fase

Rutas, técnicos, precierre, cierre por Jesús, materiales, Google Maps, copia de fotos a Drive y espejo en la hoja de Google Sheets "Mantención KiosClub — Registro". Diseña las tablas para que todo eso se agregue sin romper nada, pero no lo construyas.
