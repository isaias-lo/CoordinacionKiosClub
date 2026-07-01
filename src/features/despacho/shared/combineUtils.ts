/**
 * Suma dos pesos (kg) redondeando a 2 decimales para evitar el drift de punto flotante
 * (ej. 0.1 + 0.2). Se usa al combinar/sumar items en bodega (P3). [P3]
 */
export function sumPeso(a: number, b: number): number {
  return Math.round(((a || 0) + (b || 0)) * 100) / 100;
}
