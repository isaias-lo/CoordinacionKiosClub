// Trae el backlog de 2ª vuelta calculado desde los datos, sin depender de que se cierre el día.
//
// El backlog "oficial" vive en `shared_session_state` (fuente 'segunda_vuelta') y solo se escribe
// al apretar "Terminar día". Cuando nadie cierra la jornada, la carga sobrante no queda registrada
// en ninguna parte: el tab dice "No hay pendientes" y es cierto, pero la carga existe.
//
// Acá se deduce de dos hechos que ya están en la base:
//
//     lo que Bodega REGISTRÓ ese día      (despacho_sesion)
//   − lo que entró en algún MANIFIESTO    (ruta_tiendas vía rutas_despacho)
//
// Lo guardado sigue mandando (ver `unirBacklog`): esto solo agrega lo que nadie alcanzó a registrar.

import { supabase } from '@/lib/supabase';
import { fechaChile } from '@/lib/fechaChile';
import { pendientesDelDia, type PendienteBacklog } from '@/features/despacho/rutas/utils/backlogSegundaVuelta';

interface FilaSesion {
  fecha: string; tienda_cod: string; fuente: string | null;
  pallets: number; bultos: number; contenedores: number | null; chocolates: number | null;
}

/** Los pendientes deducidos de los últimos `sinceDays` días, sin contar hoy. */
export async function fetchBacklogCalculado(sinceDays = 10): Promise<PendienteBacklog[]> {
  const hoy = fechaChile();
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - sinceDays);
  const desde = d.toISOString().slice(0, 10);

  const [sesion, rutas] = await Promise.all([
    supabase.from('despacho_sesion')
      .select('fecha, tienda_cod, fuente, pallets, bultos, contenedores, chocolates')
      .gte('fecha', desde).lt('fecha', hoy),
    supabase.from('rutas_despacho')
      .select('fecha, ruta_tiendas(store_cod)')
      .gte('fecha', desde).lt('fecha', hoy),
  ]);

  if (sesion.error) { console.error('[backlogV2:sesion]', sesion.error.message); return []; }
  if (rutas.error)  { console.error('[backlogV2:rutas]',  rutas.error.message);  return []; }

  // Qué códigos salieron en un manifiesto, por fecha.
  const ruteadasPorFecha = new Map<string, Set<string>>();
  for (const r of (rutas.data ?? []) as { fecha: string; ruta_tiendas: { store_cod: string }[] | null }[]) {
    const set = ruteadasPorFecha.get(r.fecha) ?? new Set<string>();
    for (const t of r.ruta_tiendas ?? []) set.add(String(t.store_cod ?? '').trim().toUpperCase());
    ruteadasPorFecha.set(r.fecha, set);
  }

  // La carga registrada, por fecha. Congelados NO entra: tiene su propio flujo y su propia pestaña.
  const cargaPorFecha = new Map<string, FilaSesion[]>();
  for (const f of (sesion.data ?? []) as FilaSesion[]) {
    if ((f.fuente ?? '').startsWith('congelados')) continue;
    cargaPorFecha.set(f.fecha, [...(cargaPorFecha.get(f.fecha) ?? []), f]);
  }

  const out: PendienteBacklog[] = [];
  for (const [fecha, filas] of cargaPorFecha) {
    out.push(...pendientesDelDia(
      filas.map(f => ({
        cod: f.tienda_cod, pallets: f.pallets, bultos: f.bultos,
        contenedores: f.contenedores ?? 0, chocolates: f.chocolates ?? 0,
      })),
      ruteadasPorFecha.get(fecha) ?? new Set<string>(),
      fecha,
    ));
  }
  return out;
}
