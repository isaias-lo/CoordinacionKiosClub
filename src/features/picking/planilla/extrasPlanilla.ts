// Agregados, Extra y Solicitudes en la Planilla. Módulo puro.
//
// ── QUÉ ES ESTO ───────────────────────────────────────────────────────────────────────────────
//
// La Planilla muestra, por tienda, lo de Comida, Aseo, Hogar y Chocolates del día: lo que va a la
// hoja de olas. `movimientosDesdeOdoo` descarta todo lo demás, y con eso quedaba sin verse trabajo
// real de los pickers. Del 02 al 19/11/2026 fueron 20 Extra (821 productos), 96 Agregados y 24
// Solicitudes, además de lo pickeado para tiendas que ese día no despachaban.
//
// Decisión del coordinador (22/11/2026): todo eso se VE en la Planilla y va al respaldo de
// productividad, pero NO a la hoja de olas, porque no se sabe si la jefatura lo dimensiona para el
// bono. Por eso vive en una lista aparte de `movimientos`: lo que se registra en olas sale de esa
// otra lista, y esto no entra nunca ahí.
//
// ── QUÉ NO SE MUESTRA ─────────────────────────────────────────────────────────────────────────
//
// Lo que no pasó por una TANDA, igual que en Estadísticas y la planilla del bono. El tipo «Despacho
// Tiendas» trae mucho más que picking: medido del 02 al 19/11/2026, sin tanda vienen 2.347
// movimientos sin origen, los agregados de Inventario, de Etiquetado y de la Web, ajustes (merma,
// sobrantes, cuadre), devoluciones, Falabella Full y ventas sueltas. Con tanda vienen los 20 Extra,
// los Agregados de Cheaf, chocolates, exhibidores y display, y las Solicitudes de tienda. Lo
// conocido que llega sin tanda son 20 movimientos, y 18 no tienen una persona detrás (sin cuenta,
// o la cuenta genérica «Abastecimiento»).
//
// Lo que ven otras áreas, por decisión del coordinador: Meli Full, Walmart Full, la Web y Seremi.
// Meli, Walmart y la Web se reconocen porque su destino en Odoo no es una tienda (88ML, 88WLT,
// 99WEB). Seremi sí va a tiendas («Agregado Seremi a Tiendas 29CFL»), así que se reconoce por el
// origen. Congelados tampoco va: tiene su propia pestaña y no es de esta planilla.

import { categoriaDeOrigin, esAuditoria } from '@/features/despacho/shared/aperturaOdoo';
import { resolveStoreCode } from '@/features/picking/picking-utils';
import { SECCIONES, type SeccionPlanilla } from './armarPlanilla';
import type { FilaGuardada } from './conCorrecciones';
import type { MovimientoOdoo } from './desdeOdoo';

/**
 * Qué es el movimiento. `Abastecimiento` es lo normal de una sección, pero de una tienda que ese
 * día no despacha: solo aparece en el bloque «Tiendas que hoy no despachan».
 */
export type TipoExtra = 'Extra' | 'Agregado' | 'Solicitud' | 'Abastecimiento';

export interface ExtraPlanilla {
  ref: string;
  cod: string;
  tipo: TipoExtra;
  /** El texto corto de la etiqueta: «Cheaf», «Extra · Comida», «Solicitud de tienda». */
  etiqueta: string;
  /** La sección, cuando el origen la dice. Un Agregado de Cheaf no la tiene. */
  seccion: SeccionPlanilla | null;
  /** Dónde suma en productividad. */
  especialidad: 'Seco' | 'Chocolates';
  origin: string;
  registros: number;
  picker: string;
  /** La cuenta cruda de Odoo. */
  cuenta: string;
  estado: string;
  asignadoEn: string | null;
  validadoEn: string | null;
  /** `corregido` si el nombre se cambió a mano en la Planilla. */
  origen?: 'corregido';
  /** Lo que decía Odoo antes de corregir. */
  pickerOdoo?: string;
}

