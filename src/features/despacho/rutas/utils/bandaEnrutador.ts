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
  | 'ir-sin-conductor' // bajar hasta la primera ruta sin conductor en «Quién maneja»
  | 'ordenar-horarios' // Plan: pasar la ruta abierta a «ordenar por horarios»
  | 'compartir'        // Plan: el panel de compartir de siempre (copiar / WhatsApp)
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

export interface BandaVueltaInput {
  /** Tiendas pendientes de todos los días anteriores. */
  pendientes: number;
  /** Cuántas fechas de origen distintas hay. */
  dias: number;
  /** El día que se está armando, como se dice: «sábado». */
  dia: string;
  /** De ese día: las que todavía no van en un camión. */
  sinCamion: number;
  /** De ese día: camiones con tiendas, todavía sin cerrar (al cerrar, salen del tablero). */
  camiones: number;
}

/**
 * 2ª vuelta: qué falta del día elegido. No hay asignación automática para la 2ª vuelta, así que
 * mientras queden tiendas sin camión la banda solo lo dice; con todo asignado, lleva a cerrar.
 */
export function bandaSegundaVuelta(i: BandaVueltaInput): Banda {
  if (i.pendientes === 0) {
    return {
      paso: null, titular: 'Sin pendientes de 2ª vuelta',
      subtitulo: 'Lo que no salga hoy queda acá al terminar el día', accion: null,
    };
  }
  const subtitulo = `Al cerrar, cada camión se registra como 2ª vuelta de hoy, con su manifiesto, bajo la fecha del ${i.dia}`;
  if (i.sinCamion === 0 && i.camiones > 0) {
    return {
      paso: null, subtitulo,
      titular: `Todo lo del ${i.dia} va en camión: revisa y cierra ${i.camiones === 1 ? 'el camión' : `los ${i.camiones} camiones`}`,
      accion: { id: 'cerrar-camiones', texto: i.camiones === 1 ? 'Cerrar el camión' : `Cerrar los ${i.camiones} camiones` },
    };
  }
  return {
    paso: null, subtitulo,
    titular: `${n(i.sinCamion, 'tienda', 'tiendas')} del ${i.dia} sin camión`,
    accion: null,
  };
}

/** «sábado»: el día de la semana de una fecha, para nombrar el día de origen. */
export function diaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { weekday: 'long' });
}

/** Las secciones de Flota, como las nombra la vista nueva. */
export type SubFlota = 'gestionar' | 'vehiculos' | 'personal' | 'salidas';
export const SUBS_FLOTA: { id: SubFlota; texto: string }[] = [
  { id: 'gestionar', texto: 'Quién maneja' },
  { id: 'vehiculos', texto: 'Vehículos' },
  { id: 'personal',  texto: 'Personal' },
  { id: 'salidas',   texto: 'Salidas propias' },
];

export interface BandaFlotaInput {
  sub: SubFlota;
  /** Rutas registradas del día que muestra «Quién maneja». `null` mientras cargan. */
  rutas: number | null;
  /** Patentes de esas rutas que todavía no tienen conductor. */
  sinConductor: string[];
  encendidos: number;
  vehiculos: number;
}

/** «SPJP88 y PTFZ21», «A, B y C», «A, B, C y 2 más». */
export function listaPatentes(ps: string[], max = 3): string {
  if (ps.length <= 1) return ps.join('');
  if (ps.length <= max) return `${ps.slice(0, -1).join(', ')} y ${ps[ps.length - 1]}`;
  return `${ps.slice(0, max).join(', ')} y ${ps.length - max} más`;
}

/** Flota: qué falta en la sección abierta. Lo que más importa es que nadie salga sin conductor. */
export function bandaFlota(i: BandaFlotaInput): Banda {
  if (i.sub === 'vehiculos') {
    return {
      paso: null, accion: null,
      titular: `${i.encendidos} de ${n(i.vehiculos, 'vehículo encendido', 'vehículos encendidos')}`,
      subtitulo: 'Tipo, capacidad y empresa de cada uno. Los cambios se guardan con «Guardar»',
    };
  }
  if (i.sub === 'personal') {
    return {
      paso: null, accion: null, titular: 'Conductores y pionetas',
      subtitulo: 'Un nombre que falta se agrega acá una vez y queda para siempre',
    };
  }
  if (i.sub === 'salidas') {
    return {
      paso: null, accion: null, titular: 'Salidas propias',
      subtitulo: 'El registro de cada salida de vehículo, con sus paradas',
    };
  }
  if (i.rutas === null) {
    return { paso: null, accion: null, titular: 'Cargando las rutas del día', subtitulo: 'Quién maneja cada camión que sale' };
  }
  if (i.rutas === 0) {
    return {
      paso: null, accion: null, titular: 'Todavía no hay rutas registradas',
      subtitulo: 'Cada camión aparece acá al cerrarlo, para elegir su conductor y pionetas',
    };
  }
  const k = i.sinConductor.length;
  if (k > 0) {
    return {
      paso: null,
      titular: k === 1 ? '1 camión todavía no tiene conductor' : `${k} camiones todavía no tienen conductor`,
      subtitulo: `${listaPatentes(i.sinConductor)} · ${k === 1 ? 'asígnalo' : 'asígnalos'} antes de que salgan`,
      accion: { id: 'ir-sin-conductor', texto: k === 1 ? 'Ir al camión sin conductor' : 'Ir al primero sin conductor' },
    };
  }
  return {
    paso: null, accion: null, titular: 'Todos los camiones tienen conductor',
    subtitulo: `${n(i.rutas, 'ruta lista', 'rutas listas')} para salir`,
  };
}

