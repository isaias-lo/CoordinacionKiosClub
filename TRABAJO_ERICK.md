# Estado actual del trabajo — Erick

## Última sesión
Fecha: 2026-06-07
Último commit: feat(skills): agregar 10 skills de Antigravity + reglas de auto-activación (`1cde6b0`)
Rama: inicio

## Qué se hizo esta sesión
1. **Migración a rama `inicio`** — Se abandonó `desdecasamac` (atrasada 60 commits). Trabajando desde `inicio` que tiene todos los cambios del trabajo.
2. **Evaluación de 6 Claude Code skills/herramientas:**
   - Superpowers → ❌ No (metodología rígida, sin tests en el proyecto)
   - UI UX Pro Max → ✅ Ya estaba activo — usar con `/ui-ux-pro-max`
   - claude-mem → ❌ No (no sincroniza entre PCs, inferior a TRABAJO.md en git)
   - Antigravity Awesome Skills → ✅ Instalado (10 skills seleccionados)
   - Andrej Karpathy Skills → ❌ No (redundante, ya en Claude Code nativo)
   - Everything Claude Code → ⚠️ Pendiente evaluar con `--profile minimal`
3. **10 skills instalados en `.claude/skills/`** (en el repo, disponibles para todo el equipo):
   - `nextjs-app-router-patterns`, `nextjs-supabase-auth`
   - `odoo-rpc-api`, `odoo-performance-tuner`
   - `frontend-ui-dark-ts`, `database-design`, `database-optimizer`
   - `auth-implementation-patterns`, `api-security-best-practices`
   - `e2e-testing-patterns`
4. **Auto-activación configurada en CLAUDE.md** — los skills se activan solos según el contexto del archivo que se edite.

## Sesión anterior (2026-06-09)
5 fixes ya en `main`:
1. Bug bodegas: ítems agregados ya no vuelven a formulario al navegar.
2. Chocolates auto-agregados a 20 kg + clic agrega sin pedir peso.
3. Crear IDs desde bodega (todos los tipos), excluidos de Picking.
4. Guía 35BNT → 35BN2.
5. Eliminado "Movimientos" de Picking.

## Próximos pasos
- Probar en vivo los 5 fixes de bodegas/chocolates.
- Evaluar Everything Claude Code con `--profile minimal`.
- Si el equipo crece a 3+, revisar Superpowers (ver memoria del proyecto).

## Recordatorio
- Al llegar:  `npm run hola`
- Antes de salir:  `npm run bye`
- Detalle completo en FLUJO.md
