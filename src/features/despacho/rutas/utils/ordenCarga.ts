// El orden de CARGA de un camión: qué va al fondo y qué queda en la puerta. Puro y testeable.
//
// Son DOS órdenes distintos y hasta ahora nada los conectaba:
//
//   · El de CARGA lo decide una persona en el tablero, arrastrando las tiendas dentro de la
//     tarjeta. Es físico: lo que se entrega último se estiba al fondo, contra la cabina.
//   · El de ENTREGA lo calcula el motor: `nn()` por cercanía desde el CD y, cuando se aprieta
//     Calcular, `ordenarConVentanas` corrigiendo por horarios.
//
// Y el de entrega NO EXISTE la mayor parte del tiempo: se calcula al apretar Calcular o al cerrar
// el camión, no mientras se asigna. Por eso hay un tercer estado —'sin-ruta'— en vez de inventar un
// número: prometer una parada que todavía no se calculó es peor que decir que falta.

export type EstadoCarga =
  /** Todavía no hay ruta con qué comparar. Es el caso normal mientras se asigna. */
  | 'sin-ruta'
  /** El orden de carga coincide con el de entrega. */
  | 'en-orden'
  /** Se contradicen: cargado así, hay que mover bultos en la calle. */
  | 'contradice';

export interface DiagnosticoCarga {
  estado: EstadoCarga;
  /** Índice de la primera fila que rompe el orden, o -1. Para marcarla en la tarjeta. */
  desde: number;
}

/**
 * Compara el orden de carga con el de ruta.
 *
 * La comparación es por SECUENCIA, no por conjunto: llevar las mismas tiendas no alcanza, lo que
 * importa es en qué orden quedaron. Y se compara contra la ruta INVERTIDA, porque la primera parada
 * tiene que ir en la cola —la puerta—, no al fondo: lo que sale primero se carga último.
 */
export function estadoDeCarga(carga: string[], ruta?: string[] | null): DiagnosticoCarga {
  if (!ruta || ruta.length < 2 || carga.length < 2) return { estado: 'sin-ruta', desde: -1 };

  // Solo las tiendas que están en los dos lados: la ruta puede venir de un cálculo anterior y no
  // conocer una tienda recién asignada. Comparar contra eso marcaría una contradicción falsa.
  const enRuta = new Set(ruta);
  const cargaComun = carga.filter(c => enRuta.has(c));
  const enCarga = new Set(carga);
  const esperado = ruta.filter(c => enCarga.has(c)).reverse();

  if (cargaComun.length < 2) return { estado: 'sin-ruta', desde: -1 };

  for (let i = 0; i < cargaComun.length; i++) {
    if (cargaComun[i] !== esperado[i]) {
      // El índice se devuelve sobre la lista ORIGINAL, que es la que se dibuja.
      return { estado: 'contradice', desde: carga.indexOf(cargaComun[i]) };
    }
  }
  return { estado: 'en-orden', desde: -1 };
}

/**
 * Reordena la carga para que respete la ruta: el botón "Acomodar".
 *
 * Las tiendas que la ruta no conoce se conservan al final, en su orden actual. Descartarlas sería
 * perder carga asignada por una ruta vieja.
 */
export function acomodarSegunRuta(carga: string[], ruta?: string[] | null): string[] {
  if (!ruta || !ruta.length) return [...carga];
  const enCarga = new Set(carga);
  const ordenadas = ruta.filter(c => enCarga.has(c)).reverse();
  const yaPuestas = new Set(ordenadas);
  return [...ordenadas, ...carga.filter(c => !yaPuestas.has(c))];
}

/** Mueve un elemento de una posición a otra. No muta la lista que recibe. */
export function moverEnLista<T>(lista: T[], desde: number, hasta: number): T[] {
  if (desde === hasta) return [...lista];
  if (desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return [...lista];
  const out = [...lista];
  const [x] = out.splice(desde, 1);
  out.splice(hasta, 0, x);
  return out;
}

/** La línea al pie de la tarjeta. */
export function textoEstadoCarga(estado: EstadoCarga): string {
  if (estado === 'en-orden')   return 'Cargado en orden de ruta';
  if (estado === 'contradice') return 'La carga contradice la ruta';
  return 'Sin ruta calculada';
}
