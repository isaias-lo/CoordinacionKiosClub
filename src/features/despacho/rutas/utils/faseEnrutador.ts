// [E4·4c] Deriva la FASE actual del Enrutador para el indicador visible (mata "el limbo":
// antes no había una fase real que mostrara Calcular/Terminar día). Puro y testeable.

export interface FaseInput {
  poolCount: number;        // tiendas activas con carga (pool del día)
  asignadasCount: number;   // tiendas ya asignadas a algún camión
  camionesConAsig: number;  // camiones con al menos una tienda
  cerradasCount: number;    // camiones ya cerrados/registrados (cerradasV1)
  diaCerrado: boolean;      // jornada cerrada ("Terminar día")
}

export interface FaseInfo {
  step: 1 | 2 | 3 | 4 | 5; // Pool · Asignado · Revisar · Registrar · Cierre
  titulo: string;
  detalle: string;
}

export const FASES = ['Pool', 'Asignado', 'Revisar', 'Registrar', 'Cierre'] as const;

export function faseEnrutador(i: FaseInput): FaseInfo {
  const sinAsignar = Math.max(0, i.poolCount - i.asignadasCount);

  if (i.diaCerrado) return { step: 5, titulo: 'Día terminado', detalle: 'Jornada cerrada' };

  // Registro: si ya se cerró algún camión, estamos registrando / registrado.
  if (i.camionesConAsig > 0 && i.cerradasCount >= i.camionesConAsig)
    return { step: 5, titulo: 'Registrado', detalle: `${i.cerradasCount} camión${i.cerradasCount === 1 ? '' : 'es'} registrado${i.cerradasCount === 1 ? '' : 's'} · terminá el día` };
  if (i.cerradasCount > 0)
    return { step: 4, titulo: 'Registrando', detalle: `${i.cerradasCount}/${i.camionesConAsig} camiones cerrados` };

  if (i.poolCount === 0)
    return { step: 1, titulo: 'Esperando Bodega', detalle: 'Aún no llegan tiendas con carga' };
  if (i.asignadasCount === 0)
    return { step: 1, titulo: 'Pool listo', detalle: `${i.poolCount} tienda${i.poolCount === 1 ? '' : 's'} · activá los camiones para asignar` };
  if (sinAsignar > 0)
    return { step: 2, titulo: 'Asignando', detalle: `${i.asignadasCount} asignada${i.asignadasCount === 1 ? '' : 's'} · faltan ${sinAsignar}` };
  return { step: 3, titulo: 'Listo para registrar', detalle: `${i.asignadasCount} tiendas en ${i.camionesConAsig} camión${i.camionesConAsig === 1 ? '' : 'es'} · revisá y registrá` };
}
