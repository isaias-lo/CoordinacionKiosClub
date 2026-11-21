'use client';

import { useCallback, useEffect, useState } from 'react';
import { traerContexto } from './apiCliente';
import type { ContextoMant } from './tipos';

/**
 * Las tiendas y categorías de quien abre la pantalla, con una copia en el celular.
 *
 * La copia es para crear una solicitud SIN SEÑAL: sin ella el formulario no tendría de qué tienda
 * elegir justo cuando la cola offline más hace falta. Es una comodidad: si el almacenamiento está
 * bloqueado, la pantalla funciona igual con señal.
 */
const CLAVE = 'kc_mant_contexto_v1';

function leerCopia(): ContextoMant | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as ContextoMant) : null;
  } catch { return null; }
}

function guardarCopia(c: ContextoMant): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch { /* sin almacenamiento */ }
}

export function useContextoMant() {
  const [contexto, setContexto] = useState<ContextoMant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const c = await traerContexto();
      setContexto(c);
      setError(null);
      guardarCopia(c);
    } catch (e) {
      const copia = leerCopia();
      if (copia) setContexto(copia);
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const copia = leerCopia();
    if (copia) setContexto(copia);
    void cargar();
  }, [cargar]);

  return { contexto, error, cargando, recargar: cargar };
}