/** Los pasos de Plan, con las palabras del diseño. */
export const PASOS_PLAN = ['Día y zona', 'Armar rutas', 'Revisar horarios', 'Compartir'] as const;

/** Lo que el Planificador sabe de sus rutas, tal como ya lo muestra. */
export interface ResumenPlan {
  /** Rutas visibles con paradas, y cuántas paradas suman. */
  rutas: number;
  paradas: number;
  /** La ruta abierta: su nombre, cómo está ordenada y, si el mapa ya calculó los tiempos, dónde llega tarde. */
  activa: string;
  orden: 'ventanas' | 'cercania' | 'manual';
  conEtas: boolean;
  tarde: { nombre: string; ventana: string; llega: string }[];
}

/** «08:30-09:30» → «09:30». Si no se entiende, la ventana tal cual. */
function cierreDe(ventana: string): string {
  const m = ventana.match(/(\d{1,2}:\d{2})\s*$/);
  return m ? m[1] : ventana;
}

/**
 * Plan: lo que importa antes de compartir es que la ruta abierta llegue a tiempo. Solo mira la
 * ruta abierta porque es la única con horas de llegada calculadas.
 */
export function bandaPlan(i: ResumenPlan): Banda {
  const pasos = PASOS_PLAN;
  if (i.rutas === 0) {
    return {
      paso: 1, pasos, titular: 'Elige el día y la zona para armar las rutas',
      subtitulo: 'Desde el calendario, o sumando tiendas y direcciones a mano', accion: null,
    };
  }
  const resumen = `${n(i.rutas, 'ruta', 'rutas')} · ${n(i.paradas, 'parada', 'paradas')}`;
  if (!i.conEtas) {
    return {
      paso: 2, pasos, titular: resumen,
      subtitulo: `Las horas de llegada de la ${i.activa} aparecen cuando el mapa calcula los tiempos`, accion: null,
    };
  }
  if (i.tarde.length > 0) {
    const t = i.tarde[0];
    const titular = i.tarde.length === 1
      ? `La ${i.activa} llega tarde a ${t.nombre}`
      : `La ${i.activa} llega tarde a ${i.tarde.length} tiendas`;
    const detalle = i.tarde.length === 1
      ? `Recibe hasta las ${cierreDe(t.ventana)} y llega ${t.llega}`
      : `${t.nombre} recibe hasta las ${cierreDe(t.ventana)} y llega ${t.llega}`;
    if (i.orden !== 'ventanas') {
      return {
        paso: 3, pasos, titular,
        subtitulo: `${detalle}. Está ordenada por ${i.orden === 'cercania' ? 'cercanía' : 'mano'}: por horarios puede entrar a tiempo`,
        accion: { id: 'ordenar-horarios', texto: 'Ordenar por horarios' },
      };
    }
    return {
      paso: 3, pasos, titular,
      subtitulo: `${detalle}. Ya va por horarios: prueba salir antes o pasar la tienda a otra ruta`,
      accion: null,
    };
  }
  return {
    paso: 4, pasos, titular: `La ${i.activa} llega a tiempo a todas`,
    subtitulo: `${resumen} · listas para mandar a los conductores`,
    accion: { id: 'compartir', texto: i.rutas === 1 ? 'Compartir la ruta' : `Compartir las ${i.rutas}` },
  };
}

export type FuenteCalendario = 'despacho' | 'congelados';
export const FUENTES_CALENDARIO: { id: FuenteCalendario; texto: string }[] = [
  { id: 'despacho',   texto: 'Seco' },
  { id: 'congelados', texto: '❄ Congelados' },
];

const DIA_PLURAL: Record<string, string> = {
  LU: 'lunes', MA: 'martes', MI: 'miércoles', JU: 'jueves', VI: 'viernes', SA: 'sábados', DO: 'domingos',
};

export interface BandaCalendarioInput {
  fuente: FuenteCalendario;
  /** Día de la semana que sale, como lo guarda el calendario: 'LU' … 'SA'. */
  dia: string;
  /** Las tiendas de ese día por grupo. `null` mientras el calendario carga. */
  grupos: { rm: number; costa: number; fal: number } | null;
}

/** Calendario: cuántas tiendas reparte el día que sale, y dónde. Es de solo lectura acá. */
export function bandaCalendario(i: BandaCalendarioInput): Banda {
  const dia = DIA_PLURAL[i.dia] ?? i.dia;
  const carga = i.fuente === 'congelados' ? 'congelados' : 'seco';
  if (!i.grupos) {
    return { paso: null, accion: null, titular: 'Cargando el calendario', subtitulo: `Qué tiendas reciben ${carga} cada día de la semana` };
  }
  const { rm, costa, fal } = i.grupos;
  const total = rm + costa + fal;
  if (total === 0) {
    return {
      paso: null, accion: null, titular: `Los ${dia} de ${carga} no tienen tiendas`,
      subtitulo: 'Ninguna tienda tiene este día en el calendario',
    };
  }
  const partes = [rm > 0 ? `${rm} en RM` : '', costa > 0 ? `${costa} en costa` : '', fal > 0 ? `${fal} en regiones` : ''].filter(Boolean);
  const reparto = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0];
  return {
    paso: null, accion: null,
    titular: `Los ${dia} de ${carga} se reparten ${n(total, 'tienda', 'tiendas')}`,
    subtitulo: reparto,
  };
}

/** «lunes 6 oct»: las fechas de la cabecera. */
export function fechaCabecera(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
}
