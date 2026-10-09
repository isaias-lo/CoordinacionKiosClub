// Calendario de picking en forma de tabla: una fila por tienda, un cuadro por día. Módulo puro.

export type Grupo = 'rm' | 'costa' | 'fal';
export type CalRecord = Record<string, { rm?: string[]; costa?: string[]; fal?: string[] }>;

export const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'] as const;
export type Dia = typeof DIAS[number];

export const NOMBRE_DIA: Record<Dia, string> = {
  LU: 'lunes', MA: 'martes', MI: 'miércoles', JU: 'jueves', VI: 'viernes', SA: 'sábado', DO: 'domingo',
};

export const NOMBRE_GRUPO: Record<Grupo, string> = { rm: 'Santiago', costa: 'Costa', fal: 'Regiones' };

/** Día del calendario para una fecha (el domingo es DO, como lo lee Picking). */
export function diaDe(fecha: Date): Dia {
  return DIAS[(fecha.getDay() + 6) % 7];
}

export interface FilaCalendario { cod: string; dias: Set<Dia>; veces: number }

export function filasCalendario(cal: CalRecord, grupo: Grupo): FilaCalendario[] {
  const m = new Map<string, Set<Dia>>();
  for (const d of DIAS) {
    for (const cod of cal[d]?.[grupo] ?? []) {
      if (!m.has(cod)) m.set(cod, new Set());
      m.get(cod)!.add(d);
    }
  }
  return [...m.entries()].map(([cod, dias]) => ({ cod, dias, veces: dias.size }));
}

/** ¿Algún grupo usa el domingo? Si no, la columna no se muestra (como el diseño, LU a SA). */
export function usaDomingo(cal: CalRecord): boolean {
  const d = cal.DO;
  return !!d && ((d.rm?.length ?? 0) + (d.costa?.length ?? 0) + (d.fal?.length ?? 0)) > 0;
}

export interface Hoy { codigos: string[]; porGrupo: Record<Grupo, number> }

export function tiendasDelDia(cal: CalRecord, dia: Dia): Hoy {
  const d = cal[dia] ?? {};
  const porGrupo = { rm: d.rm?.length ?? 0, costa: d.costa?.length ?? 0, fal: d.fal?.length ?? 0 };
  // Mismo orden que la lista de tiendas de Picking: regiones, costa y Santiago.
  return { codigos: [...(d.fal ?? []), ...(d.costa ?? []), ...(d.rm ?? [])], porGrupo };
}

export function textoPorGrupo(n: Record<Grupo, number>): string {
  const p: string[] = [];
  if (n.rm) p.push(`${n.rm} Santiago`);
  if (n.costa) p.push(`${n.costa} costa`);
  if (n.fal) p.push(`${n.fal} regiones`);
  return p.join(' · ');
}
