// Distinguir el lector de la handheld de una persona tecleando. Puro y testeable.
//
// La handheld de Bodega corre la PWA en Chrome y su lector está configurado como teclado: escribe
// el contenido del código y manda Enter, igual que la pistola de radiofrecuencia. El buscador ya
// entendía eso (`buscarPallet.ts`), pero SOLO si el cursor estaba en el buscador. En el teléfono la
// tienda se abre como una hoja que tapa el buscador, y con el cursor en Peso el código se escribía
// dentro del peso.
//
// ── Cómo se reconoce el lector ─────────────────────────────────────────────────────────────────
//
// Por la velocidad. El lector escribe cada carácter a pocos milisegundos del anterior; una persona,
// aun rápida, deja 80 ms o más entre teclas. Los umbrales de abajo dejan margen para lectores
// lentos sin acercarse a lo que teclea una persona. No están medidos en el equipo de Bodega: si
// una handheld resulta más lenta, se ajustan acá (la página de prueba en Perfil muestra las pausas).
//
// En el modo "pegar en el campo" que traen algunos equipos no hay teclas: el código llega entero
// en un solo evento. Eso es una ráfaga con todos los caracteres en el mismo instante, y cae en el
// mismo criterio sin un caso aparte.
//
// ── Por qué no hay un prefijo configurado ──────────────────────────────────────────────────────
//
// Un prefijo (un carácter especial antes de cada código) haría la detección exacta, pero obliga a
// configurar cada equipo igual y a que la pistola de escritorio también lo mande. La velocidad no
// pide nada al equipo, y `reconoce` (en el hook) exige además que el código calce con una etiqueta
// real antes de actuar sin Enter.

export const LECTOR = {
  /** Pausa máxima entre dos caracteres de la misma lectura. */
  maxPausaMs: 60,
  /** Promedio máximo entre caracteres. Una persona rápida anda por 80-120 ms. */
  maxPromedioMs: 35,
  /** Menos que esto no es una etiqueta: el número de slot más corto en uso tiene 4 dígitos. */
  minLargo: 4,
  /** Sin Enter: tras este silencio se evalúa lo leído (equipos configurados sin sufijo). */
  silencioMs: 120,
} as const;

/** Lo que se lee de un evento: los caracteres y cuándo llegaron. */
export interface Tramo {
  texto: string;
  t: number;
}

/**
 * ¿Estos tramos los escribió el lector?
 *
 * `tramos` en orden de llegada. Un tramo de varios caracteres (modo pegar) cuenta como caracteres
 * sin pausa entre ellos.
 */
export function esLecturaDeLector(tramos: readonly Tramo[], opts = LECTOR): boolean {
  const largo = tramos.reduce((n, tr) => n + tr.texto.length, 0);
  if (largo < opts.minLargo) return false;
  // Pausas entre caracteres: dentro de un tramo son 0; entre tramos, la diferencia de tiempos.
  let suma = 0;
  for (let i = 1; i < tramos.length; i++) {
    const pausa = tramos.at(i)!.t - tramos.at(i - 1)!.t;
    if (pausa > opts.maxPausaMs) return false;
    suma += pausa;
  }
  return suma / (largo - 1) <= opts.maxPromedioMs;
}

/**
 * Acumula lo que se va leyendo y dice, al cerrar, si fue el lector.
 *
 * `Marca` es lo que el llamador quiera guardar al empezar una lectura —en el hook, el campo que
 * tenía el foco y su valor ANTES del primer carácter— para deshacer lo que el lector escribió
 * ahí. Una pausa larga descarta lo acumulado y empieza una lectura nueva con su propia marca.
 */
export class Rafaga<Marca> {
  private tramos: Tramo[] = [];
  private marca: Marca | null = null;

  constructor(private readonly opts = LECTOR) {}

  /** Suma caracteres. `marcar` se llama solo si con esto empieza una lectura nueva. */
  agregar(texto: string, t: number, marcar: () => Marca): void {
    const limpio = texto.replace(/[\r\n]/g, '');
    if (!limpio) return;
    const ultimo = this.tramos.at(-1);
    if (!ultimo || t - ultimo.t > this.opts.maxPausaMs) {
      this.tramos = [];
      this.marca = marcar();
    }
    this.tramos.push({ texto: limpio, t });
  }

  /** Hay algo acumulado que todavía podría ser una lectura. */
  get pendiente(): boolean {
    return this.tramos.length > 0;
  }

  /** Lo acumulado hasta ahora, sin cerrar. */
  get texto(): string {
    return this.tramos.map(tr => tr.texto).join('');
  }

  /**
   * Termina la lectura en curso. Devuelve el código y la marca si fue el lector; `null` si fue
   * una persona o no había nada. Siempre deja el acumulador vacío.
   */
  cerrar(): { codigo: string; marca: Marca } | null {
    const fue = esLecturaDeLector(this.tramos, this.opts);
    const codigo = this.texto.trim();
    const marca = this.marca;
    this.descartar();
    return fue && codigo && marca !== null ? { codigo, marca } : null;
  }

  descartar(): void {
    this.tramos = [];
    this.marca = null;
  }
}

/**
 * Pide escanear dos veces antes de dejar a medias una tarjeta con datos sin guardar.
 *
 * Cambiar de tienda reconstruye las tarjetas, así que un peso tecleado y no guardado se pierde.
 * No se bloquea —puede ser justo lo que se quiere, por ejemplo tras escanear la etiqueta
 * equivocada—: la primera lectura avisa y la misma etiqueta otra vez, dentro de la ventana, pasa.
 */
export class ConfirmacionDoble {
  private previa: { codigo: string; t: number } | null = null;

  constructor(private readonly ventanaMs = 6000) {}

  /** `true` = seguir. `false` = es la primera vez: avisar y esperar la segunda. */
  confirmar(codigo: string, t: number): boolean {
    const p = this.previa;
    if (p && p.codigo === codigo && t - p.t <= this.ventanaMs) {
      this.previa = null;
      return true;
    }
    this.previa = { codigo, t };
    return false;
  }

  olvidar(): void {
    this.previa = null;
  }
}

/**
 * Enter en un campo de la tarjeta: a qué campo pasar, o `'guardar'` si era el último.
 *
 * `campos` = los nombres de los campos de la tarjeta en el orden en que aparecen. Un campo que no
 * está en la lista (cajas negras, guía) no avanza: Enter ahí no hace nada distinto de antes.
 */
export function siguienteCampo(campos: readonly string[], actual: string): string | 'guardar' | null {
  const i = campos.indexOf(actual);
  if (i === -1) return null;
  return campos.at(i + 1) ?? 'guardar';
}
