// ¿El catálogo y todo lo que se deriva de él dicen lo mismo?
//
// El calendario, los grupos de ruteo, las zonas y la flota se derivan del catálogo de tiendas, y
// nada comprueba que sigan coincidiendo. Van seis desincronizaciones de este tipo encontradas en
// dos días —los malls, la heurística de la dirección, la zona norte, los códigos de Regiones, el
// catálogo estático de Bodega—, y ninguna falla ruidosamente: la operación se entera cuando el
// camión sale mal.
//
// Estos chequeos se eligieron corriéndolos contra la base real. Los que hoy encuentran algo lo
// encuentran de verdad; los que encuentran cero son los que fallan caro cuando fallan. Un chequeo
// que grita todos los días no se lee, así que ninguno reporta lo que es normal.
//
// Puro y testeable: recibe el catálogo y el calendario ya cargados; acá no hay red.

import { grupoDeSector } from '@/lib/sectores';

export interface TiendaCatalogo {
  codigo: string;
  nombre?: string | null;
  sector_comuna?: string | null;
  region?: string | null;
  activo?: boolean | null;
  /** `oficina` (y afines) no despachan: no se les exige estar en el calendario. */
  tipo?: string | null;
}

/** El calendario tal como se guarda: día → grupo ('rm' | 'fal' | 'costa') → códigos. */
export type CalendarioPorDia = Record<string, Record<string, string[]>>;

export type TipoIncoherencia =
  | 'huerfana-en-calendario'
  | 'inactiva-en-calendario'
  | 'sin-sector'
  | 'grupo-no-calza'
  | 'dos-grupos'
  | 'fuera-del-calendario'
  | 'sin-region'
  | 'espacios-sobrantes';

export interface Incoherencia {
  tipo: TipoIncoherencia;
  titulo: string;
  /** Qué se rompe si queda así. */
  consecuencia: string;
  items: string[];
}

// De lo más caro a lo más leve. Una tienda que el sistema no sabe dónde poner rompe el despacho;
// un espacio de más en un nombre, no.
const ORDEN: TipoIncoherencia[] = [
  'huerfana-en-calendario', 'inactiva-en-calendario', 'sin-sector', 'grupo-no-calza',
  'dos-grupos', 'fuera-del-calendario', 'sin-region', 'espacios-sobrantes',
];

const norm = (s: unknown): string => String(s ?? '').trim().toUpperCase();
const vacio = (s: unknown): boolean => String(s ?? '').trim() === '';
const sobra = (s: unknown): boolean => s != null && String(s) !== String(s).trim();

/**
 * El grupo del calendario que le corresponde a un sector. `null` = no se puede saber.
 * Delega en `grupoDeSector`: la regla vive en un solo lugar y este chequeo no puede divergir
 * de la que usan el armado y el pool.
 */
export const grupoEsperado = grupoDeSector;

/** Aplana el calendario a (código → días y grupos donde aparece). */
function indexarCalendario(cal: CalendarioPorDia | null | undefined) {
  const porCod = new Map<string, { dias: Set<string>; grupos: Set<string> }>();
  for (const [dia, grupos] of Object.entries(cal ?? {})) {
    if (!grupos || typeof grupos !== 'object') continue;
    for (const [grupo, cods] of Object.entries(grupos)) {
      if (!Array.isArray(cods)) continue;
      for (const raw of cods) {
        const cod = norm(raw);
        if (!cod) continue;
        const e = porCod.get(cod) ?? { dias: new Set(), grupos: new Set() };
        e.dias.add(dia); e.grupos.add(grupo);
        porCod.set(cod, e);
      }
    }
  }
  return porCod;
}

/**
 * Compara el catálogo contra el calendario y devuelve lo que no calza.
 *
 * `despachaSinCalendario` marca las que no tienen por qué estar en el calendario (la oficina).
 * Se inyecta para no duplicar acá la regla que ya vive en `codigosEspeciales`.
 */
