/* ── Empresa de flota → secciones + color (Enrutador) ─────────────────────────
   Los camiones del Enrutador se agrupan en SECCIONES por empresa, cada una con su
   color. El campo `empresa` de cada vehículo es texto libre (Flota → Gestionar), así
   que aquí lo normalizamos a una etiqueta canónica y le asignamos un color estable.

   - Marcas conocidas (Kios Club / Luis Fica / Falabella) → color fijo de marca.
   - Otras empresas (Ortiz, Inverpadsol, CAM, …) → color determinista por nombre.
   - Vacío / sin dato → "Sin empresa" (gris), SIEMPRE al final (se etiqueta en Flota).
   Puro y testeable: sin UI ni red. */

export const SIN_EMPRESA = 'Sin empresa';
const SIN_EMPRESA_COLOR = '#64748B';

// Marcas conocidas: etiqueta canónica + color de marca + variantes que mapean a ella.
const CANON: Array<{ label: string; color: string; match: string[] }> = [
  { label: 'Kios Club', color: '#2563EB', match: ['kios', 'kios club', 'kiosclub'] },
  { label: 'Luis Fica', color: '#16A34A', match: ['luis fica', 'luisfica'] },
  { label: 'Falabella', color: '#7C3AED', match: ['falabella'] },
];

// Paleta determinista para empresas desconocidas (colores distintos entre sí y de las marcas).
const PALETTE = ['#0EA5E9', '#EA580C', '#DB2777', '#0D9488', '#CA8A04', '#4F46E5', '#65A30D', '#BE123C'];

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normaliza el texto libre de empresa a una etiqueta canónica.
 *  Vacío/espacios → "Sin empresa"; marca conocida → su etiqueta; resto → el texto tal cual (trim). */
export function empresaCanonica(raw?: string | null): string {
  const t = (raw ?? '').trim();
  if (!t) return SIN_EMPRESA;
  const k = normKey(t);
  const hit = CANON.find(c => c.match.includes(k));
  return hit ? hit.label : t;
}

/** Color de una empresa YA canonicalizada. "Sin empresa" → gris; marca → color de marca;
 *  desconocida → color determinista (mismo nombre → mismo color siempre). */
export function empresaColor(empresaCanon: string): string {
  if (empresaCanon === SIN_EMPRESA) return SIN_EMPRESA_COLOR;
  const hit = CANON.find(c => c.label === empresaCanon);
  if (hit) return hit.color;
  let h = 0;
  for (let i = 0; i < empresaCanon.length; i++) h = (h * 31 + empresaCanon.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export interface EmpresaGrupo<T> {
  empresa: string;
  color: string;
  items: T[];
}

/** Agrupa items por empresa canónica, preservando el orden de entrada dentro de cada grupo.
 *  Orden de los grupos: marcas conocidas (en el orden de CANON) → otras empresas (alfabético)
 *  → "Sin empresa" al final. */
export function agruparCamionesPorEmpresa<T>(
  items: T[],
  getEmpresa: (item: T) => string | null | undefined,
): EmpresaGrupo<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const canon = empresaCanonica(getEmpresa(it));
    const arr = map.get(canon);
    if (arr) arr.push(it);
    else map.set(canon, [it]);
  }
  const rank = (label: string): [number, string] => {
    if (label === SIN_EMPRESA) return [2, ''];
    const idx = CANON.findIndex(c => c.label === label);
    if (idx >= 0) return [0, String(idx).padStart(3, '0')];
    return [1, normKey(label)];
  };
  return [...map.entries()]
    .map(([empresa, grpItems]) => ({ empresa, color: empresaColor(empresa), items: grpItems }))
    .sort((a, b) => {
      const ra = rank(a.empresa);
      const rb = rank(b.empresa);
      return ra[0] - rb[0] || ra[1].localeCompare(rb[1]);
    });
}