export interface ExtrasDelDia {
  /** Por tienda del día: van en una franja bajo la fila de la tienda. */
  porTienda: Map<string, ExtraPlanilla[]>;
  /** Trabajo del día para tiendas que hoy no despachan. */
  fueraDelDia: ExtraPlanilla[];
}

/** Destinos de Odoo que no son tiendas. Se usa solo si el catálogo de tiendas no cargó. */
export const DESTINOS_NO_TIENDA: ReadonlySet<string> = new Set(['88ML', '88WLT', '99WEB', '99REC']);

/** Lo de otras áreas. Seremi va a tiendas, así que el destino no alcanza para separarlo. */
const DE_OTRAS_AREAS = /seremi|meli\s*full|walmart|traspaso\b.*\bweb/i;
const CONGELADOS = /congelad/i;
const EXTRA = /Abastecimiento\s+Extra\s+(?:Apertura\s+)?(Comida|Aseo|Hogar|Chocolates?)/i;
const AGREGADO = /^\s*agregado/i;
const ES_SECCION = new Set<string>(SECCIONES);
const ORDEN_TIPO: Record<TipoExtra, number> = { Abastecimiento: 0, Extra: 1, Agregado: 2, Solicitud: 3 };

function seccionDe(cruda: string): SeccionPlanilla {
  const c = cruda.toLowerCase();
  if (c.startsWith('chocolate')) return 'Chocolates';
  return (c.charAt(0).toUpperCase() + c.slice(1)) as SeccionPlanilla;
}

/** El nombre corto de un Agregado. Uno que no se conoce muestra lo que dice su origen. */
export function etiquetaAgregado(origin: string): string {
  const o = String(origin ?? '');
  if (/cheaf/i.test(o)) return 'Cheaf';
  if (/merry\s*candy/i.test(o)) return 'Merry Candy Box';
  if (/calendario/i.test(o)) return 'Calendario de Adviento';
  if (/^\s*agregado\s+chocolates?\b/i.test(o)) return 'Chocolates';
  if (/exhibidor/i.test(o)) return 'Exhibidores';
  if (/display/i.test(o)) return 'Display';
  if (/activaci/i.test(o)) return 'Activación';
  if (/solicitud/i.test(o)) return 'Solicitud de cliente';
  if (/hogar/i.test(o)) return 'Hogar';
  const resto = o.replace(/^\s*agregado\s*/i, '')
    .replace(/(?<![A-Z0-9Ñ])\d{2}[A-ZÑ]{2,4}\d?(?![A-Z0-9Ñ])/gi, '')
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '')
    .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : 'Agregado';
}

/** El nombre corto de una Solicitud. */
export function etiquetaSolicitud(origin: string): string {
  const o = String(origin ?? '');
  if (/solicitud\s+de\s+tienda/i.test(o)) return 'Solicitud de tienda';
  if (/cliente|venta/i.test(o)) return 'Pedido de cliente';
  return 'Solicitud';
}

/**
 * Los Agregados, Extra y Solicitudes del día, y lo pickeado para tiendas que hoy no despachan.
 *
 * `diaPorTienda` y `fecha` son los mismos de la Planilla. `planilla_dia` puede traer más de un día
 * por las aperturas: lo de esos otros días que no es de una tienda de la hoja se ignora, igual que
 * en `movimientosDesdeOdoo`. `esTienda` dice si un código es una tienda real del catálogo.
 */
