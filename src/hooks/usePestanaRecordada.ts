'use client';
import { useCallback, useState } from 'react';

// Recordar en qué pestaña estabas.
//
// Recargar la página te devolvía siempre a la primera: si estabas en el Planificador y recargabas,
// aparecías en Despacho. Pasa en todos los módulos con pestañas, y es fricción diaria — recargar
// es lo primero que uno hace cuando algo se ve raro.
//
// Se guarda por dispositivo (`localStorage`), no en la sesión compartida: en qué pestaña mira cada
// uno es una preferencia local, no algo que deba viajar al celular del otro. Es el mismo criterio
// —y el mismo mecanismo— que ya usa Config para la vista de tarjetas/tabla y el orden.

/**
 * Devuelve el valor guardado solo si sigue siendo una opción válida.
 *
 * Un valor viejo —una pestaña que se renombró o se eliminó— dejaría la pantalla en blanco sin
 * decir por qué, y encima sobreviviría a recargar. Ante la duda, el valor por defecto.
 *
 * Puro y testeable: la parte que puede romper una pantalla no depende del navegador.
 */
export function pestanaValida<T extends string>(
  guardado: string | null | undefined,
  permitidas: readonly T[],
  porDefecto: T,
): T {
  return permitidas.includes(guardado as T) ? (guardado as T) : porDefecto;
}

/**
 * `useState` que además recuerda el valor entre recargas.
 *
 * `clave` identifica la pantalla (p. ej. `'enrutador_modo'`). `permitidas` es la lista cerrada:
 * lo que no esté ahí se ignora.
 *
 * Nunca lanza: si `localStorage` no está disponible —modo privado, permisos, SSR— se comporta
 * como un `useState` normal. Perder la pestaña recordada no puede impedir abrir la pantalla.
 */
export function usePestanaRecordada<T extends string>(
  clave: string,
  permitidas: readonly T[],
  porDefecto: T,
): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    if (typeof window === 'undefined') return porDefecto;
    try { return pestanaValida(window.localStorage.getItem(clave), permitidas, porDefecto); }
    catch { return porDefecto; }
  });

  const cambiar = useCallback((v: T) => {
    setValor(v);
    try { window.localStorage.setItem(clave, v); } catch { /* sin storage: solo no se recuerda */ }
  }, [clave]);

  return [valor, cambiar];
}
