# 🧭 FLUJO DE TRABAJO — Cómo continuar entre el trabajo y la casa

Guía rápida para no perder avances y seguir desde donde quedaste, sin importar
en qué PC estés. **Léela cuando tengas dudas.**

---

## ✅ Regla de oro

> **`nueva-tarea` al empezar algo  ·  `hola` al llegar  ·  `bye` antes de salir  ·  `PR` cuando termines.**
> Todo tu trabajo viaja entre PCs **a través de GitHub (git)**. Lo que dejes
> sin subir, **NO** estará en la otra PC.

| Palabra | Comando | Para qué |
|---|---|---|
| **nueva-tarea** | `npm run nueva-tarea <rama>` | Al empezar algo NUEVO: crea una rama fresca desde `main` (ej. `npm run nueva-tarea fix/algo`). **No reuses una rama vieja ya mergeada.** |
| **hola** | `npm run hola` | Al llegar: ponerte al día (pull de TU rama actual). |
| **bye** | `npm run bye` | Al salir o cambiar de PC: guardar y subir tu avance a TU rama. **Nunca abre PR** → seguro aunque el trabajo esté a medias. |
| **sync** | `npm run sync` | Traer lo último de **main** a tu rama (en tareas largas, si main avanzó). |
| **PR** / "subir PR" | `npm run pr` | Solo cuando una función está **lista para producción**: abre el Pull Request a `main` para revisar/desplegar. **No mergea solo.** |

> 🔑 **`bye` ≠ `PR`.** `bye` solo sube tu avance a tu rama (no toca producción).
> `PR` es una decisión aparte y consciente, solo cuando algo está terminado.

---

## 🏢 AL LLEGAR (trabajo o casa) — antes de empezar

1. Abre el proyecto.
2. En la terminal corre:
   ```powershell
   npm run hola
   ```
   Esto trae lo último de tu rama desde GitHub. Si te avisa que tienes cambios
   sin guardar, resuélvelos antes de continuar.

(También puedes decirle a Claude **"hola"** y él hace el `pull` por ti.)

---

## 🏠 ANTES DE SALIR (trabajo o casa) — al terminar tu jornada

1. En la terminal corre:
   ```powershell
   npm run bye
   ```
   Esto **guarda TODO tu avance** (commit) y lo **sube a GitHub** (push).
2. Listo. En la otra PC, al llegar, solo haces `npm run hola`.

(También puedes decirle a Claude **"bye"** y él hace commit + push y actualiza
las bitácoras `TRABAJO.md` / `TRABAJO_ERICK.md`.)

---

## 🌱 Una RAMA NUEVA por tarea (no reuses ramas viejas)

**Cada trabajo/tarea = una rama nueva creada desde `main`.** Es como ya funciona el
resto del repo (`fix/...`, `feat/...`, `chore/...`).

- Al empezar algo: `npm run nueva-tarea fix/lo-que-sea` (te crea la rama desde `main` al día).
- Trabaja en ella; usa `bye`/`hola` para moverte entre PCs **sobre esa misma rama de la tarea**.
- Cuando esté lista: `PR` → la revisas/mergeas en GitHub → esa rama queda **terminada**.
- Para lo siguiente: **otra `nueva-tarea`** (NO sigas trabajando sobre la rama ya mergeada).

> ⚠️ **Por qué NO reusar una rama vieja:** después de mergear su PR, `main` sigue avanzando
> (otros PRs) y la rama vieja queda atrás; además el auto-guardado deja commits "WIP" basura.
> Resultado: cada sesión había que resetear. Con una rama nueva por tarea, eso no pasa.
>
> Si llegas (`hola`) y tu rama actual ya fue mergeada, dile a Claude **"nueva tarea …"** y
> arranca limpio desde `main`.

### Continuidad entre PCs (sobre la rama de la tarea)
- La rama vive en GitHub; ambas PCs la comparten.
- `bye` antes de salir + `hola` al llegar → cada PC arranca con lo último, sin conflictos.
- ⚠️ Nunca edites **sin `hola` primero** (editar sobre una versión vieja genera conflictos).

---