export function coherenciaCatalogo(
  tiendas: TiendaCatalogo[],
  calendario: CalendarioPorDia | null | undefined,
  despachaSinCalendario: (cod: string, tipo?: string | null) => boolean = () => false,
): Incoherencia[] {
  const enCalendario = indexarCalendario(calendario);
  const porCod = new Map(tiendas.map(t => [norm(t.codigo), t]));
  const out: Incoherencia[] = [];

  const huerfanas: string[] = [];
  const inactivas: string[] = [];
  for (const [cod, donde] of enCalendario) {
    const t = porCod.get(cod);
    if (!t) { huerfanas.push(`${cod} (${[...donde.dias].sort().join(' ')})`); continue; }
    if (t.activo === false) inactivas.push(`${cod} (${[...donde.dias].sort().join(' ')})`);
  }

  const sinSector: string[] = [];
  const sinRegion: string[] = [];
  const noCalza: string[] = [];
  const dosGrupos: string[] = [];
  const fuera: string[] = [];
  const espacios: string[] = [];

  for (const t of tiendas) {
    const cod = norm(t.codigo);
    if (!cod || t.activo === false) continue;
    const donde = enCalendario.get(cod);

    if (vacio(t.sector_comuna)) sinSector.push(cod);
    if (vacio(t.region))        sinRegion.push(cod);

    for (const [campo, valor] of [['código', t.codigo], ['nombre', t.nombre], ['región', t.region], ['sector', t.sector_comuna]] as const)
      if (sobra(valor)) espacios.push(`${cod} · ${campo}: "${valor}"`);

    if (donde) {
      if (donde.grupos.size > 1) dosGrupos.push(`${cod} (${[...donde.grupos].sort().join(' + ')})`);
      const esperado = grupoEsperado(t.sector_comuna);
      // Solo se afirma cuando el sector permite deducir el grupo; si no, callar.
      if (esperado && donde.grupos.size === 1) {
        const real = [...donde.grupos][0];
        if (real !== esperado) noCalza.push(`${cod} · está en "${real}", su sector dice "${esperado}"`);
      }
    } else if (!despachaSinCalendario(cod, t.tipo)) {
      fuera.push(cod);
    }
  }

  const agregar = (tipo: TipoIncoherencia, items: string[], uno: string, varios: string, consecuencia: string) => {
    if (!items.length) return;
    out.push({ tipo, titulo: items.length === 1 ? uno : `${items.length} ${varios}`, consecuencia, items: items.sort() });
  };

  agregar('huerfana-en-calendario', huerfanas,
    'Un código del calendario no existe en el catálogo', 'códigos del calendario no existen en el catálogo',
    'Ese día se pide una tienda que nadie puede armar ni rutear: no tiene ficha, dirección ni GPS.');
  agregar('inactiva-en-calendario', inactivas,
    'Una tienda apagada sigue en el calendario', 'tiendas apagadas siguen en el calendario',
    'Se va a pedir carga para una tienda que ya no recibe.');
  agregar('sin-sector', sinSector,
    'Una tienda activa no tiene sector', 'tiendas activas no tienen sector',
    'Sin sector no se le puede calcular la zona: el motor no sabe con qué grupo ni con qué transportista va.');
  agregar('grupo-no-calza', noCalza,
    'Una tienda está en un grupo que no le corresponde', 'tiendas están en un grupo que no les corresponde',
    'Se arma con el grupo equivocado y puede salir en un camión que no cubre su zona.');
  agregar('dos-grupos', dosGrupos,
    'Una tienda aparece en dos grupos distintos', 'tiendas aparecen en dos grupos distintos',
    'Se puede armar y despachar dos veces el mismo día.');
  agregar('fuera-del-calendario', fuera,
    'Una tienda activa no está en ningún día', 'tiendas activas no están en ningún día',
    'Nunca se le va a pedir carga. Si no despacha, márcala como tal; si despacha, falta en el calendario.');
  agregar('sin-region', sinRegion,
    'Una tienda activa no tiene región', 'tiendas activas no tienen región',
    'La región alimenta el agrupado y los reportes: sin ella la tienda queda fuera de esos cortes.');
  agregar('espacios-sobrantes', espacios,
    'Un campo tiene espacios de más', 'campos tienen espacios de más',
    'Un espacio invisible al final hace que dos valores iguales no se crucen entre sistemas.');

  out.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo));
  return out;
}
