import { supabase } from './supabase';

// 'rutas_reg' = marca de "este día ya se registró en el Enrutador" (para avisar de días sin registrar).
// 'rutas_cerradas' = set de patentes CERRADAS individualmente en 1ª vuelta (cierre por vehículo), por fecha.
type Fuente = 'regiones' | 'santiago' | 'guides' | 'rutas' | 'rutas_v2' | 'segunda_vuelta' | 'rutas_reg' | 'rutas_cerradas' | 'congelados-santiago' | 'congelados-regiones' | 'rutas_congelados';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Upsert the shared state for a date (default = today). Todos los usuarios comparten la misma
 * fila por (fecha, fuente). `fecha` permite operar sobre un día pasado (p. ej. registrar en el
 * Enrutador una fecha que quedó sin registrar).
 */
/** Resultado de un guardado. `ok:false` = NO llegó a la base y hay que reintentar. */
export interface PushResult { ok: boolean; updatedAt: number | null }

/**
 * Igual que `pushSessionState`, pero dice si el guardado llegó.
 *
 * `pushSessionState` devuelve `null` tanto cuando falla como cuando la fila no trae `updated_at`,
 * así que quien lo llama no puede distinguir «falló» de «se guardó sin marca de tiempo». Esa
 * ambigüedad es la que dejaba dar por guardado lo que nunca se escribió.
 */
export async function pushSessionStateResult(fuente: Fuente, state: unknown, userId?: string, fecha: string = todayISO()): Promise<PushResult> {
  const payload: Record<string, unknown> = {
    fecha,
    fuente,
    state,
    updated_at: new Date().toISOString(),
  };
  if (userId) payload.updated_by = userId;

  const { data, error } = await supabase
    .from('shared_session_state')
    .upsert(payload, { onConflict: 'fecha,fuente' })
    .select('updated_at')
    .maybeSingle();

  if (error) { console.error('[sync:push]', fuente, error.message, error.details); return { ok: false, updatedAt: null }; }
  return { ok: true, updatedAt: data?.updated_at ? new Date(data.updated_at as string).getTime() : null };
}

export async function pushSessionState(fuente: Fuente, state: unknown, userId?: string, fecha: string = todayISO()): Promise<number | null> {
  const { ok, updatedAt } = await pushSessionStateResult(fuente, state, userId, fecha);
  if (!ok) return null;
  // [C3/RC-6] Devolvemos el `updated_at` que quedó en la fila para poder ordenar los sync por reloj
  // del SERVIDOR (autoritativo cuando el trigger está aplicado) en vez del reloj de cada equipo.
  return updatedAt;
}

export interface SessionStateMeta { state: unknown; updatedAt: number | null }

/**
 * Igual que {@link fetchSessionState} pero además devuelve el `updated_at` de la fila (en ms) para
 * ordenar los sync por reloj del SERVIDOR (C3/RC-6). La usan las vistas de Bodega; el resto de las
 * fuentes siguen usando `fetchSessionState` sin cambios.
 */
export async function fetchSessionStateMeta(fuente: Fuente, fecha: string = todayISO()): Promise<SessionStateMeta | null> {
  const { data, error } = await supabase
    .from('shared_session_state')
    .select('state, updated_at')
    .eq('fecha', fecha)
    .eq('fuente', fuente)
    .maybeSingle();

  if (error) { console.error('[sync:fetch]', fuente, error.message); return null; }
  if (!data) return null;
  return { state: data.state ?? null, updatedAt: data.updated_at ? new Date(data.updated_at as string).getTime() : null };
}

/** Fetch the shared state for a date (default = today). Any authenticated user can read. */
export async function fetchSessionState(fuente: Fuente, fecha: string = todayISO()): Promise<unknown | null> {
  const meta = await fetchSessionStateMeta(fuente, fecha);
  return meta?.state ?? null;
}

