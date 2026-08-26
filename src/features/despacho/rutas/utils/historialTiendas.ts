import { esperadoDesdeHistorial, empresaHabitual, type EsperadoTienda } from './enrutadorIncremental';

/** Fila de `picking_pallets` (una unidad registrada por bodega). `tipo` = P/B/C/CH. `date` = 'YYYY-MM-DD'. */
export interface FilaPicking { store_cod: string; tipo: string; date: string }
/** Fila de despacho (despacho_rm / despacho_regiones): quién llevó cada tienda y cuándo. */
export interface FilaDespacho { cod: string; fecha: string; transporte?: string | null }

/**
 * Normaliza una fecha a ISO 'YYYY-MM-DD'.
 *
 * En la base conviven DOS formatos y hay que aceptar los dos: `picking_pallets.date` viene ISO,
 * pero `despacho_rm.fecha` y `despacho_regiones.fecha` vienen en `DD/MM/YYYY` — las 5.662 filas,
 * sin una sola excepción. Tratar esas como ISO rompía el módulo por partida doble:
 *   · el filtro `fecha >= hoy` compara STRINGS, y '30/05/2026' > '2026-08-26' porque '3' > '2',
 *     así que se descartaba en silencio el 32% del historial (todas las fechas con día 26 al 31);
 *   · `new Date('13/05/2026T12:00:00')` es Invalid Date → `diasAtras` daba NaN → el peso de
 *     recencia daba NaN → la empresa quedaba al azar y la confianza NaN. Y como `NaN < umbral` es
 *     false, el guardarraíl no cortaba: el aviso salía igual, mostrando "NaN%".
 *
 * Devuelve '' si no reconoce el formato, para IGNORAR la fila en vez de ensuciar el cálculo.
 */
export function normalizarFecha(fecha: string): string {
  const s = String(fecha ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return '';
}

/** Día de la semana (0=domingo), a mediodía local para no cruzar TZ. Acepta ambos formatos.
 *  Devuelve NaN si la fecha no se reconoce — el llamador debe descartar esas filas. */
export function diaSemana(fecha: string): number {
  const iso = normalizarFecha(fecha);
  if (!iso) return NaN;
  return new Date(iso + 'T12:00:00').getDay();
}

/** Días enteros entre `fecha` (pasada) y `hoy`. Acepta ambos formatos; NaN si alguna no se
 *  reconoce. Negativo si `fecha` es futura → se acota a 0 afuera. */
export function diasAtras(fecha: string, hoy: string): number {
  const a = normalizarFecha(fecha), b = normalizarFecha(hoy);
  if (!a || !b) return NaN;
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
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
  const hoyISO = normalizarFecha(hoy);
  const dow = diaSemana(hoyISO);

  // Volumen: tienda → (día → { unidades, piso }), SOLO días PASADOS del mismo día de semana (el día
  // objetivo `hoy` está en curso, no cuenta como historial).
  const porDia = new Map<string, Map<string, { u: number; p: number }>>();
  for (const r of picking) {
    // Se normaliza ANTES de comparar: `fecha >= hoy` sobre strings solo es válido en ISO.
    const fecha = normalizarFecha(r.date);
    if (!r.store_cod || !fecha || fecha >= hoyISO || diaSemana(fecha) !== dow) continue;
    let dias = porDia.get(r.store_cod);
    if (!dias) { dias = new Map(); porDia.set(r.store_cod, dias); }
    const acc = dias.get(fecha) ?? { u: 0, p: 0 };
    acc.u += 1;
    if (esPiso(r.tipo)) acc.p += 1;
    dias.set(fecha, acc);
  }

  // Empresa: tienda → despachos pasados { empresa, diasAtras } (cualquier día de semana).
  const empresasPorTienda = new Map<string, { empresa: string; diasAtras: number }[]>();
  for (const d of despachos) {
    const emp = (d.transporte ?? '').trim();
    const fecha = normalizarFecha(d.fecha);   // acá llega DD/MM/YYYY en el 100% de las filas
    if (!d.cod || !fecha || !emp || fecha >= hoyISO) continue;
    const dias = diasAtras(fecha, hoyISO);
    if (!Number.isFinite(dias)) continue;
    const arr = empresasPorTienda.get(d.cod) ?? [];
    arr.push({ empresa: emp, diasAtras: Math.max(0, dias) });
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
