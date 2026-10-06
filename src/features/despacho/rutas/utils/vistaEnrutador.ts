'use client';

// Interruptor de la vista del Enrutador: la clásica de siempre o la nueva («Un paso a la vez»).
//
// Es una preferencia de ESTE equipo (localStorage), no un ajuste compartido: probar la vista nueva
// en un notebook no le cambia la pantalla a nadie más. Cambiar de vista no recarga nada: es solo
// qué se dibuja arriba del mismo tablero, con el mismo estado.

import { useCallback, useEffect, useState } from 'react';

export type VistaEnrutador = 'clasica' | 'nueva';

export const LS_VISTA_ENRUTADOR = 'enrutador_vista';

/** Cualquier cosa que no sea exactamente «nueva» es la clásica: es la que ya funciona. */
export function leerVista(raw: string | null | undefined): VistaEnrutador {
  return raw === 'nueva' ? 'nueva' : 'clasica';
}

export function useVistaEnrutador(): [VistaEnrutador, (v: VistaEnrutador) => void] {
  // Arranca en la clásica y lee la preferencia después de montar: igual en servidor y cliente.
  const [vista, setVista] = useState<VistaEnrutador>('clasica');
  useEffect(() => {
    try { setVista(leerVista(localStorage.getItem(LS_VISTA_ENRUTADOR))); } catch { /* sin storage: clásica */ }
  }, []);
  const cambiar = useCallback((v: VistaEnrutador) => {
    setVista(v);
    try { localStorage.setItem(LS_VISTA_ENRUTADOR, v); } catch { /* queda solo para esta sesión */ }
  }, []);
  return [vista, cambiar];
}
