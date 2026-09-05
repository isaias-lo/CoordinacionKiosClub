// Qué se va a registrar, revisado ANTES de escribir.
//
// La fase 1 agregó el resumen de lo que se cerró (`resumenCierre`). Sirve, pero llega tarde: para
// cuando lo lees, los manifiestos ya se emitieron y el registro ya se escribió. Casi todos los
// incidentes de estas semanas —40LIL sin patente, los registros dobles, los manifiestos perdidos—
// se detectan mirando exactamente lo mismo un segundo ANTES.
//
// Por eso esto no es un chequeo nuevo: es el mismo, corrido antes y con tres preguntas más que el
// resumen no hacía. La pantalla lo muestra como "esto se va a registrar así, ¿confirmas?".
//
// Nada de esto BLOQUEA el cierre. El coordinador sabe cosas que el sistema no —un camión que vuelve
// por la carga, una tienda que se despacha mañana— y un preflight que impide cerrar se convierte
// en un paso que la gente aprende a saltarse. Avisa, y deja decidir.
//
// Puro y testeable: recibe lo que hay en pantalla y devuelve qué decir.

import { resumenCierre } from './resumenCierre';
import { normPatente } from './cierrePorVehiculo';

export type TipoHallazgo =
  | 'sin-camion'
  | 'en-camion-apagado'
  | 'cerrado-sin-manifiesto'
  | 'sobre-capacidad'
  | 'sin-datos-bodega';

export interface Hallazgo {
  tipo: TipoHallazgo;
  /** Qué pasa, en una línea. */
  titulo: string;
  /** Qué significa para la operación si se registra así. */
  consecuencia: string;
  /** Los códigos o patentes involucrados, listos para mostrar. */
  items: string[];
}

export interface Preflight {
  fecha: string;
  camiones: number;
  tiendas: number;
  hallazgos: Hallazgo[];
  hayHallazgos: boolean;
}

export interface EntradaPreflight {
  fecha: string;
  /** Códigos con carga del día (el pool). */
  enElPool: string[];
  /** El tablero: patente → tiendas asignadas, con sus pallets. */
  asignaciones: Record<string, { c: string; p?: number }[]>;
  /** Códigos que Bodega ya registró. */
  conDatosDeBodega?: Iterable<string>;
  /** Capacidad en pallets por patente, de la flota. Sin ella, el chequeo no corre. */
  capacidades?: Record<string, number>;
  /** Patentes cerradas una por una en 1ª vuelta (`rutas_cerradas`). */
  cerradas?: Iterable<string>;
  /** Manifiestos ya guardados para la fecha (`rutas_despacho`). */
  manifiestos?: { patente?: string | null }[];
  /**
   * Patentes encendidas en la flota. Sin ella el chequeo de camión apagado no corre.
   *
   * Apagar un camión no saca sus tiendas del tablero: la columna deja de dibujarse y
   * `rutasDesdeAsignaciones` filtra por `v.on`, así que esa carga no genera manifiesto y no sale.
   * Pero el tablero la sigue dando por asignada, así que tampoco aparecía como "sin camión".
   */
  patentesActivas?: Iterable<string>;
}

// El orden en que se muestran. Una tienda que nadie va a llevar es peor que una que sale sin
// dimensiones: si lo leve va primero, lo grave se lee último o no se lee.
const ORDEN: TipoHallazgo[] = ['sin-camion', 'en-camion-apagado', 'cerrado-sin-manifiesto', 'sobre-capacidad', 'sin-datos-bodega'];

/**
 * Revisa el día tal como quedó y devuelve lo que merece una mirada antes de registrar.
 *
 * Todo se compara por código o por patente normalizada, sin tocar red ni estado.
 */
