// La banda de la vista nueva del Enrutador ("Un paso a la vez"): una frase que dice qué falta
// AHORA, una línea de contexto y, como mucho, un botón. Pura y testeable.
//
// No decide nada nuevo: mira el mismo estado que ya existe (el de `faseEnrutador`, que sigue
// siendo la fuente de la fase) y lo dice en palabras. El botón solo nombra una acción que la
// pantalla ya tiene; quien la ejecuta es RutasScreen, con los mismos manejadores de siempre.

import { faseEnrutador, type FaseInput } from './faseEnrutador';

export type SeccionEnrutador = 'drag' | 'cong' | 'v2' | 'flota' | 'plan' | 'cal';

/** Acciones que la banda puede ofrecer. Cada una corresponde a algo que la pantalla ya hacía. */
export type AccionBanda =
  | 'actualizar'       // volver a descargar los datos (el botón «Actualizar» de la cabecera)
  | 'asignar'          // completar lo que falta, igual que la asignación automática
  | 'ver-camiones'     // bajar hasta las tarjetas de camión
  | 'cerrar-camiones'  // marcar los abiertos en «Cerrar seleccionados»: el cierre lo confirma la barra de siempre
  | 'terminar-dia'     // abrir el cierre de jornada
  | 'ver-manifiestos'; // los manifiestos guardados del día

export interface Banda {
  titular: string;
  subtitulo: string;
  accion: { id: AccionBanda; texto: string } | null;
  /** Paso del indicador, 1 a 5. `null` en las pestañas que no tienen pasos. */
  paso: number | null;
  /** Nombres de los pasos, si la pestaña usa otros que `PASOS_DIA`. */
  pasos?: readonly string[];
}

/** Los cinco pasos del día, con las palabras del diseño. Son los mismos de `FASES`. */
export const PASOS_DIA = ['Tiendas', 'Asignar', 'Revisar', 'Cerrar camiones', 'Terminar día'] as const;

/** Congelados cierra furgones, no camiones. */
export const PASOS_CONGELADOS = ['Tiendas', 'Asignar', 'Revisar', 'Cerrar furgones', 'Terminar día'] as const;

export interface BandaTableroInput extends FaseInput {
  /** Tiendas del pool que Bodega ya terminó y todavía no van en un camión: las que «Asignar» mueve. */
  listasSinAsignar: number;
  /** Tiendas con carga que Bodega todavía no termina: no se pueden asignar. */
  esperandoBodega: number;
}

const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

function conEspera(texto: string, esperando: number): string {
  if (esperando <= 0) return texto;
  const espera = esperando === 1 ? '1 más espera que Bodega la termine' : `${esperando} más esperan que Bodega las termine`;
  return texto ? `${texto} · ${espera}` : espera;
}

/**
 * Despacho (seco) y Congelados. Congelados no tiene «Asignar» ni «Terminar día» propios: esas
 * acciones son del despacho seco, así que ahí la banda informa y no ofrece el botón.
 */
export function bandaTablero(i: BandaTableroInput, opciones: { seco: boolean }): Banda {
  const fase = faseEnrutador(i);
  const { seco } = opciones;
  const camiones = n(i.camionesConAsig, 'camión', 'camiones');

  if (i.diaCerrado) {
    return {
      paso: 5, titular: 'Día terminado',
      subtitulo: i.cerradasCount > 0 ? `${n(i.cerradasCount, 'camión cerrado', 'camiones cerrados')} con su manifiesto` : 'La jornada quedó cerrada',
      accion: seco ? { id: 'ver-manifiestos', texto: 'Ver manifiestos' } : null,
    };
  }
  if (fase.step === 5) {
    return {
      paso: 5, titular: 'Todos los camiones cerrados',
      subtitulo: seco ? 'Termina el día: lo que no salió queda para la 2ª vuelta' : `${camiones} con su manifiesto`,
      accion: seco ? { id: 'terminar-dia', texto: 'Terminar día' } : null,
    };
  }
  if (fase.step === 4) {
    const faltan = i.camionesConAsig - i.cerradasCount;
    return {
      paso: 4, titular: `Faltan ${n(faltan, 'camión', 'camiones')} por cerrar`,
      subtitulo: `${i.cerradasCount} de ${i.camionesConAsig} cerrados`,
      accion: { id: 'ver-camiones', texto: 'Ver camiones' },
    };
  }
  if (i.poolCount === 0) {
    return {
      paso: 1, titular: 'Esperando a Bodega',
      subtitulo: 'Todavía no llegan tiendas con carga para este día',
      accion: seco ? { id: 'actualizar', texto: 'Actualizar datos' } : null,
    };
  }
  if (i.listasSinAsignar > 0) {
    const titular = i.asignadasCount === 0
      ? `${n(i.listasSinAsignar, 'tienda lista', 'tiendas listas')} para asignar`
      : `Faltan ${n(i.listasSinAsignar, 'tienda', 'tiendas')} por asignar`;
    const hecho = i.asignadasCount > 0 ? `${i.asignadasCount} ya van en ${camiones}` : 'Ningún camión tiene tiendas todavía';
    const texto = i.listasSinAsignar === 1 ? 'Asignar la que falta' : `Asignar las ${i.listasSinAsignar} que faltan`;
    return {
      paso: fase.step, titular, subtitulo: conEspera(hecho, i.esperandoBodega),
      accion: seco ? { id: 'asignar', texto } : null,
    };
  }
  if (i.esperandoBodega > 0) {
    // Todo lo que se puede asignar ya va en un camión; el resto depende de Bodega.
    return {
      paso: fase.step,
      titular: i.asignadasCount > 0 ? 'Lo listo ya va en camiones' : 'Esperando a Bodega',
      subtitulo: conEspera(i.asignadasCount > 0 ? `${i.asignadasCount} en ${camiones}` : '', i.esperandoBodega),
      accion: i.asignadasCount > 0 ? { id: 'ver-camiones', texto: 'Ver camiones' } : (seco ? { id: 'actualizar', texto: 'Actualizar datos' } : null),
    };
  }
  return {
    paso: 3, titular: `Todo asignado: revisa y cierra ${i.camionesConAsig === 1 ? 'el camión' : `los ${i.camionesConAsig} camiones`}`,
    subtitulo: `${n(i.asignadasCount, 'tienda', 'tiendas')} en ${camiones}`,
    accion: { id: 'ver-camiones', texto: 'Ver camiones' },
  };
}

