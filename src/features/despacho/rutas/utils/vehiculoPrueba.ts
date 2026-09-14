// Qué vehículos de la flota son de PRUEBA, no de reparto. Puro y testeable.
//
// La flota tiene un vehículo "PRUEBA" que el coordinador usa a propósito para ensayar el flujo:
// armarle una ruta, cerrarlo, ver el manifiesto. No es un error que esté ahí — es una herramienta.
//
// El problema es que en el tablero se ve igual que un camión real. Y lo que se le asigna NO es de
// mentira: escribe en la planilla, en despacho_rm y en el seguimiento, igual que cualquier otro.
// Basta que alguien que no sepa arrastre una tienda ahí para que esa carga quede registrada como
// despachada en un camión que no existe.
//
// No se esconde ni se bloquea: se MARCA. Esconderlo rompería el uso legítimo, y bloquearlo obliga
// a mantener una lista de excepciones. Que se vea distinto alcanza.

/** Formas en que aparece escrito hoy. Se compara normalizado, no por igualdad exacta. */
function normalizar(s: string): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * `true` si el vehículo es de prueba.
 *
 * Se mira la patente Y la empresa porque en la flota real el registro es
 * `{ patente: 'PRUEBA', empresa: 'Prueba' }` — los dos campos lo dicen, y con que uno lo diga
 * basta. Se acepta también "Prueba 1", "PRUEBA 2", etc.: al ensayar se crean varios.
 *
 * Lo que NO marca: una patente real que por casualidad contenga las letras (no existe una patente
 * chilena así, pero la regla se ancla al inicio de la palabra para no depender de eso).
 */
export function esVehiculoDePrueba(patente?: string | null, empresa?: string | null): boolean {
  const pruebaAlInicio = (s: string) => /^prueba\b/.test(s) || /^test\b/.test(s);
  return pruebaAlInicio(normalizar(patente ?? '')) || pruebaAlInicio(normalizar(empresa ?? ''));
}

/** Texto del aviso, para el badge y su `title`. */
export const AVISO_PRUEBA = 'Vehículo de prueba — lo que le asignes se registra igual que en un camión real';
