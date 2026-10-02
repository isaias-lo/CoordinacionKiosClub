// ¿De qué bodega es esta tienda?
//
// ── POR QUÉ EXISTE ESTO ────────────────────────────────────────────────────────────────────────
//
// Bodega tiene dos espejos y cada uno dibuja SU lista de tiendas. Pero las dos pantallas pueden
// SALTAR a cualquier tienda escaneando el número de un pallet (`buscarPallet`) — la persona tiene
// la etiqueta en la mano, no el nombre de la tienda— y ese salto no preguntaba de quién era.
//
// El 01/10/2026 eso dejó 7 tiendas de Nacional trabajadas TAMBIÉN en RM/Costa. Al registrar, cada
// espejo escribió su propia foto con su propio sello —Nacional `01102026` en `despacho_regiones`,
// RM/Costa `02102026` en `despacho_rm`— y como los ids no coinciden, ningún control los junta: el
// cruce sumó las dos. Quedaron +1.115,1 kg en 4 tiendas (57CAS +405,5 · 28TEM +340,5 ·
// 75PUC +269,5 · 47PTV +99,6) y porcentajes que no existen (28TEM publicó +88,0%).
//
// ── POR QUÉ RECIBE EL TEST COMO PARÁMETRO ──────────────────────────────────────────────────────
//
// La pertenencia NO se puede decidir con una lista fija. `REGIONES_CODS` es un Set que CRECE en
// runtime: `registrarTiendasBD` le agrega las tiendas de Regiones creadas desde Config (60PBL es
// una). Pasarlo como función deja esta decisión testeable sin montar los catálogos, y obliga a
// quien la llama a usar el catálogo ya hidratado en vez de una copia vieja.

/** Los dos espejos de Bodega. `rmcosta` = StepForm · `nacional` = TiendasPage. */
export type EspejoBodega = 'rmcosta' | 'nacional';

/** Nombre de la pestaña, para decírselo a la persona. */
export const NOMBRE_ESPEJO: Record<EspejoBodega, string> = {
  rmcosta:  'RM / Costa',
  nacional: 'Nacional',
};

/**
 * A qué espejo pertenece una tienda. Una tienda de Regiones es de `nacional`; cualquier otra es
 * de `rmcosta`. No hay un tercer caso: `esDeRegiones` parte el universo en dos.
 */
export function espejoDeTienda(
  cod: string,
  esDeRegiones: (cod: string) => boolean,
): EspejoBodega {
  return esDeRegiones(normalizarCod(cod)) ? 'nacional' : 'rmcosta';
}

/** True si esta tienda NO le corresponde al espejo que la quiere abrir. */
export function esDeOtroEspejo(
  cod: string,
  espejo: EspejoBodega,
  esDeRegiones: (cod: string) => boolean,
): boolean {
  if (!normalizarCod(cod)) return false;   // sin código no se puede decidir: no se bloquea
  return espejoDeTienda(cod, esDeRegiones) !== espejo;
}

/**
 * El aviso que ve la persona. Dice DÓNDE está el trabajo, no solo que no se puede acá: con la
 * etiqueta en la mano, "no corresponde" sin decir a dónde ir es un callejón sin salida.
 */
export function avisoDeOtroEspejo(cod: string, dueno: EspejoBodega): string {
  return `${normalizarCod(cod)} se pesa en ${NOMBRE_ESPEJO[dueno]} · ábrela en esa pestaña`;
}

function normalizarCod(cod: string): string {
  return String(cod ?? '').trim().toUpperCase();
}
