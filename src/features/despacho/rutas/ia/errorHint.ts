/**
 * Clasifica el mensaje de error de la IA para mostrar el aviso correcto al coordinador.
 *
 * El enrutador siempre tiene la ruta GPS como respaldo, así que un fallo de la IA nunca bloquea;
 * pero el MOTIVO importa para saber a quién avisar:
 *  - "de configuración" (falta ANTHROPIC_API_KEY en el servidor) → es infra, lo resuelve Isaías.
 *  - cualquier otro (modelo retirado, timeout, sin crédito, red) → fallo transitorio/del modelo.
 *
 * Puro y testeable: recibe el string de error del backend y devuelve si es de configuración.
 */
export function esErrorDeConfig(msg: string | undefined | null): boolean {
  return /no configurad|api[_ ]?key/i.test(msg ?? '');
}
