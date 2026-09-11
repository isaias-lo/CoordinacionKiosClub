// El número que muestra una card de Bodega (P1, B2, CH3…). Puro y testeable.
//
// Para casi todo ese número es la POSICIÓN dentro de su tipo, recalculada en cada render. Para el
// chocolate eso no sirve: al sumar un CH a un pallet o borrarlo, los que quedaban atrás se corrían
// —el CH3 pasaba a llamarse CH1— y el número dejaba de coincidir con la caja que la persona tiene
// en la mano.
//
// Un CH usa su `seq`, que es el número que quedó IMPRESO en la etiqueta: va dentro del
// `canonical_id` (`CH3<cod><stamp>CH`) y se congela al imprimir (Picking) o al crear el slot
// (Bodega). No se recalcula nunca, así que sobrevive a que borren a sus vecinos.
//
// Consecuencia buscada: los números pueden quedar con huecos (CH2, CH5). El hueco es información
// —dice que esos se fueron a un pallet— y no un error que haya que "compactar".

interface ArgsNumeroCard {
  /** Solo el chocolate cambia de regla; el pedido fue explícito en eso. */
  esChocolate: boolean;
  /** Posición dentro de su tipo, 1-based. El comportamiento de siempre. */
  posicion: number;
  /** `picking_pallets.seq`. Es `null` mientras nadie haya impreso la etiqueta. */
  seq?: number | null;
}

/**
 * Número a mostrar. Para un CH con `seq` válido devuelve el `seq`; en cualquier otro caso, la
 * posición.
 *
 * El fallback cubre dos situaciones reales: un CH que todavía no se imprimió (no tiene número
 * físico con el cual coincidir) y un `seq` corrupto — nunca debe salir "CH0" ni "CHNaN" en
 * pantalla, así que se exige entero positivo.
 */
export function numeroVisibleCard({ esChocolate, posicion, seq }: ArgsNumeroCard): number {
  if (!esChocolate) return posicion;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq <= 0) return posicion;
  return seq;
}

/**
 * El campo `orden` de un item, con el formato histórico que se escribe a Sheets.
 *
 * El bulto lleva el número ADELANTE (`3B`) y los demás atrás (`P3`, `C3`, `CH3`). No es un
 * capricho: ese string se concatena para formar el ID de la fila
 * (`${orden}${cod}${stamp}${tipoPrefix}`), que para un CH queda `CH3<cod><stamp>CH` — exactamente
 * el formato de `buildCanonicalId`. Por eso el número del CH tiene que ser el mismo `seq` que va
 * en el código de barras: si no, el ID de Sheets y la etiqueta impresa hablan de cosas distintas.
 */
export function ordenDeItem(tipo: string, numero: number): string {
  if (tipo === 'Pallet') return `P${numero}`;
  if (tipo === 'Contenedor') return `C${numero}`;
  if (tipo === 'Chocolate') return `CH${numero}`;
  return `${numero}B`;
}

/**
 * Etiqueta VISIBLE de una card: `P3` / `C3` / `CH3` / `B3`.
 *
 * Ojo con la diferencia: acá el bulto lleva el número atrás (`B3`) y en `ordenDeItem` lo lleva
 * adelante (`3B`). Son dos formatos históricos distintos —uno es lo que se ve en pantalla, el otro
 * lo que se escribe a Sheets— y confundirlos cambia el ID de las filas sin que se note.
 */
export function etiquetaCard(tipo: string, numero: number): string {
  if (tipo === 'Pallet') return `P${numero}`;
  if (tipo === 'Contenedor') return `C${numero}`;
  if (tipo === 'Chocolate') return `CH${numero}`;
  return `B${numero}`;
}

/**
 * Las cuatro clases de envase, en el vocabulario neutro del módulo. Cada formulario habla el suyo
 * —Santiago dice 'Pallet'/'Chocolate', Nacional dice 'pallet'/'chocolate'— y traduce al entrar.
 */
export type ClaseEnvase = 'pallet' | 'bulto' | 'contenedor' | 'chocolate';

/** Traduce el `tipo` de Santiago ('Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate'). */
export function claseSantiago(tipo: string): ClaseEnvase {
  if (tipo === 'Pallet') return 'pallet';
  if (tipo === 'Contenedor') return 'contenedor';
  if (tipo === 'Chocolate') return 'chocolate';
  return 'bulto';
}

/** Traduce el `pkg` de Nacional ('pallet' | 'box' | 'contenedor' | 'chocolate'). */
export function claseNacional(pkg: string): ClaseEnvase {
  if (pkg === 'pallet') return 'pallet';
  if (pkg === 'contenedor') return 'contenedor';
  if (pkg === 'chocolate') return 'chocolate';
  return 'bulto';
}

/** `orden` en el vocabulario de Nacional: `pallet1` / `bulto1` / `contenedor1` / `chocolate1`. */
export function ordenNacional(clase: ClaseEnvase, numero: number): string {
  return `${clase === 'bulto' ? 'bulto' : clase}${numero}`;
}

/**
 * El número que le toca a cada item: por posición dentro de su clase, salvo los CH, que conservan
 * su `seq`.
 *
 * Es el corazón de los cinco bloques `let pc = 0, bc = 0, cc = 0, chc = 0; …` que estaban copiados
 * por el formulario —uno por cada operación que rearma la lista (unificar, guardar, sumar, borrar)—.
 * Que estuviera repetido es la razón por la que el renumerado del CH se colaba por todos lados:
 * había que arreglarlo en los cinco o no se arreglaba en ninguno.
 *
 * Un CH sin `seq` (todavía sin imprimir) cae a su posición ENTRE LOS CH, no a la del arreglo.
 */
export function numerarPorClase<T>(
  items: T[], claseDe: (item: T) => ClaseEnvase, seqDe: (item: T) => number | null | undefined,
): { item: T; clase: ClaseEnvase; numero: number }[] {
  const cuenta: Record<ClaseEnvase, number> = { pallet: 0, bulto: 0, contenedor: 0, chocolate: 0 };
  return items.map(item => {
    const clase = claseDe(item);
    const posicion = ++cuenta[clase];
    const numero = numeroVisibleCard({ esChocolate: clase === 'chocolate', posicion, seq: seqDe(item) });
    return { item, clase, numero };
  });
}

/** Reasigna el `orden` de los items de Santiago (`P3` / `3B` / `C3` / `CH3`). */
export function renumerarOrden<T extends { tipo: string }>(
  items: T[], seqDe: (item: T) => number | null | undefined,
): (T & { orden: string })[] {
  return numerarPorClase(items, i => claseSantiago(i.tipo), seqDe)
    .map(({ item, numero }) => ({ ...item, orden: ordenDeItem(item.tipo, numero) }));
}

/** Reasigna el `orden` de los items de Nacional (`pallet3` / `bulto3` / `chocolate3`). */
export function renumerarOrdenNacional<T extends { pkg: string }>(
  items: T[], seqDe: (item: T) => number | null | undefined,
): (T & { orden: string })[] {
  return numerarPorClase(items, i => claseNacional(i.pkg), seqDe)
    .map(({ item, clase, numero }) => ({ ...item, orden: ordenNacional(clase, numero) }));
}
