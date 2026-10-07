// [Vista nueva · Calendario] Lo que dibuja el diseño A del calendario: la lista de días con
// cuántas tiendas recibe cada uno, las barras de la semana y el texto de un grupo vacío.
// Solo lee el calendario; no lo cambia.

export type GrupoCal = 'rm' | 'costa' | 'fal';
export type CalSemana = Record<string, Partial<Record<GrupoCal, string[]>> | undefined>;

export interface DiaSemanaCal {
  dia: string;
  nombre: string;
  rm: number;
  costa: number;
  fal: number;
  total: number;
}

const DIAS_SEMANA: [string, string][] = [
  ['LU', 'Lunes'], ['MA', 'Martes'], ['MI', 'Miércoles'], ['JU', 'Jueves'], ['VI', 'Viernes'], ['SA', 'Sábado'], ['DO', 'Domingo'],
];

export const GRUPOS_CAL: { id: GrupoCal; rotulo: string; nombre: string; color: string }[] = [
  { id: 'rm', rotulo: 'Región Metropolitana', nombre: 'RM', color: '#B45309' },
  { id: 'costa', rotulo: 'Costa', nombre: 'costa', color: '#0E7490' },
  { id: 'fal', rotulo: 'Regiones', nombre: 'regiones', color: '#6D28D9' },
];

/** Lunes a sábado, y el domingo solo si alguna tienda lo tiene. */
export function semanaCalendario(cal: CalSemana | null | undefined): DiaSemanaCal[] {
  const filas = DIAS_SEMANA.map(([dia, nombre]) => {
    const d = cal?.[dia];
    const rm = d?.rm?.length ?? 0;
    const costa = d?.costa?.length ?? 0;
    const fal = d?.fal?.length ?? 0;
    return { dia, nombre, rm, costa, fal, total: rm + costa + fal };
  });
  return filas.filter(f => f.dia !== 'DO' || f.total > 0);
}

/** «Ninguna tienda de costa recibe los martes». */
export function textoGrupoVacio(grupo: GrupoCal, dia: string): string {
  const g = GRUPOS_CAL.find(x => x.id === grupo)?.nombre ?? grupo;
  const plural = DIAS_SEMANA.find(([d]) => d === dia)?.[1].toLowerCase() ?? dia;
  const dias = plural.endsWith('s') ? plural : `${plural}s`;
  return `Ninguna tienda de ${g} recibe los ${dias}`;
}

/** La nota bajo las barras: qué días no reciben ninguna tienda (o `null` si todos reciben). */
export function notaDiasVacios(semana: DiaSemanaCal[]): string | null {
  const vacios = semana.filter(d => d.total === 0).map(d => d.nombre.toLowerCase());
  if (vacios.length === 0) return null;
  if (vacios.length === 1) return `El ${vacios[0]} no recibe ninguna tienda.`;
  return `${vacios.slice(0, -1).join(', ')} y ${vacios[vacios.length - 1]} no reciben ninguna tienda.`.replace(/^./, c => c.toUpperCase());
}