export function preflightCierre(entrada: EntradaPreflight): Preflight {
  const { fecha, enElPool, asignaciones, conDatosDeBodega = [], capacidades, cerradas = [], manifiestos = [], patentesActivas } = entrada;

  // Los dos primeros chequeos ya existen y están probados: se reusan, no se reescriben.
  const base = resumenCierre(fecha, enElPool, asignaciones, conDatosDeBodega);
  const hallazgos: Hallazgo[] = [];

  if (base.sinCamion.length) {
    hallazgos.push({
      tipo: 'sin-camion',
      titulo: base.sinCamion.length === 1 ? 'Una tienda con carga no va en ningún camión' : `${base.sinCamion.length} tiendas con carga no van en ningún camión`,
      consecuencia: 'Nadie las va a llevar hoy. Al registrar así, quedan pendientes de 2ª vuelta.',
      items: base.sinCamion,
    });
  }

  // Tiendas que quedaron en un camión apagado. No se dibujan, no salen en ningún manifiesto y
  // el tablero las da por asignadas: es la peor combinación, porque nada lo delata.
  if (patentesActivas) {
    const activas = new Set([...patentesActivas].map(normPatente).filter(Boolean));
    // Un camión CERRADO ya emitió su manifiesto: esa carga salió, aunque después lo apaguen en la
    // flota (que es lo normal cuando el camión ya se fue). Marcarla sería un falso positivo, y un
    // aviso que se equivoca enseña a ignorar los que no.
    const yaCerradas = new Set([...cerradas].map(normPatente).filter(Boolean));
    const varadas: string[] = [];
    for (const [patente, tiendas] of Object.entries(asignaciones)) {
      const lista = (tiendas ?? []).filter(t => t?.c);
      if (!lista.length) continue;
      const pat = normPatente(patente);
      if (activas.has(pat) || yaCerradas.has(pat)) continue;
      for (const t of lista) varadas.push(`${t.c} (${patente})`);
    }
    if (varadas.length) {
      hallazgos.push({
        tipo: 'en-camion-apagado',
        titulo: varadas.length === 1 ? 'Una tienda quedó en un camión apagado' : `${varadas.length} tiendas quedaron en un camión apagado`,
        consecuencia: 'Ese camión no emite manifiesto: esa carga no sale hoy y el tablero igual la da por asignada.',
        items: varadas.sort(),
      });
    }
  }

  // Un camión cerrado ya emitió su QR y su carga no la mueve nadie. Si además no dejó manifiesto
  // guardado, salió sin papeles y no hay cómo reconstruir qué llevaba.
  const conManifiesto = new Set(
    manifiestos.map(m => normPatente(m?.patente ?? '')).filter(Boolean),
  );
  const cerradasSinManifiesto = [...new Set([...cerradas].map(normPatente).filter(Boolean))]
    .filter(p => !conManifiesto.has(p))
    .sort();
  if (cerradasSinManifiesto.length) {
    hallazgos.push({
      tipo: 'cerrado-sin-manifiesto',
      titulo: cerradasSinManifiesto.length === 1 ? 'Un camión cerrado no dejó manifiesto guardado' : `${cerradasSinManifiesto.length} camiones cerrados no dejaron manifiesto guardado`,
      consecuencia: 'Salieron sin papeles y sin registro de qué llevaban: no hay cómo reconstruirlo después.',
      items: cerradasSinManifiesto,
    });
  }

  // Sobre capacidad. Sin capacidad conocida no se puede afirmar que se pasó, así que se calla:
  // un aviso que se dispara por no saber es peor que no avisar.
  if (capacidades) {
    const excedidos: string[] = [];
    for (const [patente, tiendas] of Object.entries(asignaciones)) {
      const lista = (tiendas ?? []).filter(t => t?.c);
      if (!lista.length) continue;                  // patentes vacías no son camiones
      const cap = capacidades[patente];
      if (typeof cap !== 'number' || cap <= 0) continue;
      const pallets = lista.reduce((s, t) => s + (Number(t.p) || 0), 0);
      // Ir justo al tope es lo normal; solo el exceso es un hallazgo.
      if (pallets > cap) excedidos.push(`${patente} (${pallets} de ${cap})`);
    }
    if (excedidos.length) {
      hallazgos.push({
        tipo: 'sobre-capacidad',
        titulo: excedidos.length === 1 ? 'Un camión va sobre su capacidad' : `${excedidos.length} camiones van sobre su capacidad`,
        consecuencia: 'No cabe todo: alguien va a tener que bajar carga en el patio, ya con el manifiesto emitido.',
        items: excedidos.sort(),
      });
    }
  }

  if (base.sinDatosDeBodega.length) {
    hallazgos.push({
      tipo: 'sin-datos-bodega',
      titulo: base.sinDatosDeBodega.length === 1 ? 'Una tienda va en camión sin que Bodega la registrara' : `${base.sinDatosDeBodega.length} tiendas van en camión sin que Bodega las registrara`,
      consecuencia: 'Salen sin pallets ni bultos: el manifiesto y la recepción en tienda quedan sin qué comparar.',
      items: base.sinDatosDeBodega,
    });
  }

  hallazgos.sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo));

  return {
    fecha,
    camiones: base.camiones,
    tiendas: base.tiendas,
    hallazgos,
    hayHallazgos: hallazgos.length > 0,
  };
}

/** Lo que se va a registrar, en una línea. */
export function textoPreflight(p: Preflight): string {
  const plural = (n: number, s: string, pl: string) => `${n} ${n === 1 ? s : pl}`;
  return `${plural(p.camiones, 'manifiesto', 'manifiestos')} · ${plural(p.tiendas, 'tienda', 'tiendas')}`;
}