export function extrasDesdeOdoo(
  crudos: readonly MovimientoOdoo[],
  nombres: Readonly<Record<string, string>>,
  diaPorTienda: ReadonlyMap<string, string>,
  fecha: string,
  esTienda: (cod: string) => boolean,
): ExtrasDelDia {
  const porTienda = new Map<string, ExtraPlanilla[]>();
  const fueraDelDia: ExtraPlanilla[] = [];
  const vistos = new Set<string>();

  for (const m of crudos) {
    const origin = String(m.origin ?? '');
    if (!m.ref || vistos.has(m.ref) || !m.enTanda) continue;
    if (esAuditoria(origin) || DE_OTRAS_AREAS.test(origin) || CONGELADOS.test(origin)) continue;
    const cod = resolveStoreCode({ toLocation: m.toLocation, origin, partner: m.partner });
    if (!cod || !esTienda(cod)) continue;

    const delDia = diaPorTienda.get(cod) === m.dia;
    if (!delDia && m.dia !== fecha) continue;

    let tipo: TipoExtra;
    let seccion: SeccionPlanilla | null = null;
    let etiqueta: string;
    const extra = EXTRA.exec(origin);
    const cat = categoriaDeOrigin(origin);
    if (extra) {
      tipo = 'Extra';
      seccion = seccionDe(extra[1]);
      etiqueta = `Extra · ${seccion}`;
    } else if (cat !== null) {
      // Lo normal de una tienda del día lo arma `movimientosDesdeOdoo`; acá solo queda lo de una
      // tienda que hoy no despacha.
      if (delDia || !ES_SECCION.has(cat)) continue;
      tipo = 'Abastecimiento';
      seccion = cat as SeccionPlanilla;
      etiqueta = seccion;
    } else if (AGREGADO.test(origin)) {
      tipo = 'Agregado';
      etiqueta = etiquetaAgregado(origin);
    } else {
      tipo = 'Solicitud';
      etiqueta = etiquetaSolicitud(origin);
    }

    vistos.add(m.ref);
    const x: ExtraPlanilla = {
      ref: m.ref, cod, tipo, etiqueta, seccion,
      especialidad: seccion === 'Chocolates' || /chocolate|merry\s*candy|calendario/i.test(origin)
        ? 'Chocolates' : 'Seco',
      origin,
      registros: m.registros,
      picker: m.responsable ? (nombres[m.responsable] ?? m.responsable) : '',
      cuenta: m.responsable ?? '',
      estado: m.estado,
      asignadoEn: m.asignadoEn,
      validadoEn: m.validadoEn,
    };
    if (delDia) {
      const lista = porTienda.get(cod);
      if (lista) lista.push(x); else porTienda.set(cod, [x]);
    } else {
      fueraDelDia.push(x);
    }
  }

  const orden = (a: ExtraPlanilla, b: ExtraPlanilla) =>
    ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
    || SECCIONES.indexOf(a.seccion ?? 'Comida') - SECCIONES.indexOf(b.seccion ?? 'Comida')
    || a.ref.localeCompare(b.ref);
  for (const lista of porTienda.values()) lista.sort(orden);
  fueraDelDia.sort((a, b) => a.cod.localeCompare(b.cod) || orden(a, b));
  return { porTienda, fueraDelDia };
}

/** Aplica las correcciones de la Planilla (por referencia) a los Agregados, Extra y Solicitudes. */
export function extrasConCorrecciones(e: ExtrasDelDia, guardados: readonly FilaGuardada[]): ExtrasDelDia {
  const porRef = new Map<string, FilaGuardada>();
  for (const g of guardados) if (g.ref && g.picker !== null) porRef.set(g.ref, g);
  const aplicar = (x: ExtraPlanilla): ExtraPlanilla => {
    const g = porRef.get(x.ref);
    if (!g || g.picker === null || g.picker === x.picker) return x;
    return { ...x, picker: g.picker, origen: 'corregido', pickerOdoo: g.pickerOdoo ?? x.picker };
  };
  return {
    porTienda: new Map([...e.porTienda].map(([cod, xs]) => [cod, xs.map(aplicar)])),
    fueraDelDia: e.fueraDelDia.map(aplicar),
  };
}

/** La sección con que se guarda la corrección de un extra: la suya, o el tipo si no tiene. */
export function seccionDeCorreccion(x: ExtraPlanilla): SeccionPlanilla | 'Agregado' | 'Solicitud' {
  if (x.seccion) return x.seccion;
  return x.tipo === 'Agregado' ? 'Agregado' : 'Solicitud';
}
