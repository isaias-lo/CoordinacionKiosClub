# 🧭 FLUJO DE TRABAJO — Cómo continuar entre el trabajo y la casa

Guía rápida para no perder avances y seguir desde donde quedaste, sin importar
en qué PC estés. **Léela cuando tengas dudas.**

---

## ✅ Regla de oro

> **`hola` al llegar  ·  `bye` antes de salir.**
> Todo tu trabajo viaja entre PCs **a través de GitHub (git)**. Lo que dejes
> sin subir, **NO** estará en la otra PC.

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

## 🔁 ¿Puedo usar la MISMA rama en mi PC del trabajo y en la de casa?

**Sí, y es lo recomendado.** No necesitas una rama por lugar.

- Trabaja siempre en **tu rama del día/sesión** (ej. `inicio`, `martes1`...).
- La rama vive en GitHub; ambas PCs la comparten.
- Mientras hagas **`bye` antes de salir** y **`hola` al llegar**, nunca habrá
  conflictos: cada PC siempre arranca con lo último.
- ⚠️ Lo único que NO debes hacer: ponerte a trabajar **sin `hola` primero**. Si
  editas sobre una versión vieja, se pueden generar conflictos.

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
