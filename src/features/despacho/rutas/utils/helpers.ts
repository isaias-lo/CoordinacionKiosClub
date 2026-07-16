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
 * Usa el número inicial Y las letras Y el dígito final del código: elige el código conocido MÁS
 * LARGO que sea prefijo del nombre, con límite (el carácter siguiente NO puede ser alfanumérico).
 * Así "38SP2-14-04-2026.pdf" → "38SP2" (no "38SP"), y "24SPP" no se confunde con "38SP2".
 * Fallback: si el nombre trae el código escrito distinto (ej. "38PSP" → alias "38SP2"), lo resuelve
 * por regex canónico + alias y verifica que exista en la lista de códigos. Devuelve null si no hay match.
 */
export function matchCodArchivo(
  fileName: string,
  codes: string[],
  aliases: Record<string, string> = {},
): string | null {
  const stripAcc = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nameU = stripAcc(fileName.replace(/\.pdf$/i, ''));
  let best = '';
  let bestLen = 0;
  for (const k of codes) {
    const ku = stripAcc(k);
    if (ku && nameU.startsWith(ku) && !/[A-Z0-9]/.test(nameU.charAt(ku.length)) && ku.length > bestLen) {
      best = k; bestLen = ku.length;
    }
  }
  if (best) return best;
  const m = nameU.match(/^(\d{1,2}[A-ZÑ]{2,5}\d?)/);
  if (m) {
    const cand = aliases[m[1]] ?? m[1];
    if (codes.includes(cand)) return cand;
  }
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
