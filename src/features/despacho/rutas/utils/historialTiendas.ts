import { esperadoDesdeHistorial, empresaHabitual, type EsperadoTienda } from './enrutadorIncremental';

/** Fila de `picking_pallets` (una unidad registrada por bodega). `tipo` = P/B/C/CH. `date` = 'YYYY-MM-DD'. */
export interface FilaPicking { store_cod: string; tipo: string; date: string }
/** Fila de despacho (despacho_rm / despacho_regiones): quién llevó cada tienda y cuándo. */
export interface FilaDespacho { cod: string; fecha: string; transporte?: string | null }

/** Día de la semana (0=domingo) de una fecha 'YYYY-MM-DD', a mediodía local para no cruzar TZ. */
export function diaSemana(isoDate: string): number {
  return new Date(isoDate + 'T12:00:00').getDay();
}
/** Días enteros entre `fecha` (pasada) y `hoy`. Negativo si fecha es futura → se acota a 0 afuera. */
export function diasAtras(fecha: string, hoy: string): number {
  return Math.round((new Date(hoy + 'T12:00:00').getTime() - new Date(fecha + 'T12:00:00').getTime()) / 86_400_000);
}
/** Un contenedor ocupa piso como un pallet → cuenta para `techoPallets`. Bultos y chocolates no. */
const esPiso = (tipo: string): boolean => tipo === 'P' || tipo === 'C';

/**
 * Construye, por tienda, el `EsperadoTienda` para un día como `hoy` ('YYYY-MM-DD'):
 *  - VOLUMEN (`esperado`, `techoPallets`, `sinHistorial`) desde `picking_pallets`, filtrando el MISMO
 *    día de semana que `hoy` (baja la variabilidad). Cada fila es una unidad; `esperado` = mediana de
 *    unidades/día, `techoPallets` = promedio+1σ de (pallets+contenedores). Vía `esperadoDesdeHistorial`.
 *  - EMPRESA (`empresa`, `confianzaEmpresa`) desde los despachos (transporte por tienda/fecha), vía
 *    `empresaHabitual`, que pondera lo reciente (la operación cambió de transportista en el historial).
 *
 * Una tienda con despachos pero sin volumen histórico queda `sinHistorial:true` (no se cierra temprano).
 * Puro y testeable — no lee la BD; recibe las filas ya traídas.
 */
export function construirHistorialTiendas(
  picking: FilaPicking[],
  despachos: FilaDespacho[],
  hoy: string,
): Record<string, EsperadoTienda> {
  const dow = diaSemana(hoy);

  // Volumen: tienda → (día → { unidades, piso }), SOLO días PASADOS del mismo día de semana (el día
  // objetivo `hoy` está en curso, no cuenta como historial).
  const porDia = new Map<string, Map<string, { u: number; p: number }>>();
  for (const r of picking) {
    if (!r.store_cod || !r.date || r.date >= hoy || diaSemana(r.date) !== dow) continue;
    let dias = porDia.get(r.store_cod);
    if (!dias) { dias = new Map(); porDia.set(r.store_cod, dias); }
    const acc = dias.get(r.date) ?? { u: 0, p: 0 };
    acc.u += 1;
    if (esPiso(r.tipo)) acc.p += 1;
    dias.set(r.date, acc);
  }

  // Empresa: tienda → despachos pasados { empresa, diasAtras } (cualquier día de semana).
  const empresasPorTienda = new Map<string, { empresa: string; diasAtras: number }[]>();
  for (const d of despachos) {
    const emp = (d.transporte ?? '').trim();
    if (!d.cod || !d.fecha || !emp || d.fecha >= hoy) continue;
    const arr = empresasPorTienda.get(d.cod) ?? [];
    arr.push({ empresa: emp, diasAtras: Math.max(0, diasAtras(d.fecha, hoy)) });
    empresasPorTienda.set(d.cod, arr);
  }

  const out: Record<string, EsperadoTienda> = {};
  for (const cod of new Set<string>([...porDia.keys(), ...empresasPorTienda.keys()])) {
    const dias = porDia.get(cod);
    const unidadesPorDia = dias ? [...dias.values()].map(v => v.u) : [];
    const palletsPorDia  = dias ? [...dias.values()].map(v => v.p) : [];
    const { esperado, techoPallets, sinHistorial } = esperadoDesdeHistorial(unidadesPorDia, palletsPorDia);
    const emp = empresaHabitual(empresasPorTienda.get(cod) ?? []);
    out[cod] = {
      esperado, techoPallets, sinHistorial,
      ...(emp ? { empresa: emp.empresa, confianzaEmpresa: emp.confianza } : {}),
    };
  }
  return out;
}