## 🚀 ¿Y el PR (Pull Request)? ¿Me obliga a cambiar de rama?

**No.** El PR no cambia tu forma de trabajar entre PCs:

1. Trabajas en tu rama y haces `bye`/`hola` entre PCs todo lo que necesites.
2. Cuando un trabajo está **listo para producción**, se abre **un solo PR** de tu
   rama hacia `main` (con `gh pr create` o desde GitHub).
3. Cada `push` a tu rama **actualiza ese mismo PR** automáticamente.
4. Al **mergear el PR a `main`**, Vercel hace el deploy.

> **Vercel solo despliega `main`.** Pushear a tu rama NO publica nada en producción
> hasta que el PR se mergea a `main`.

---

## 💸 Ahorro de tokens + jornadas largas con Claude

El enemigo #1 de una jornada larga es que **el contexto crece** → se llena → Claude lo comprime →
cada turno cuesta más y baja la calidad. La estrategia para trabajar más horas, con mejor calidad y
gastando menos:

### Regla mental: **rama nueva → contexto limpio → tarea enfocada → `bye`**

| Hábito | Qué hacer | Por qué ahorra |
|---|---|---|
| **`/clear` entre tareas** | Al cambiar de tarea (ej. de picking a flota), limpia el contexto. Una tarea = un contexto. | Evita arrastrar tokens de una tarea a otra; alarga mucho la jornada |
| **Confía en la memoria** | Cierra con `bye`, abre con `hola`. `TRABAJO.md` + `claude-mem` guardan la continuidad **fuera** del contexto. | No necesitas mantener todo "en pantalla" para no perder el hilo |
| **`/compact` a tiempo** | Cuando termines un sub-bloque y el contexto esté cargado, compáctalo tú. | Reduce el costo por turno antes de que se dispare |
| **Sé específico** | Di el archivo o pantalla concreta ("el buscador en FlotaGrid"), no "revisa la app". | Menos exploración de Claude = menos tokens |
| **Agrupa pedidos** | Junta cambios relacionados en un mensaje, no goteo de mensajes sueltos. | Menos ida y vuelta |

### Enrutamiento de modelos (ya configurado)
- Este repo arranca en **Sonnet** (`.claude/settings.json`) — el ejecutor barato.
- **Tarea simple:** Sonnet hace todo.
- **Tarea difícil / multi-paso:** Claude planifica con **Opus/Fable** y Sonnet ejecuta.
- **Al terminar algo importante:** revisión final con **Opus/Fable** (`/code-review`).
- Cambiar de modelo puntual: `/model`.

### Conectores de la cuenta Claude (Settings → Connectors)
Cada conector activo se inyecta en **todas** tus sesiones (todos tus proyectos). Deja solo los que usas:
- ✅ **Dejar:** Supabase.
- 🟡 **Opcional** (solo si los usas conmigo): Vercel, Google Drive/Gmail/Calendar.
- 🔴 **Quitar:** Higgsfield, Shopify, Uber, Uber Eats, Indeed — no tienen relación con tu trabajo y
  son los bloques más pesados. Es el mayor recorte de tokens.

---

## 📂 Para qué sirve cada archivo

| Archivo | Qué es |
|---|---|
| **CLAUDE.md** | Instrucciones para Claude (cómo trabajar en este repo). |
| **TRABAJO.md** | Estado general del trabajo (lo mantiene Claude). |
| **TRABAJO_ERICK.md** | Bitácora personal de Erick (se actualiza con `bye`). |
| **TRABAJO_ISAIAS.md** | Bitácora personal de Isaías. |
| **FLUJO.md** | Esta guía. |

---

## 🆘 Si algo sale mal

- "No me deja hacer `pull`" → seguramente tienes cambios sin guardar. Haz
  `npm run bye` primero (o dile a Claude que lo resuelva).
- "Me salió un conflicto" → no toques nada y dile a Claude: *"tengo un conflicto
  de git, ayúdame a resolverlo"*.
- "No veo mis cambios de la otra PC" → ¿hiciste `npm run hola`? ¿En la otra PC
  hiciste `npm run bye`?