/**
 * ¿Hay que DESCARTAR un remoto por ser más viejo que lo último que ya incorporé (mi último push o la
 * última adopción)? Usa el reloj del SERVIDOR (`updated_at`, C3/RC-6) cuando ambos lados lo tienen
 * —así no importa el desfase de relojes entre equipos—; si no (fila legacy o trigger sin aplicar),
 * cae al `pushedAt` del cliente (comportamiento previo, sin regresión). `ultimo*` en 0 = todavía no
 * incorporé nada ⇒ nunca descarta (el primer remoto siempre entra).
 */
export function remotoEsMasViejo(
  serverStampRemoto: number | null | undefined,
  ultimoServerStamp: number,
  pushedAtRemoto: number | null | undefined,
  ultimoPushedAtCliente: number,
): boolean {
  if (serverStampRemoto != null && ultimoServerStamp > 0) return serverStampRemoto < ultimoServerStamp;
  if (typeof pushedAtRemoto === 'number') return pushedAtRemoto < ultimoPushedAtCliente;
  return false;
}

/**
 * Devuelve los días PASADOS (últimos `sinceDays`) que tienen asignaciones en el Enrutador
 * (`fuente='rutas'` con al menos una tienda) pero NO fueron registrados (`fuente='rutas_reg'`
 * ausente). Sirve para avisar "quedó sin registrar el día X" al abrir un día nuevo.
 */
export async function fetchUnregisteredRutasDays(sinceDays = 10): Promise<string[]> {
  const today = todayISO();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('shared_session_state')
    .select('fecha, fuente, state')
    // [Fase 1] También 'cierre' y 'rutas_cerradas'. El aviso preguntaba solo por 'rutas_reg', un
    // marcador que en el flujo real NADIE escribe: lo ponen el registro global (que exige haber
    // pasado por "Calcular") y la ✕ manual. Por eso volvía todos los días aunque el día estuviera
    // cerrado y registrado — comprobado en la base: 20 filas seguidas de descarte a mano.
    .in('fuente', ['rutas', 'rutas_reg', 'cierre', 'rutas_cerradas'])
    .gte('fecha', sinceISO)
    .lt('fecha', today); // solo días pasados

  if (error) { console.error('[sync:unregistered]', error.message); return []; }
  return computeUnregisteredDays((data ?? []) as SessionStateRow[]);
}

export interface SessionStateRow { fecha: string; fuente: string; state: unknown }

/**
 * Lógica pura: de filas (rutas + rutas_reg), devuelve los días con asignaciones no vacías
 * (`fuente='rutas'`) que NO tienen marca de registro (`fuente='rutas_reg'`). Más reciente primero.
 */
export function computeUnregisteredDays(rows: SessionStateRow[]): string[] {
  const asignByDate = new Map<string, unknown>();
  const cerradasPorDia = new Map<string, Set<string>>();
  const atendido = new Set<string>();
  for (const r of rows) {
    // Tres señales de que el día YA se atendió, no una:
    //   rutas_reg → se registró de forma global, o se descartó con la ✕
    //   cierre    → se pulsó "Terminar día" (lo que la gente realmente hace)
    if (r.fuente === 'rutas_reg' || r.fuente === 'cierre') atendido.add(r.fecha);
    else if (r.fuente === 'rutas') asignByDate.set(r.fecha, r.state);
    else if (r.fuente === 'rutas_cerradas') cerradasPorDia.set(r.fecha, parsePatentes(r.state));
  }
  const camionesConTiendas = (state: unknown): string[] =>
    (!!state && typeof state === 'object')
      ? Object.entries(state as Record<string, unknown>)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([patente]) => patente.trim().toUpperCase())
      : [];

  const result: string[] = [];
  for (const [fecha, state] of asignByDate) {
    if (atendido.has(fecha)) continue;
    const camiones = camionesConTiendas(state);
    if (!camiones.length) continue;
    // Tercera señal: si TODOS los camiones con carga se cerraron uno por uno, el día está hecho
    // aunque nunca se haya pulsado "Terminar día".
    const cerradas = cerradasPorDia.get(fecha);
    if (cerradas && camiones.every(p => cerradas.has(p))) continue;
    result.push(fecha);
  }
  return result.sort().reverse(); // más reciente primero
}

