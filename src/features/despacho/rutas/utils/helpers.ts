import { ALIAS } from '../data/tiendas';

export function dkm(a: [number, number] | number[], b: [number, number] | number[]): number {
  const R = 6371;
  const dL = (b[0] - a[0]) * Math.PI / 180;
  const dl = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dL/2)*Math.sin(dL/2) +
            Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dl/2)*Math.sin(dl/2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

export function getDia(fechaStr: string): string {
  const d = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  return ['LU','LU','MA','MI','JU','VI','SA'][d.getDay() === 0 ? 0 : d.getDay()];
}

export function norm(raw: string): string {
  const s = raw.trim().toUpperCase()
    .replace(/Ñ/g,'N').replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O').replace(/[ÚÙÛÜ]/g,'U');
  return ALIAS[raw.trim().toUpperCase()] || ALIAS[s] || s;
}

export function formatCod(cod: string): string {
  return cod.replace(/^(\d+)([A-Za-zÑñ])/, '$1 $2');
}

/**
 * Detecta el código de tienda CONOCIDO al inicio del nombre de un archivo de guía/manifiesto.
 * Resuelve dos problemas reales de los nombres que llegan:
 *   1. Nombre con el código COMPLETO: "38SP2-14-04-2026.pdf" → "38SP2" (elige el código conocido
 *      MÁS LARGO que sea prefijo, con límite → no se queda en "38SP" ni se confunde con "24SPP").
 *   2. Nombre con el código TRUNCADO (sin el dígito final): "38SP-16-07-2026.pdf" → "38SP2".
 *      Se expande el token al ÚNICO código conocido que lo extiende (38SP→38SP2, 24SP→24SPP);
 *      si hay más de uno (ambiguo) NO se adivina.
 *   3. Nombre con el código escrito distinto: alias explícito (38PSP→38SP2, 35BNT→35BN2).
 * Devuelve null si no reconoce ningún código.
 */
export function matchCodArchivo(
  fileName: string,
  codes: string[],
  aliases: Record<string, string> = {},
): string | null {
  const stripAcc = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nameU = stripAcc(fileName.replace(/\.pdf$/i, ''));
  const codesU = codes.map(c => ({ raw: c, u: stripAcc(c) })).filter(c => c.u);

  // 1) Código conocido MÁS LARGO que sea prefijo del nombre, con límite no-alfanumérico.
  let best = '';
  let bestLen = 0;
  for (const { raw, u } of codesU) {
    if (nameU.startsWith(u) && !/[A-Z0-9]/.test(nameU.charAt(u.length)) && u.length > bestLen) {
      best = raw; bestLen = u.length;
    }
  }
  if (best) return best;

  // 2) Token de código al inicio del nombre (número inicial + letras + dígito final opcional).
  const token = nameU.match(/^(\d{1,2}[A-ZÑ]{2,5}\d?)/)?.[1];
  if (!token) return null;

  // 3) Alias explícito (código escrito distinto) o token que ya es un código exacto.
  if (aliases[token] && codes.includes(aliases[token])) return aliases[token];
  const exact = codesU.find(c => c.u === token);
  if (exact) return exact.raw;

  // 4) Código truncado: expandir al ÚNICO código conocido que empieza con el token
  //    (ej. "38SP" → "38SP2", "24SP" → "24SPP"). Ambiguo (>1) → no se adivina.
  const expand = codesU.filter(c => c.u.startsWith(token) && c.u.length > token.length);
  if (expand.length === 1) return expand[0].raw;

  return null;
}

export function fechaTxt(fechaStr: string): string {
  if (!fechaStr) return '';
  return new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function fechaLargaTxt(fechaStr: string): string {
  if (!fechaStr) return new Date().toLocaleDateString('es-CL', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  return new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function todayStr(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
}

/**
 * Convierte una fecha de despacho (DD/MM/YYYY o ISO YYYY-MM-DD) al stamp `DDMMYYYY` usado en los
 * ids del registro (ej. `R1<cod>04082026P`).
 *
 * Antes el stamp se derivaba de `now` (fecha de CREACIÓN). Al registrar cruzando la medianoche
 * (o al re-registrar otro día) el stamp cambiaba respecto a la fecha de DESPACHO → se partía la
 * fecha (04/08 vs 05/08) y podían colisionar ids entre días. Derivarlo de la fecha de despacho lo
 * hace determinista: el mismo despacho produce siempre los mismos ids (el sync deduplica). Puro.
 */
export function stampFromFecha(fecha: string): string {
  const s = String(fecha ?? '').trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, '0')}${dmy[2].padStart(2, '0')}${dmy[3]}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}${iso[2].padStart(2, '0')}${iso[1]}`;
  return s.replace(/\D/g, '');
}

// [Fase 3] Pool de 2ª vuelta desde el tablero: tiendas ACTIVAS con carga (p/b/ch) que NO están
// asignadas a ningún camión → quedan pendientes. `asignadas` = códigos ya puestos en algún camión
// (aunque su camión no se haya cerrado), para acumular/corregir en savePendientesV2 sin pisar
// pendientes previas del día. Una tienda asignada a un camión NO es pendiente aunque no se cierre.
export function poolPendiente(
  calT: Record<string, { on: boolean; p: number; b: number; ch?: number }>,
  asignaciones: Record<string, { c: string }[]>,
): { leftover: { c: string; p: number; b: number; ch: number }[]; asignadas: Set<string> } {
  const asignadas = new Set(Object.values(asignaciones).flat().map(s => s.c));
  const leftover = Object.keys(calT)
    .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0))
    .filter(c => !asignadas.has(c))
    .map(c => ({ c, p: calT[c].p, b: calT[c].b, ch: calT[c].ch ?? 0 }));
  return { leftover, asignadas };
}
