-- 046: Activar Row Level Security en calendario_armado y calendario_notificaciones
--
-- Ambas tablas estaban con RLS DESACTIVADO (advisor crítico de Supabase): con la
-- anon key cualquiera podía leer/modificar todas sus filas. Se acceden directo
-- desde el navegador (cliente anon) e incluso vía Realtime, desde
-- src/lib/calendarioArmadoSync.ts (control-interno calendario armado, campana de
-- notificaciones, picking).
--
-- Política elegida: SOLO rol `authenticated`. La anon key sola ya no puede tocar
-- estas tablas; hace falta sesión Supabase. Las páginas que las usan ya requieren
-- sesión, así que el rol efectivo del navegador es `authenticated` (Realtime
-- respeta RLS por rol). El service_role bypasea RLS automáticamente.

ALTER TABLE public.calendario_armado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario_notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendario_armado_auth" ON public.calendario_armado
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "calendario_notificaciones_auth" ON public.calendario_notificaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
