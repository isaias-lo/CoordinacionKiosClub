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
import { pendientesDelDia, ruteadasParaOrigen, type PendienteBacklog } from '@/features/despacho/rutas/utils/backlogSegundaVuelta';

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

  // Los manifiestos se miran HASTA una semana adelante, no hasta ayer: una 2ª vuelta se despacha
  // DESPUÉS del día de origen, así que cortar en "hoy" dejaba fuera justo lo que cierra la deuda.
  // El tope existe porque hay fechas basura en la tabla (un manifiesto con fecha 2099-12-31): sin
  // él, un dedazo marcaría esa tienda como despachada para siempre.
  const tope = new Date(`${hoy}T00:00:00Z`);
  tope.setUTCDate(tope.getUTCDate() + 7);
  const hastaManifiestos = tope.toISOString().slice(0, 10);

  const [sesion, rutas] = await Promise.all([
    supabase.from('despacho_sesion')
      .select('fecha, tienda_cod, fuente, pallets, bultos, contenedores, chocolates')
      .gte('fecha', desde).lt('fecha', hoy),
    supabase.from('rutas_despacho')
      .select('fecha, ruta_tiendas(store_cod)')
      .gte('fecha', desde).lte('fecha', hastaManifiestos),
  ]);

  if (sesion.error) { console.error('[backlogV2:sesion]', sesion.error.message); return []; }
  if (rutas.error)  { console.error('[backlogV2:rutas]',  rutas.error.message);  return []; }

  const manifiestos = ((rutas.data ?? []) as { fecha: string; ruta_tiendas: { store_cod: string }[] | null }[])
    .map(r => ({ fecha: r.fecha, cods: (r.ruta_tiendas ?? []).map(t => t.store_cod) }));

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
      // Salió ese día O DESPUÉS: la 2ª vuelta se despacha en un día posterior al de origen.
      ruteadasParaOrigen(manifiestos, fecha),
      fecha,
    ));
  }
  return out;
}
