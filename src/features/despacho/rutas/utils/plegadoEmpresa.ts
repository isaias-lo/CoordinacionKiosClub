// Plegar y desplegar la flota por empresa en el tablero del Enrutador. Puro y testeable.
//
// Con la flota completa —seis empresas y más de veinte patentes— la columna derecha se hace larga y
// hay que scrollearla entera para llegar a la empresa con la que se está trabajando. Plegar las que
// no se están usando deja a la vista solo lo que importa.
//
// Lo que se pliega es la GRILLA de tarjetas, nunca el encabezado: una empresa plegada tiene que
// seguir diciendo cuánto lleva, o plegarla escondería carga y el resumen del día dejaría de cuadrar
// con lo que se ve en pantalla.

/** Lo que muestra el encabezado de una empresa plegada. */
export interface ResumenEmpresa {
  camiones: number;
  /** Camiones con al menos una tienda. Es lo que de verdad va a salir. */
  cargados: number;
  tiendas: number;
  pallets: number;
  bultos: number;
}

/**
 * Suma lo que lleva una empresa.
 *
 * `asignaciones` es el tablero completo; de acá solo se miran las patentes de esta empresa. Los
 * chocolates suman como BULTO, igual que en el resto del sistema: es lo que quedó registrado en
 * Bodega y lo que sale del CD hacia la flota.
 */
export function resumenEmpresa(
  patentes: string[],
  asignaciones: Record<string, { p?: number; b?: number; ch?: number }[] | undefined>,
): ResumenEmpresa {
  let cargados = 0, tiendas = 0, pallets = 0, bultos = 0;
  for (const p of patentes) {
    const lista = asignaciones[p] ?? [];
    if (lista.length > 0) cargados++;
    tiendas += lista.length;
    for (const t of lista) {
      pallets += Number(t?.p) || 0;
      bultos  += (Number(t?.b) || 0) + (Number(t?.ch) || 0);
    }
  }
  return { camiones: patentes.length, cargados, tiendas, pallets, bultos };
}

/**
 * ¿Arranca plegada esta empresa?
 *
 * Una empresa SIN carga arranca plegada; una con carga, abierta. Así, al abrir el Enrutador, se ve
 * primero con lo que se está trabajando, y lo demás queda a un clic.
 *
 * `guardado` manda por encima de la regla: si alguien la plegó o la desplegó a mano, esa decisión
 * se respeta. Sin eso, la pantalla desharía el gesto de la persona apenas cambie la carga.
 */
export function empiezaPlegada(
  empresa: string,
  resumen: ResumenEmpresa,
  guardado: Record<string, boolean> | undefined,
): boolean {
  const elegido = guardado?.[empresa];
  if (typeof elegido === 'boolean') return elegido;
  return resumen.tiendas === 0;
}

/** Alterna una empresa, conservando el resto de las decisiones. */
export function alternarEmpresa(
  guardado: Record<string, boolean> | undefined, empresa: string, plegada: boolean,
): Record<string, boolean> {
  return { ...(guardado ?? {}), [empresa]: plegada };
}

/**
 * El texto del encabezado plegado: `3 de 5 · 12 tiendas · 28P · 40B`.
 *
 * Se omite lo que está en cero en vez de escribir "0 tiendas · 0P · 0B": una empresa vacía se lee
 * de un vistazo por lo que NO dice.
 */
export function textoResumen(r: ResumenEmpresa): string {
  if (r.tiendas === 0) return `${r.camiones} sin carga`;
  const partes = [`${r.cargados} de ${r.camiones}`, `${r.tiendas} tienda${r.tiendas === 1 ? '' : 's'}`];
  if (r.pallets > 0) partes.push(`${r.pallets}P`);
  if (r.bultos  > 0) partes.push(`${r.bultos}B`);
  return partes.join(' · ');
}
