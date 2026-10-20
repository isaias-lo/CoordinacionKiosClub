// A qué pestaña del calendario (RM / COSTA / REGIONES) va cada tienda, cómo se busca para agregarla,
// y cómo se guarda sin pisar lo que otra persona guardó mientras tanto. Módulo puro: sin red ni UI.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// El 20/10/2026 61RIO no aparecía al buscarla en REGIONES y sí en RM, en los dos calendarios
// (abastecimiento y congelados). `CalendarioColumnas` decidía el grupo así:
//
//     if (inf.z === 'Región') return 'region';
//
// Comparación EXACTA con el valor viejo. Desde que Config. Tiendas ofrece «Región Sur» y «Región
// Norte» (ver `lib/sectores.ts`), toda ficha cargada con uno de esos dos valores —61RIO y 60PBL hoy—
// se saltaba la línea, caía en la heurística por `tipo` (STRIPCENTER, MALL) y terminaba en RM.
// Picking y Bodega no fallaban porque reciben la tienda ya clasificada (adelanto con zona 'fal').
//
// La regla ya existía bien escrita en `grupoDeSector`, que es la que usan el armado, el pool y el
// chequeo de coherencia. Acá se usa ESA, para que el calendario no pueda volver a divergir.

import { grupoDeSector, type GrupoOperativo } from '@/lib/sectores';
import { tipoTienda } from '@/features/despacho/rutas/utils/tipoTienda';

export type GrupoCal = GrupoOperativo;
export type CalGrupos = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

/** Lo mínimo de la ficha: `z` es el sector (`sector_comuna`), `d` la dirección. */
export interface FichaCal { n?: string; z?: string | null; d?: string | null; tipo?: string | null }

/**
 * El grupo del calendario de una tienda. El SECTOR manda; solo si viene vacío se cae a la
 * heurística vieja (`tipoTienda` mira el tipo, la zona y la dirección), que es lo único que hay
 * para las fichas estáticas sin sector.
 */
export function grupoCalendario(inf: FichaCal | null | undefined): GrupoCal {
  if (!inf) return 'rm';
  const porSector = grupoDeSector(inf.z);
  if (porSector) return porSector;
  const k = tipoTienda(inf.tipo, inf.d, inf.z).key;
  if (k === 'region') return 'fal';
  if (k === 'costa') return 'costa';
  return 'rm';
}

export type TipoVisual = 'mall' | 'strip' | 'street' | 'costa' | 'region';

/** El color del chip: Regiones y Costa por grupo; en RM, por tipo del catálogo. */
export function tipoVisual(inf: FichaCal | null | undefined): TipoVisual {
  if (!inf) return 'street';
  const g = grupoCalendario(inf);
  if (g === 'fal') return 'region';
  if (g === 'costa') return 'costa';
  const k = tipoTienda(inf.tipo, inf.d, inf.z).key;
  return k === 'mall' ? 'mall' : k === 'strip' ? 'strip' : 'street';
}

export interface Sugerencia { cod: string; grupo: GrupoCal }

/**
 * Busca por código o nombre. Antes la búsqueda filtraba en silencio las tiendas de otro grupo: si la
 * clasificación fallaba, la tienda simplemente «no existía». Ahora aparecen las de todos los grupos
 * —primero las de la pestaña abierta— y la pantalla dice a cuál pertenecen las demás.
 */
export function buscarTiendas(
  tiendas: Record<string, FichaCal>,
  q: string,
  grupoActual: GrupoCal,
  limite = 8,
): Sugerencia[] {
  const qup = q.trim().toUpperCase();
  if (!qup) return [];
  const hits: Sugerencia[] = [];
  for (const [cod, inf] of Object.entries(tiendas)) {
    const nombre = String(inf?.n ?? '').toUpperCase();
    if (cod.toUpperCase().includes(qup) || nombre.includes(qup)) hits.push({ cod, grupo: grupoCalendario(inf) });
  }
  hits.sort((a, b) =>
    Number(b.grupo === grupoActual) - Number(a.grupo === grupoActual)
    || Number(b.cod.toUpperCase().startsWith(qup)) - Number(a.cod.toUpperCase().startsWith(qup))
    || a.cod.localeCompare(b.cod));
  return hits.slice(0, limite);
}

