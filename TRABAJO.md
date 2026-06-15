# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-14 20:15
Último commit: WIP: auto-save antes de compactar contexto
Rama: inicio

## Archivos modificados recientemente
.claude/settings.local.json
supabase/migrations/046_rls_calendario_armado_notificaciones.sql

## En progreso
NADA en curso — jornada cerrada con todo en producción. main = inicio = deploy Vercel
= commit e82c26b (verificado en el dashboard de Vercel).

Cerrado hoy (todo mergeado a main, PRs #19–#23):
- Code review (211 issues) COMPLETO: PR 1A/1B (auth endpoints + cookie), PR 2
  (XSS/setTimeout/blob URLs/className), PR 3 (error.tsx + loading), PR 4
  (calcAuditado + rateLimit doc + clamp trazabilidad).
- feat: Registrar Despacho → abre auto el panel de Manifiestos (+ botón secundario).
- fix: sidebar oculto en Safari en /registros (overlay → flujo normal).
- fix: tienda duplicada 23PEN→23PEÑ (ALIAS + test) Y limpieza de DATOS en Supabase
  (migrado el registro en despacho_rm, eliminada la fila duplicada).
- fix: RLS activado en calendario_armado y calendario_notificaciones (migración
  046, política solo authenticated, aplicada y verificada).

## Próximos pasos (sin urgencia)
1. Deuda diferida (sin bugs activos): refactor de componentes monolíticos
   (StepForm ~2384 líneas, AuditoriaScreen ~2400); rateLimit→Redis solo si crece
   el volumen; issues LOW del reporte original.
2. Seguridad menor (preexistente, opcional): activar Leaked Password Protection en
   Supabase Auth; revisar buckets públicos (audit-photos/guides/signatures);
   search_path en funciones; handle_new_user SECURITY DEFINER.
Plan completo: ~/.claude/plans/un-agente-reviso-el-scalable-hickey.md