/** Patentes de la fuente 'rutas_cerradas', normalizadas. Tolera `{patentes:[…]}` o un array plano. */
function parsePatentes(state: unknown): Set<string> {
  const out = new Set<string>();
  const lista = Array.isArray(state)
    ? state
    : (state && typeof state === 'object' && Array.isArray((state as { patentes?: unknown }).patentes))
      ? (state as { patentes: unknown[] }).patentes
      : [];
  for (const x of lista) if (typeof x === 'string' && x.trim()) out.add(x.trim().toUpperCase());
  return out;
}

export interface PendienteV2 { c: string; p: number; b: number; ch: number; fechaOrigen: string }

/**
 * Lógica pura: aplana las filas `segunda_vuelta` (una por fecha) en una lista de tiendas
 * pendientes, cada una con su `fechaOrigen`. Ignora counts vacíos. Para el tab "2ª VUELTA".
 */
export function flattenPendientesV2(rows: { fecha: string; state: unknown }[]): PendienteV2[] {
  const out: PendienteV2[] = [];
  for (const r of rows) {
    const stores = ((r.state as { stores?: { c: string; p?: number; b?: number; ch?: number }[] } | null)?.stores) ?? [];
    for (const s of stores) {
      const p = s.p ?? 0, b = s.b ?? 0, ch = s.ch ?? 0;
      if (p === 0 && b === 0 && ch === 0) continue;
      out.push({ c: s.c, p, b, ch, fechaOrigen: r.fecha });
    }
  }
  return out;
}

/**
 * Pendientes de 2ª vuelta de días PASADOS (fuente `segunda_vuelta`, fecha < hoy), aplanadas con su
 * fecha origen. Alimenta el pool del tab "2ª VUELTA" del Enrutador.
 */
export async function fetchPendientesV2Pasadas(sinceDays = 10): Promise<PendienteV2[]> {
  const today = todayISO();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('shared_session_state')
    .select('fecha, state')
    .eq('fuente', 'segunda_vuelta')
    .gte('fecha', sinceISO)
    .lt('fecha', today);

  if (error) { console.error('[sync:pendientesV2]', error.message); return []; }
  return flattenPendientesV2((data ?? []) as { fecha: string; state: unknown }[]);
}

/**
 * Subscribe to real-time changes on the shared state.
 * All users (including other people) trigger this callback when they push changes.
 *
 * @param onStatus  Optional. Reports WebSocket connection health (true = SUBSCRIBED).
 *                  Used by callers to skip the polling fallback while Realtime is live,
 *                  which avoids re-downloading the full state blob every few seconds (egress).
 */
export function subscribeToSessionState(
  fuente: Fuente,
  _userId: string,
  onState: (state: unknown, updatedAt?: number) => void,
  onStatus?: (connected: boolean) => void,
  fecha: string = todayISO(),
): () => void {
  const channelId = `shared-state-${fuente}-${fecha}-${Math.random().toString(36).slice(2, 7)}`;
  // Supabase Realtime solo admite UNA condición de filtro por suscripción.
  // Filtramos por `fuente` en el servidor y validamos `fecha`/`fuente` en el
  // callback (un filtro multi-condición con coma es inválido y dejaba pasar
  // eventos de otras fuentes → cross-contaminación de estado entre vistas).
  const channel = supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_session_state', filter: `fuente=eq.${fuente}` },
      (payload) => {
        const row = payload.new as { state?: unknown; fecha?: string; fuente?: string; updated_at?: string } | null;
        if (!row) return;
        if (row.fecha !== fecha || row.fuente !== fuente) return; // solo hoy + esta fuente
        if (row.state) onState(row.state, row.updated_at ? new Date(row.updated_at).getTime() : undefined);
      },
    )
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));

  return () => { supabase.removeChannel(channel); };
}
