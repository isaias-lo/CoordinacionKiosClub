import { supabase } from './supabase';
import { fetchCalendarioSupa } from './calendarioSync';

export type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

export interface CambioCal {
  dia: string;
  tipo: 'add' | 'remove' | 'move';
  tienda: string;
  from_dia?: string; // solo cuando tipo='move'
  grupo: 'rm' | 'costa' | 'fal';
}

export interface Notificacion {
  id: string;
  created_at: string;
  created_by: string | null;
  cambios: CambioCal[];
  cal_snapshot: CalRecord;
  estado: 'pendiente' | 'aprobada' | 'descartada';
}

const ROW_ID = 'current';

// ── calendario_armado ─────────────────────────────────────────────

export async function fetchCalendarioArmado(): Promise<CalRecord | null> {
  const { data, error } = await supabase
    .from('calendario_armado')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) console.error('[calendarioArmado:fetch]', error.message);
  return (data?.data as CalRecord) ?? null;
}

export async function saveCalendarioArmado(cal: CalRecord, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_armado')
    .upsert(
      { id: ROW_ID, data: cal, updated_at: new Date().toISOString(), ...(userId ? { updated_by: userId } : {}) },
      { onConflict: 'id' }
    );
  if (error) throw new Error(error.message);
}

export function subscribeToCalendarioArmado(onCal: (cal: CalRecord) => void): () => void {
  const channel = supabase
    .channel(`calendario-armado-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_armado', filter: `id=eq.${ROW_ID}` },
      (payload) => {
        const row = payload.new as { data?: CalRecord } | null;
        if (row?.data) onCal(row.data);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ── diff ──────────────────────────────────────────────────────────

export function computeDiff(calViejo: CalRecord, calNuevo: CalRecord): CambioCal[] {
  const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
  const GRUPOS = ['rm', 'costa', 'fal'] as const;
  const cambios: CambioCal[] = [];

  // Build lookup: tienda → días en calViejo
  const viejoMap: Record<string, { dia: string; grupo: 'rm' | 'costa' | 'fal' }[]> = {};
  for (const dia of DIAS) {
    for (const grupo of GRUPOS) {
      for (const tienda of calViejo[dia]?.[grupo] ?? []) {
        if (!viejoMap[tienda]) viejoMap[tienda] = [];
        viejoMap[tienda].push({ dia, grupo });
      }
    }
  }

  // Build lookup: tienda → días en calNuevo
  const nuevoMap: Record<string, { dia: string; grupo: 'rm' | 'costa' | 'fal' }[]> = {};
  for (const dia of DIAS) {
    for (const grupo of GRUPOS) {
      for (const tienda of calNuevo[dia]?.[grupo] ?? []) {
        if (!nuevoMap[tienda]) nuevoMap[tienda] = [];
        nuevoMap[tienda].push({ dia, grupo });
      }
    }
  }

  // All tiendas mentioned in either
  const allTiendas = new Set([...Object.keys(viejoMap), ...Object.keys(nuevoMap)]);

  for (const tienda of allTiendas) {
    const viejos = viejoMap[tienda] ?? [];
    const nuevos = nuevoMap[tienda] ?? [];

    const viejosStr = viejos.map(x => `${x.dia}:${x.grupo}`).sort().join(',');
    const nuevosStr = nuevos.map(x => `${x.dia}:${x.grupo}`).sort().join(',');
    if (viejosStr === nuevosStr) continue;

    // Tienda nueva (no estaba en ningún día)
    if (viejos.length === 0) {
      for (const { dia, grupo } of nuevos) {
        cambios.push({ dia, tipo: 'add', tienda, grupo });
      }
      continue;
    }

    // Tienda eliminada (no aparece en ningún día)
    if (nuevos.length === 0) {
      for (const { dia, grupo } of viejos) {
        cambios.push({ dia, tipo: 'remove', tienda, grupo });
      }
      continue;
    }

    // Detectar días removidos
    for (const { dia, grupo } of viejos) {
      const sigue = nuevos.some(n => n.dia === dia && n.grupo === grupo);
      if (!sigue) {
        // ¿se movió a otro día?
        const destino = nuevos.find(n => n.grupo === grupo && !viejos.some(v => v.dia === n.dia && v.grupo === n.grupo));
        if (destino) {
          cambios.push({ dia: destino.dia, tipo: 'move', tienda, grupo, from_dia: dia });
        } else {
          cambios.push({ dia, tipo: 'remove', tienda, grupo });
        }
      }
    }

    // Detectar días agregados (que no eran moves)
    const movesDestino = new Set(
      cambios.filter(c => c.tienda === tienda && c.tipo === 'move').map(c => `${c.dia}:${c.grupo}`)
    );
    for (const { dia, grupo } of nuevos) {
      const estaba = viejos.some(v => v.dia === dia && v.grupo === grupo);
      const esMove = movesDestino.has(`${dia}:${grupo}`);
      if (!estaba && !esMove) {
        cambios.push({ dia, tipo: 'add', tienda, grupo });
      }
    }
  }

  return cambios;
}

// ── calendar_notificaciones ───────────────────────────────────────

export async function crearNotificacion(
  cambios: CambioCal[],
  calSnapshot: CalRecord,
  createdBy?: string
): Promise<void> {
  if (cambios.length === 0) return;
  const { error } = await supabase.from('calendario_notificaciones').insert({
    cambios,
    cal_snapshot: calSnapshot,
    estado: 'pendiente',
    ...(createdBy ? { created_by: createdBy } : {}),
  });
  if (error) console.error('[notificaciones:crear]', error.message);
}

export async function fetchNotificacionesPendientes(): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from('calendario_notificaciones')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  if (error) { console.error('[notificaciones:fetch]', error.message); return []; }
  return (data ?? []) as Notificacion[];
}

export function subscribeToNotificaciones(onUpdate: (notifs: Notificacion[]) => void): () => void {
  const channel = supabase
    .channel(`notificaciones-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_notificaciones' },
      async () => {
        const notifs = await fetchNotificacionesPendientes();
        onUpdate(notifs);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function descartarNotificacion(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_notificaciones')
    .update({ estado: 'descartada' })
    .eq('id', id);
  if (error) console.error('[notificaciones:descartar]', error.message);
}

// Applies ALL changes from a notification's snapshot to the current despacho calendar
export async function aprobarTodosLosCambios(
  notifId: string,
  calSnapshot: CalRecord,
  userId?: string
): Promise<void> {
  const { saveCalendario, pushCalendario } = await import('./calendarioSync');
  await saveCalendario(calSnapshot, userId);
  // Update localStorage cache so other tabs pick it up immediately
  if (typeof window !== 'undefined') {
    localStorage.setItem('_calCentral', JSON.stringify({ cal: calSnapshot, ts: Date.now() }));
    window.dispatchEvent(new StorageEvent('storage', { key: '_calCentral' }));
  }
  await supabase
    .from('calendario_notificaciones')
    .update({ estado: 'aprobada' })
    .eq('id', notifId);
  void pushCalendario; // imported but used via saveCalendario above
}

// Applies a single CambioCal to the current despacho calendar
export async function aprobarCambioIndividual(
  _notifId: string,
  cambio: CambioCal,
  calDespachoActual: CalRecord,
  _todosLosCambios: CambioCal[],
  userId?: string
): Promise<CalRecord> {
  const { saveCalendario } = await import('./calendarioSync');
  const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
  const next: CalRecord = JSON.parse(JSON.stringify(calDespachoActual));

  // Ensure all days exist
  for (const dia of DIAS) {
    if (!next[dia]) next[dia] = { rm: [], costa: [], fal: [] };
  }

  const g = cambio.grupo;

  if (cambio.tipo === 'add') {
    if (!next[cambio.dia][g].includes(cambio.tienda)) {
      next[cambio.dia][g].push(cambio.tienda);
    }
  } else if (cambio.tipo === 'remove') {
    next[cambio.dia][g] = next[cambio.dia][g].filter(t => t !== cambio.tienda);
  } else if (cambio.tipo === 'move') {
    // Remove from source day
    if (cambio.from_dia) {
      next[cambio.from_dia][g] = next[cambio.from_dia][g].filter(t => t !== cambio.tienda);
    }
    // Add to destination day
    if (!next[cambio.dia][g].includes(cambio.tienda)) {
      next[cambio.dia][g].push(cambio.tienda);
    }
  }

  await saveCalendario(next, userId);
  if (typeof window !== 'undefined') {
    localStorage.setItem('_calCentral', JSON.stringify({ cal: next, ts: Date.now() }));
    window.dispatchEvent(new StorageEvent('storage', { key: '_calCentral' }));
  }

  return next;
}

// Discard a single change (mark partial approval — just update local state, no DB action needed)
// When ALL changes of a notification are handled (approved or discarded), mark it as aprobada
export async function marcarNotificacionResuelta(notifId: string): Promise<void> {
  await supabase
    .from('calendario_notificaciones')
    .update({ estado: 'aprobada' })
    .eq('id', notifId);
}

// Fetch current despacho calendar (from Supabase source of truth)
export async function fetchCalendarioDespacho(): Promise<CalRecord | null> {
  return fetchCalendarioSupa();
}
