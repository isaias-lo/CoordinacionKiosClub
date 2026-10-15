// La pistola lee una etiqueta del OTRO espejo de Bodega: llevar a la persona allá.
//
// ── POR QUÉ ────────────────────────────────────────────────────────────────────────────────────
//
// `vetoEscaneo.ts` cerró el agujero de abrir tiendas de Nacional dentro de RM/Costa (y al revés),
// pero dejaba a la persona con un pitido de error, el pallet en la mano y la instrucción de cambiar
// de pestaña, buscar la tienda y volver a escanear. Pedido de Isaias el 14/10/2026: que la pistola
// la lleve sola.
//
// El veto NO se afloja: la tienda se sigue abriendo solo en su espejo. Lo que cambia es que en vez
// de un callejón sin salida, esta pantalla deja la lectura anotada, navega a la pestaña dueña, y
// esa pantalla la procesa como si la hubieran escaneado ahí.
//
// ── CÓMO VIAJA LA LECTURA ──────────────────────────────────────────────────────────────────────
//
// En `sessionStorage` (de esta pestaña del navegador, no de otras) con la hora y el espejo destino.
// Vence a los `VIGENCIA_MS`: una lectura que quedó anotada y nadie consumió —la navegación falló,
// el permiso rebotó— no debe abrir una tienda la próxima vez que alguien entre a esa pantalla.
//
// Un solo salto: la lectura que llega reenviada no se vuelve a reenviar aunque la pantalla destino
// opine que es del otro lado (catálogo a medio cargar). Sin eso, dos pantallas en desacuerdo se
// mandarían la etiqueta de una a otra para siempre.

import { NOMBRE_ESPEJO, type EspejoBodega } from './duenoDeTienda';

/** La ruta de cada espejo de Bodega seco. Las mismas que `BodegaTabs`. */
export const RUTA_ESPEJO: Record<EspejoBodega, string> = {
  nacional: '/despacho/regiones',
  rmcosta:  '/despacho/santiago',
};

export const CLAVE_ESCANEO_PENDIENTE = 'bodega_escaneo_pendiente';

/** Cuánto vale una lectura anotada. Navegar y cargar los pallets del día tarda segundos, no más. */
export const VIGENCIA_MS = 30_000;

export interface EscaneoPendiente {
  codigo: string;
  /** El espejo que la tiene que procesar. */
  espejo: EspejoBodega;
  /** Date.now() al anotarla. */
  en: number;
}

export function otroEspejo(espejo: EspejoBodega): EspejoBodega {
  return espejo === 'nacional' ? 'rmcosta' : 'nacional';
}

/** Lo que se le dice a la persona mientras se la lleva. */
export function avisoDeSalto(storeCod: string, destino: EspejoBodega): string {
  return `${String(storeCod ?? '').trim().toUpperCase()} es de ${NOMBRE_ESPEJO[destino]} · te llevo allá`;
}

/**
 * La lectura que le toca a `espejo`, si hay una vigente. PURA: recibe lo guardado tal cual.
 * Cualquier cosa rara (JSON roto, otro espejo, vencida, del futuro) es `null`.
 */
export function pendienteVigente(raw: string | null, espejo: EspejoBodega, ahora: number): string | null {
  if (!raw) return null;
  let p: Partial<EscaneoPendiente>;
  try { p = JSON.parse(raw) as Partial<EscaneoPendiente>; } catch { return null; }
  if (!p || typeof p.codigo !== 'string' || !p.codigo.trim()) return null;
  if (p.espejo !== espejo) return null;
  if (typeof p.en !== 'number' || p.en > ahora || ahora - p.en > VIGENCIA_MS) return null;
  return p.codigo.trim();
}

export function anotarEscaneoPendiente(codigo: string, espejo: EspejoBodega): void {
  try {
    const p: EscaneoPendiente = { codigo, espejo, en: Date.now() };
    sessionStorage.setItem(CLAVE_ESCANEO_PENDIENTE, JSON.stringify(p));
  } catch { /* sin storage: la persona llega a la pestaña y escanea otra vez */ }
}

/** Saca la lectura (se consume una sola vez) y la devuelve si es de este espejo y está vigente. */
export function tomarEscaneoPendiente(espejo: EspejoBodega): string | null {
  try {
    const raw = sessionStorage.getItem(CLAVE_ESCANEO_PENDIENTE);
    if (!raw) return null;
    const codigo = pendienteVigente(raw, espejo, Date.now());
    // Solo se borra la que es de acá (o la que ya no sirve): una que va al otro espejo y todavía
    // vale no se toca, por si esta pantalla se montó un instante antes de navegar.
    if (codigo || !pendienteVigente(raw, otroEspejo(espejo), Date.now())) {
      sessionStorage.removeItem(CLAVE_ESCANEO_PENDIENTE);
    }
    return codigo;
  } catch {
    return null;
  }
}
