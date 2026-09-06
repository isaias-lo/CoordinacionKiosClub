// Proponer el sector de una tienda nueva, mostrando en qué se basa.
//
// El sector es el campo que decide en qué zona rutea la tienda: un valor equivocado la manda en
// otro camión, y en silencio. Por eso NO se autocompleta desde Google —que además no lo sabe: es
// una decisión de negocio, no un dato geográfico— sino que se PROPONE con la evidencia a la vista
// para que quien crea la tienda confirme.
//
// La evidencia son las propias tiendas del catálogo: las 62 activas tienen coordenadas, así que
// "las tres más cercanas están todas en Corredor Oriente" es un argumento que se puede leer y
// contradecir. Adivinar sin mostrar por qué sería peor que dejar el campo vacío, porque el error
// no se vería hasta que el camión sale mal.
//
// Puro y testeable: recibe el catálogo ya cargado; acá no hay red.

import { dkm } from '@/features/despacho/rutas/utils/helpers';
import { LAT_CD_DEFAULT, SECTORES } from '@/lib/sectores';

export interface TiendaConSector {
  codigo: string;
  nombre?: string | null;
  sector_comuna?: string | null;
  lat?: number | null;
  lon?: number | null;
  activo?: boolean | null;
}

export interface Vecina { codigo: string; nombre: string; km: number; sector: string }

export interface SugerenciaSector {
  /** El sector propuesto, siempre uno de la lista cerrada. `null` = no hay con qué proponer. */
  sector: string | null;
  /** `alta` cuando la regla es directa (la región manda). `media` cuando sale de las vecinas. */
  confianza: 'alta' | 'media' | 'ninguna';
  /** Por qué, redactado para mostrarlo tal cual. */
  motivo: string;
  /** Las tiendas en que se apoya, para que la propuesta se pueda contradecir. */
  vecinas: Vecina[];
}

const VALIDOS = new Set(SECTORES.map(s => s.valor));
const nada = (motivo: string): SugerenciaSector => ({ sector: null, confianza: 'ninguna', motivo, vecinas: [] });
const km1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/** Las tiendas con sector válido y coordenadas, ordenadas por cercanía al punto. */
function vecinasCercanas(lat: number, lon: number, catalogo: TiendaConSector[], cuantas: number): Vecina[] {
  return catalogo
    .filter(t => t.activo !== false && t.lat != null && t.lon != null && VALIDOS.has(String(t.sector_comuna ?? '').trim()))
    .map(t => ({
      codigo: String(t.codigo ?? '').trim().toUpperCase(),
      nombre: String(t.nombre ?? '').trim(),
      km: dkm([lat, lon], [t.lat as number, t.lon as number]),
      sector: String(t.sector_comuna).trim(),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, cuantas);
}

/**
 * Qué sector le corresponde a una dirección, y por qué.
 *
 * Fuera de la RM la región manda y la regla es directa. Dentro de la RM hay cinco corredores que
 * ninguna fuente externa conoce, así que se mira a las vecinas: es la única fuente que sabe cómo
 * está partido Santiago en esta operación.
 */
export function sugerirSector(
  punto: { lat?: number | null; lon?: number | null },
  region: string | null | undefined,
  catalogo: TiendaConSector[],
  latCD: number = LAT_CD_DEFAULT,
): SugerenciaSector {
  const lat = punto?.lat, lon = punto?.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon))
    return nada('Sin coordenadas no se puede proponer un sector.');

  const reg = String(region ?? '').trim().toLowerCase();

  // Valparaíso: las cinco tiendas de la V Región salen del CD en camión propio.
  if (reg === 'valparaíso' || reg === 'valparaiso')
    return { sector: 'Costa', confianza: 'alta', motivo: 'Está en la Región de Valparaíso: sale del CD en camión propio.', vecinas: [] };

  // Fuera de la RM es Regiones, y el corte norte/sur es la latitud del CD — la misma regla que
  // usa el motor cuando una ficha dice 'Región' a secas.
  if (reg && reg !== 'rm' && reg !== 'metropolitana') {
    const sector = lat < latCD ? 'Región Sur' : 'Región Norte';
    return { sector, confianza: 'alta', vecinas: [],
      motivo: `Está fuera de la Región Metropolitana y al ${lat < latCD ? 'sur' : 'norte'} del CD.` };
  }

  // Dentro de la RM: los corredores son una partición propia. Preguntarle a las vecinas.
  const vecinas = vecinasCercanas(lat, lon, catalogo, 3);
  if (!vecinas.length) return nada('No hay tiendas con sector y coordenadas para comparar.');

  const votos = new Map<string, number>();
  for (const v of vecinas) votos.set(v.sector, (votos.get(v.sector) ?? 0) + 1);
  const max = Math.max(...votos.values());
  // Empate → gana la más cercana: es el desempate menos arbitrario que hay.
  const sector = max > 1
    ? [...votos.entries()].filter(([, n]) => n === max).map(([s]) => s).sort()[0]
    : vecinas[0].sector;

  const deAcuerdo = vecinas.filter(v => v.sector === sector);
  const lista = deAcuerdo.map(v => `${v.codigo} (${km1(v.km)} km)`).join(', ');
  return {
    sector, confianza: 'media', vecinas,
    motivo: deAcuerdo.length === vecinas.length
      ? `Las ${vecinas.length} tiendas más cercanas están en ${sector}: ${lista}.`
      : `${deAcuerdo.length} de las ${vecinas.length} más cercanas están en ${sector}: ${lista}.`,
  };
}
