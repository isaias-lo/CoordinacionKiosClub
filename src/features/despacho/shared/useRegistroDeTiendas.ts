'use client';

// Qué tiendas se registraron una por una.
//
// ── POR QUÉ AHORA VIAJA ENTRE EQUIPOS ─────────────────────────────────────────────────────────
//
// Antes esta marca vivía SOLO en el `localStorage` del navegador, y estaba razonado así: «la
// corrección no depende de esto; registrar dos veces es inofensivo; es para que la persona VEA qué
// ya hizo». Cierto todo. Pero el precio fue que nadie podía creerle al botón:
//
//   · el coordinador registraba desde un equipo y en el otro seguía en rojo;
//   · con la MISMA cuenta, desde otro dispositivo, también en rojo;
//   · Isaías lo veía en rojo antes, durante y después — su navegador nunca se enteró.
//
// Un botón que dice cosas distintas según el aparato no informa: confunde, y obliga a mirar la
// planilla para saber qué pasó. Eso es peor que el riesgo que se quiso evitar.
//
// Ese comentario terminaba con una promesa: «`fusionarRegistroTiendas` existe igual, con sus tests,
// para el día que esto sí viaje entre equipos». Este es ese día, y la función estaba lista.
//
// ── POR QUÉ NO HACE FALTA UN MERGE DE TRES VÍAS ───────────────────────────────────────────────
//
// El miedo era sumar «otro blob al merge de tres vías, con su base, su corta-ecos y su carrera de
// arranque». No hace falta nada de eso, porque este dato es MONÓTONO: solo crece.
// `fusionarRegistroTiendas` es una unión —idempotente y conmutativa, gana la hora más temprana— así
// que no existe el conflicto. Unir dos veces da lo mismo que unir una, y no importa en qué orden
// lleguen los eventos. Por eso va en su propia clave y no dentro del blob de los ítems.
//
// `localStorage` se queda como caché: pinta al instante y sigue andando sin señal.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  tiendaRegistrada, marcarTiendaRegistrada, fusionarRegistroTiendas, registroDeBlob,
  type RegistroTiendas,
} from './registroPorTienda';
import { fetchSessionState, pushSessionState, subscribeToSessionState } from '@/lib/userSessionState';

const CLAVE = 'bodegaRegistroPorTienda';
const FUENTE = 'registro_tiendas' as const;

function leer(): RegistroTiendas {
  if (typeof window === 'undefined') return {};
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as RegistroTiendas) : {};
  } catch {
    return {};   // storage bloqueado o JSON roto: se arranca limpio, no se rompe la pantalla
  }
}

function guardar(mapa: RegistroTiendas): RegistroTiendas {
  try { localStorage.setItem(CLAVE, JSON.stringify(mapa)); } catch { /* sin storage, igual anda */ }
  return mapa;
}

export function useRegistroDeTiendas(fechaISO: string) {
  // Arranca vacío y se hidrata en un efecto: leer localStorage durante el render hace que el HTML
  // del servidor y el del cliente no coincidan.
  const [mapa, setMapa] = useState<RegistroTiendas>({});
  // El mapa vigente para los handlers, sin que `marcar` se recree en cada cambio.
  const mapaRef = useRef<RegistroTiendas>({});
  useEffect(() => { mapaRef.current = mapa; }, [mapa]);

  /** Une lo que llegue con lo que ya hay. Nunca resta: por eso da igual el orden de llegada. */
  const absorber = useCallback((entrante: RegistroTiendas) => {
    setMapa(prev => guardar(fusionarRegistroTiendas(prev, entrante)));
  }, []);

  useEffect(() => { absorber(leer()); }, [absorber]);

  useEffect(() => {
    if (!fechaISO) return;
    let vivo = true;
    // La foto inicial: lo que ya marcaron los demás equipos hoy.
    void fetchSessionState(FUENTE, fechaISO)
      .then(remoto => { if (vivo) absorber(registroDeBlob(remoto)); })
      .catch(() => { /* sin red, se sigue con lo local */ });
    // Y lo que marquen de acá en adelante, en vivo.
    const unsub = subscribeToSessionState(
      FUENTE, '', remoto => absorber(registroDeBlob(remoto)), undefined, fechaISO,
    );
    return () => { vivo = false; unsub(); };
  }, [fechaISO, absorber]);

  const registrada = useCallback(
    (cod: string) => tiendaRegistrada(mapa, fechaISO, cod),
    [mapa, fechaISO],
  );

  const marcar = useCallback((cod: string) => {
    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const next = marcarTiendaRegistrada(mapaRef.current, fechaISO, cod, hora);
    mapaRef.current = next;
    setMapa(guardar(next));
    // Se LEE antes de empujar y se une. Empujar el mapa propio a secas borraría de la fila las
    // marcas de otro equipo que este navegador todavía no vio — y la regla es que una marca no se
    // pierde. Es un viaje de más por cada clic; un clic no es un camino caliente.
    void fetchSessionState(FUENTE, fechaISO)
      .then(remoto => pushSessionState(FUENTE, fusionarRegistroTiendas(registroDeBlob(remoto), next), undefined, fechaISO))
      .catch(() => { /* sin red queda local; el próximo clic con señal lo sube */ });
  }, [fechaISO]);

  return { registrada, marcar };
}