export interface FueraDeGrupo { cod: string; dia: string; esta: GrupoCal; va: GrupoCal }

/** Tiendas guardadas en una pestaña que no es la de su sector (p. ej. 61RIO agregada en RM). */
export function fueraDeGrupo(
  cal: CalGrupos | null | undefined,
  grupoDe: (cod: string) => GrupoCal | null,
): FueraDeGrupo[] {
  const out: FueraDeGrupo[] = [];
  for (const [dia, grupos] of Object.entries(cal ?? {})) {
    for (const esta of ['rm', 'costa', 'fal'] as const) {
      for (const cod of grupos?.[esta] ?? []) {
        const va = grupoDe(cod);
        if (va && va !== esta) out.push({ cod, dia, esta, va });
      }
    }
  }
  return out;
}

/** Mueve cada tienda de `fueraDeGrupo` a su pestaña, el mismo día, al final de la columna. */
export function moverASuGrupo(cal: CalGrupos, fuera: FueraDeGrupo[]): CalGrupos {
  const next: CalGrupos = JSON.parse(JSON.stringify(cal));
  for (const f of fuera) {
    const d = next[f.dia];
    if (!d) continue;
    d[f.esta] = (d[f.esta] ?? []).filter(c => c !== f.cod);
    d[f.va] = d[f.va] ?? [];
    if (!d[f.va].includes(f.cod)) d[f.va].push(f.cod);
  }
  return next;
}

/**
 * Fusión a tres bandas para guardar sin pisar a nadie.
 *
 * El calendario se guarda como UNA fila con la semana entera. Si dos personas lo abren y las dos
 * guardan, la segunda borraba en silencio lo que hizo la primera: cada una sube su copia completa.
 * Acá se aplica a lo que está HOY en la base (`remoto`) solo lo que esta persona cambió respecto de
 * lo que cargó (`base` → `local`): lo que agregó, lo que quitó y el orden de lo suyo.
 *
 * Por columna (día × grupo): se parte del orden local, se le suman al final las tiendas que el otro
 * agregó, y se quitan las que el otro quitó y esta persona no tocó.
 */
export function fusionarCalendario(base: CalGrupos, local: CalGrupos, remoto: CalGrupos): CalGrupos {
  const out: CalGrupos = {};
  const dias = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto)]);
  for (const dia of dias) {
    out[dia] = { rm: [], costa: [], fal: [] };
    for (const g of ['rm', 'costa', 'fal'] as const) {
      const b = base[dia]?.[g] ?? [];
      const l = local[dia]?.[g] ?? [];
      const r = remoto[dia]?.[g] ?? [];
      const quitadasPorOtro = new Set(b.filter(c => !r.includes(c)));
      const agregadasPorMi  = new Set(l.filter(c => !b.includes(c)));
      // Lo mío, salvo lo que el otro quitó y yo no volví a agregar.
      const col = l.filter(c => !quitadasPorOtro.has(c) || agregadasPorMi.has(c));
      // Lo que el otro agregó, salvo lo que yo quité.
      const quitadasPorMi = new Set(b.filter(c => !l.includes(c)));
      for (const c of r) if (!col.includes(c) && !quitadasPorMi.has(c)) col.push(c);
      out[dia][g] = col;
    }
  }
  return out;
}

/** ¿Son el mismo calendario? Ignora el orden de las claves, no el de las tiendas. */
export function mismoCalendario(a: CalGrupos | null | undefined, b: CalGrupos | null | undefined): boolean {
  if (!a || !b) return a === b;
  const dias = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const d of dias) {
    for (const g of ['rm', 'costa', 'fal'] as const) {
      const x = a[d]?.[g] ?? [];
      const y = b[d]?.[g] ?? [];
      if (x.length !== y.length || x.some((c, i) => c !== y[i])) return false;
    }
  }
  return true;
}
