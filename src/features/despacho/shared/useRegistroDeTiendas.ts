'use client';

// Qué tiendas se registraron una por una, guardado en el equipo.
//
// ── POR QUÉ localStorage Y NO EL ESTADO COMPARTIDO ─────────────────────────────────────────────
//
// Porque la CORRECCIÓN no depende de esto. Registrar dos veces la misma tienda es inofensivo: los
// ids son deterministas y `api/sheets-write` solo agrega los que no tiene, así que la segunda vez
// actualiza en su lugar. Esta marca es para que la persona VEA qué ya hizo, no para impedir nada.
//
// Meterla en `shared_session_state` habría sumado otro blob al merge de tres vías —con su base, su
// corta-ecos y su carrera de arranque— para un dato que, si se pierde, no rompe nada: el botón
// vuelve a decir "Registrar" y apretarlo no hace daño. No vale ese precio.
//
// `fusionarRegistroTiendas` existe igual, con sus tests, para el día que esto sí viaje entre
// equipos. La regla ya está decidida: una marca nunca se pierde.

import { useCallback, useEffect, useState } from 'react';
import {
  tiendaRegistrada, marcarTiendaRegistrada, type RegistroTiendas,
} from './registroPorTienda';

const CLAVE = 'bodegaRegistroPorTienda';

function leer(): RegistroTiendas {
  if (typeof window === 'undefined') return {};
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as RegistroTiendas) : {};
  } catch {
    return {};   // storage bloqueado o JSON roto: se arranca limpio, no se rompe la pantalla
  }
}

export function useRegistroDeTiendas(fechaISO: string) {
  // Arranca vacío y se hidrata en un efecto: leer localStorage durante el render hace que el HTML
  // del servidor y el del cliente no coincidan.
  const [mapa, setMapa] = useState<RegistroTiendas>({});
  useEffect(() => { setMapa(leer()); }, []);

  const registrada = useCallback(
    (cod: string) => tiendaRegistrada(mapa, fechaISO, cod),
    [mapa, fechaISO],
  );

  const marcar = useCallback((cod: string) => {
    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    setMapa(prev => {
      const next = marcarTiendaRegistrada(prev, fechaISO, cod, hora);
      try { localStorage.setItem(CLAVE, JSON.stringify(next)); } catch { /* sin storage, igual anda */ }
      return next;
    });
  }, [fechaISO]);

  return { registrada, marcar };
}