export interface BandaCongeladosInput extends BandaTableroInput {
  /** Bultos de las tiendas que ya van en un furgón. */
  bultosAsignados: number;
}

/**
 * Congelados: el mismo camino del día, contado en furgones y bultos. No tiene «Asignar»
 * automático ni «Terminar día» propios (son del despacho seco); sí puede llevar a cerrar los
 * furgones, y ese cierre pasa por la barra «Cerrar seleccionados», con sus mismos avisos.
 */
export function bandaCongelados(i: BandaCongeladosInput): Banda {
  const fase = faseEnrutador({ ...i, diaCerrado: false });
  const pasos = PASOS_CONGELADOS;
  const furgones = n(i.camionesConAsig, 'furgón', 'furgones');
  const abiertos = i.camionesConAsig - i.cerradasCount;

  if (i.poolCount === 0) {
    return {
      paso: 1, pasos, titular: 'Esperando a Bodega Congelados',
      subtitulo: 'Todavía no llegan tiendas con cajas para este día', accion: null,
    };
  }
  if (fase.step === 5) {
    return {
      paso: 5, pasos, titular: 'Todos los furgones cerrados',
      subtitulo: `${furgones} · ${n(i.bultosAsignados, 'bulto', 'bultos')} · el día lo termina Despacho`, accion: null,
    };
  }
  if (fase.step === 4) {
    return {
      paso: 4, pasos, titular: `Faltan ${n(abiertos, 'furgón', 'furgones')} por cerrar`,
      subtitulo: `${i.cerradasCount} de ${i.camionesConAsig} cerrados`,
      accion: { id: 'cerrar-camiones', texto: abiertos === 1 ? 'Cerrar el que falta' : `Cerrar los ${abiertos} que faltan` },
    };
  }
  if (i.listasSinAsignar > 0) {
    return {
      paso: fase.step, pasos,
      titular: i.asignadasCount === 0
        ? `${n(i.listasSinAsignar, 'tienda lista', 'tiendas listas')} para asignar`
        : `Faltan ${n(i.listasSinAsignar, 'tienda', 'tiendas')} por asignar`,
      subtitulo: i.asignadasCount > 0
        ? `${i.asignadasCount} ya van en ${furgones} · arrástralas a un furgón`
        : 'Arrástralas a un furgón de frío',
      accion: null,
    };
  }
  return {
    paso: 3, pasos,
    titular: `Todo asignado: revisa y cierra ${i.camionesConAsig === 1 ? 'el furgón' : `los ${i.camionesConAsig} furgones`}`,
    subtitulo: `${n(i.asignadasCount, 'tienda', 'tiendas')} · ${n(i.bultosAsignados, 'bulto', 'bultos')}`,
    accion: { id: 'cerrar-camiones', texto: i.camionesConAsig === 1 ? 'Cerrar el furgón' : `Cerrar los ${i.camionesConAsig} furgones` },
  };
}

/** 2ª vuelta: cuántas tiendas de días anteriores siguen sin camión. */
export function bandaSegundaVuelta(i: { pendientes: number; dias: number }): Banda {
  if (i.pendientes === 0) {
    return {
      paso: null, titular: 'Sin pendientes de 2ª vuelta',
      subtitulo: 'Lo que no salga hoy queda acá al terminar el día', accion: null,
    };
  }
  return {
    paso: null,
    titular: `${n(i.pendientes, 'tienda', 'tiendas')} de ${i.dias === 1 ? 'un día anterior' : `${i.dias} días anteriores`} sin camión`,
    subtitulo: 'Al cerrar, cada camión se registra como 2ª vuelta de hoy, con su manifiesto',
    accion: null,
  };
}

/** Flota, Plan y Calendario: por ahora solo dicen qué es cada pestaña. Sus fases las completan. */
export function bandaFija(s: 'flota' | 'plan' | 'cal'): Banda {
  const textos = {
    flota: ['Flota', 'Vehículos, personal y salidas del día'],
    plan:  ['Plan de rutas', 'Ordena las paradas y mira el recorrido en el mapa'],
    cal:   ['Calendario de reparto', 'Qué tiendas se despachan cada día de la semana'],
  } as const;
  return { paso: null, titular: textos[s][0], subtitulo: textos[s][1], accion: null };
}

/** «lunes 6 oct»: las fechas de la cabecera. */
export function fechaCabecera(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}
