// ¿El día cabe? Puro y testeable.
//
// Con el orden por ventanas, la ruta que sale es la mejor posible. Pero "la mejor posible" y
// "cumple" no son lo mismo, y el Planificador no distinguía: mostraba una ruta con ⚠ y quedaba la
// duda de si el algoritmo estaba fallando o si el día sencillamente no entraba.
//
// El Handoff lo nombra (§409): «Hay una imposibilidad ARITMÉTICA, no algorítmica. Lunes: 18 tiendas
// × 15 min = 270 min de pura descarga. La ventana 08:00–12:00 tiene 240 min. Con un camión no
// existe algoritmo que cumpla todas las ventanas del lunes, ni siquiera con tiempo de viaje cero.»
//
// Eso se puede DEMOSTRAR, y es lo que hace este módulo.
//
// La cota que se usa es deliberadamente conservadora: se ignora el viaje (como si el camión se
// teletransportara) y se mira un grupo de ventana a la vez, sin contar las demás tiendas. Si aun
// así no caben, es imposible y punto — ningún orden lo arregla. Puede haber días imposibles que
// esta cota no detecte; lo que NO puede haber es una falsa alarma. Avisar de más sería peor que no
// avisar: el coordinador dejaría de creerle.
//
// Y un "infeasible" pelado no le sirve a nadie: el Handoff (§175) insiste en entregar salidas
// concretas. Las de acá vienen con el número calculado, no como consejo genérico.

import { parseVentana } from './ventanaHoraria';

export interface TiendaParaFactibilidad {
  v?: string | null;
}

export interface CuelloBotella {
  /** La ventana, tal como viene del catálogo. */
  ventana: string;
  /** Las tiendas que la comparten. */
  tiendas: string[];
  /** Minutos útiles: desde que el camión puede empezar hasta que cierra. */
  minutosDisponibles: number;
  /** Lo que haría falta solo para descargarlas, sin moverse. */
  minutosNecesarios: number;
  /** Cuántas caben como MÁXIMO, aun con viaje cero. */
  cabenMax: number;
  /** Cuántas quedan fuera sí o sí. */
  sobran: number;
}

export type TipoSugerencia = 'atencion' | 'salida' | 'segundo-camion' | 'mover-tiendas';

export interface Sugerencia {
  tipo: TipoSugerencia;
  texto: string;
}

export interface DiagnosticoDia {
  /** false = hay al menos un grupo que NO cabe ni con viaje cero. */
  factible: boolean;
  cuellos: CuelloBotella[];
  sugerencias: Sugerencia[];
}

export interface OpcionesFactibilidad {
  salidaMin: number;
  servicioMin: number;
}

/**
 * Los grupos de ventana que no caben ni con viaje cero.
 *
 * Se agrupa por la ventana EXACTA: dos tiendas con "08:30-09:30" compiten por los mismos minutos.
 * Una ventana más ancha que contenga a otra no se considera competencia — sería una cota más fina,
 * pero también más fácil de discutir, y acá lo que importa es que el aviso sea incontestable.
 */
export function cuellosDeBotella(
  cods: string[],
  tiendas: Record<string, TiendaParaFactibilidad | undefined>,
  o: OpcionesFactibilidad,
): CuelloBotella[] {
  const porVentana = new Map<string, string[]>();
  for (const c of cods) {
    const texto = String(tiendas[c]?.v ?? '').trim();
    if (!parseVentana(texto)) continue;                  // sin ventana no compite por minutos
    porVentana.set(texto, [...(porVentana.get(texto) ?? []), c]);
  }

  const out: CuelloBotella[] = [];
  for (const [ventana, lista] of porVentana) {
    const w = parseVentana(ventana)!;
    // El camión no puede empezar antes de salir ni antes de que abran.
    const inicio = Math.max(o.salidaMin, w.abre);
    const minutosDisponibles = Math.max(0, w.cierra - inicio);
    const cabenMax = o.servicioMin > 0 ? Math.floor(minutosDisponibles / o.servicioMin) : lista.length;
    if (lista.length <= cabenMax) continue;
    out.push({
      ventana, tiendas: lista, minutosDisponibles,
      minutosNecesarios: lista.length * o.servicioMin,
      cabenMax, sobran: lista.length - cabenMax,
    });
  }
  // El cuello más grave primero: es el que hay que resolver.
  return out.sort((a, b) => b.sobran - a.sobran);
}

/** "HH:MM" desde minutos del día. */
function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Las salidas concretas, con el número ya calculado.
 *
 * Se ordenan de la más barata a la más cara: cambiar un parámetro antes que mover carga, y mover
 * carga antes que pedir otro camión.
 */
export function sugerenciasPara(peor: CuelloBotella, o: OpcionesFactibilidad): Sugerencia[] {
  const n = peor.tiendas.length;
  const out: Sugerencia[] = [];

  // 1. Bajar la atención: cuántos minutos por parada harían falta para que entren todas.
  const servicioNecesario = Math.floor(peor.minutosDisponibles / n);
  if (servicioNecesario >= 1 && servicioNecesario < o.servicioMin) {
    out.push({
      tipo: 'atencion',
      texto: `Con ${servicioNecesario} min/parada en vez de ${o.servicioMin} entran las ${n}.`,
    });
  }

  // 2. Adelantar la salida: solo sirve si hoy se sale DESPUÉS de que la ventana abre.
  const w = parseVentana(peor.ventana)!;
  if (o.salidaMin > w.abre) {
    const gana = o.salidaMin - w.abre;
    out.push({
      tipo: 'salida',
      texto: `Saliendo ${hhmm(w.abre)} en vez de ${hhmm(o.salidaMin)} se ganan ${gana} min (entra ${Math.floor(gana / o.servicioMin)} parada más).`,
    });
  }

  // 3. Mover las que sobran a otro día.
  out.push({
    tipo: 'mover-tiendas',
    texto: `Mover ${peor.sobran} de las ${n} a otro día: ${peor.tiendas.slice(peor.cabenMax).join(', ')}.`,
  });

  // 4. Segundo camión: cuántos harían falta para esa ventana.
  if (peor.cabenMax > 0) {
    const camiones = Math.ceil(n / peor.cabenMax);
    out.push({
      tipo: 'segundo-camion',
      texto: `Repartir esa ventana en ${camiones} camiones (hoy va 1).`,
    });
  } else {
    out.push({ tipo: 'segundo-camion', texto: 'Con esta atención no entra NINGUNA en esa ventana, ni con más camiones del mismo tamaño.' });
  }

  return out;
}

/** El diagnóstico completo del día. */
export function diagnosticarDia(
  cods: string[],
  tiendas: Record<string, TiendaParaFactibilidad | undefined>,
  o: OpcionesFactibilidad,
): DiagnosticoDia {
  const cuellos = cuellosDeBotella(cods, tiendas, o);
  return {
    factible: cuellos.length === 0,
    cuellos,
    sugerencias: cuellos.length ? sugerenciasPara(cuellos[0], o) : [],
  };
}

/** Una línea que resume el cuello más grave. Vacío si el día cabe. */
export function resumenCuello(d: DiagnosticoDia): string {
  const c = d.cuellos[0];
  if (!c) return '';
  return `En la ventana ${c.ventana} hay ${c.tiendas.length} tiendas y solo caben ${c.cabenMax}: `
    + `${c.minutosDisponibles} min disponibles contra ${c.minutosNecesarios} de pura descarga.`;
}
