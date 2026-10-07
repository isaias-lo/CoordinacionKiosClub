'use client';

import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useCallback, useState } from 'react';
import { debeConsultar, TICK_MS } from '@/lib/ritmoDePoll';
import { esperaDePush } from '@/lib/esperaDePush';
import type {
  SantiagoState, SantiagoItem, TiendaSantiago, RegimenCarga,
} from '../types';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState, fetchSessionStateMeta, subscribeToSessionState, remotoEsMasViejo } from '@/lib/userSessionState';
import { useVisibilityRefetch } from '@/hooks/useVisibilityRefetch';
import { mergeItemsByTienda, itemsFromSnapshot } from './mergeItems';
import { tieneLapida, lapidasComoLista, absorberLapidas } from '../../shared/lapidasBorrado';
import { agregarSinDuplicar } from '../../shared/itemPorUnidad';
import { stableItemKey } from '../../shared/formRowsReconcile';
import { serializarBaseSantiago } from '../../shared/syncBase';
import { fechaChile, fechaChileDe } from '@/lib/fechaChile';
import { estaRegistrado, marcarRegistro, fusionarRegistros, migrarRegistroViejo, type RegistroPorFecha } from '@/features/despacho/shared/registroPorFecha';
import { fechaDespachoBodega } from '../../shared/fechaLocal';
import { soltarTiendasAjenas } from '../../shared/itemsDelEspejo';
import { isRegionesCod } from '../../regiones/data/tiendas';

// Se eliminó el paso de selección de Régimen: se entra directo a la bodega (lista de
// tiendas) con régimen 'Seco' por defecto (es el que se escribe en Sheets/despacho_rm).
const defaultState: SantiagoState = {
  step: 'form',
  regimen: 'Seco',
  currentTienda: null,
  items: {},
};

type SyncableState = {
  step: SantiagoState['step'];
  regimen: RegimenCarga | null;
  items: Record<string, SantiagoItem[]>;
  fechaDespacho?: string;
  registrado?: boolean;
  /** La fuente de verdad: qué días quedaron registrados. Ver shared/registroPorFecha. */
  registros?: RegistroPorFecha;
  /** Lápidas compartidas: la única señal de borrado que respeta el merge. Ver shared/lapidasBorrado. */
  borrados?: string[];
};

const todayKey = fechaChile();
const SANTIAGO_KEY = `santiagoState_${todayKey}`;

function isTodayPush(pushedAt: unknown): boolean {
  if (typeof pushedAt !== 'number') return false; // no timestamp — reject to avoid stale data
  // Mismo día del CD con que se arma la clave de arriba: comparar con el reloj del equipo dejaba
  // pasar (o descartaba) un estado según el huso de quien mirara.
  return fechaChileDe(new Date(pushedAt)) === fechaChile();
}
export const SANTIAGO_TERMINADO_KEY = `santiagoTerminado_${todayKey}`;

function loadState(): SantiagoState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(SANTIAGO_KEY);
    if (!raw) return defaultState;
    const s = JSON.parse(raw) as SantiagoState & { _savedAt?: number };
    // Reject if the saved state has no timestamp or was written on a different day
    if (!isTodayPush(s._savedAt)) return defaultState;
    // Ya no existe el paso de Régimen: siempre se entra directo a la lista de tiendas.
    if (typeof window !== 'undefined') sessionStorage.removeItem('santiago_resume_form');
    s.step = 'form';
    if (!s.regimen) s.regimen = 'Seco';
    return s;
  } catch {
    return defaultState;
  }
}

/** El mapa de items sin las tiendas que le pertenecen a Nacional. Ver `itemsDelEspejo.ts`. */
function itemsPropios(items: Record<string, SantiagoItem[]>): Record<string, SantiagoItem[]> {
  const { items: limpio, ajenas } = soltarTiendasAjenas(items, isRegionesCod);
  if (ajenas.length) console.warn('[bodega] RM/Costa suelta tiendas de Nacional:', ajenas.join(', '));
  return limpio as Record<string, SantiagoItem[]>;
}

type SantiagoAction =
  /** Solo para el `dispatch` del provider: el estado ya calculado contra `stateRef`. */
  | { type: '__ESTADO'; estado: SantiagoState }
  | { type: 'SET_REGIMEN'; payload: RegimenCarga }
  | { type: 'BACK_TO_REGIMEN' }
  | { type: 'SELECT_TIENDA'; payload: TiendaSantiago }
  | { type: 'CLEAR_TIENDA' }
  | { type: 'ADD_ITEM'; item: SantiagoItem }
  | { type: 'DELETE_ITEM'; tiendaCod: string; idx: number }
  | { type: 'EDIT_ITEM'; tiendaCod: string; idx: number; item: SantiagoItem }
  | { type: 'SET_ITEMS'; tiendaCod: string; items: SantiagoItem[] }
  | { type: 'RESET' }
  | { type: 'LOAD_STATE'; payload: SyncableState }
  | { type: 'SET_FECHA_DESPACHO'; payload: string }
  | { type: 'SET_REGISTRADO'; payload: boolean };

function reducer(state: SantiagoState, action: SantiagoAction): SantiagoState {
  switch (action.type) {
    case '__ESTADO':
      return action.estado;
    case 'SET_REGIMEN':
      return { ...state, regimen: action.payload, step: 'form' };

    case 'BACK_TO_REGIMEN':
      return { ...state, step: 'regimen', currentTienda: null };

    case 'SELECT_TIENDA':
      return { ...state, currentTienda: action.payload };

    case 'CLEAR_TIENDA':
      return { ...state, currentTienda: null };

    case 'ADD_ITEM': {
      const cod = action.item.tiendaCod;
      // Si la unidad de Picking ya tiene ítem (lo guardó otro equipo), se reemplaza: no se suma otro.
      return {
        ...state,
        items: { ...state.items, [cod]: agregarSinDuplicar(state.items[cod] || [], action.item) },
      };
    }

    case 'DELETE_ITEM': {
      const list = (state.items[action.tiendaCod] || []).filter((_, i) => i !== action.idx);
      return { ...state, items: { ...state.items, [action.tiendaCod]: list } };
    }

    case 'EDIT_ITEM': {
      const list = [...(state.items[action.tiendaCod] || [])];
      list[action.idx] = action.item;
      return { ...state, items: { ...state.items, [action.tiendaCod]: list } };
    }

    case 'SET_ITEMS':
      return { ...state, items: { ...state.items, [action.tiendaCod]: action.items } };

    case 'RESET':
      return { ...defaultState };

    case 'LOAD_STATE': {
      const fechaTrasCarga = action.payload.fechaDespacho ?? state.fechaDespacho;
      // Se ADOPTAN los registros del otro equipo (un `true` nunca se pierde) y se conserva el
      // booleano viejo que puedan traer los estados ya guardados.
      const registrosTrasCarga = migrarRegistroViejo(
        fusionarRegistros(state.registros, action.payload.registros),
        action.payload.registrado, action.payload.fechaDespacho,
      );
      return {
        ...state,
        // step is intentionally not synced — each device controls its own navigation
        regimen:       action.payload.regimen       ?? state.regimen,
        // Las tiendas de Nacional se SUELTAN al cargar. El #681 cerró la puerta por donde
        // entraban; las que ya estaban se quedaban huérfanas —sin tarjeta que dibujar, porque la
        // lista filtra Regiones— inflando el Resumen y listas para que REGISTRAR les escribiera
        // una foto vieja. Ver `itemsDelEspejo.ts`: no toca `picking_pallets`.
        items:         itemsPropios(action.payload.items ?? state.items),
        fechaDespacho: fechaTrasCarga,
        registros:     registrosTrasCarga,
        // `registrado` pasa a ser DERIVADO del mapa: los componentes lo siguen leyendo igual.
        registrado:    estaRegistrado(registrosTrasCarga, fechaDespachoBodega(fechaTrasCarga)),
      };
    }

    case 'SET_FECHA_DESPACHO': {
      // Cambiar la fecha YA NO borra el registro. Antes acá iba `registrado: false`, y mover la
      // fecha para dejar lista la carga de mañana desregistraba el día que sí se había registrado
      // —y ese false se empujaba a todos los equipos—. Ver shared/registroPorFecha.
      return {
        ...state,
        fechaDespacho: action.payload,
        registrado: estaRegistrado(state.registros, action.payload),
      };
    }

    case 'SET_REGISTRADO': {
      // LA FECHA DE DESPACHO SE CALCULA, NO SE LEE CRUDA.
      //
      // `state.fechaDespacho` está VACÍO mientras nadie toque el selector a mano — verificado en vivo el
      // 01/10: los dos espejos tenían `(VACIO)` en el estado compartido mientras la pantalla mostraba
      // 02/10/2026, porque la pantalla CALCULA el día hábil siguiente para mostrarlo.
      //
      // Marcar el registro con esa fecha vacía no hace nada: `marcarRegistro` devuelve el mapa sin
      // cambios, así que `registros` quedaba en `{}` y el día se leía como NO registrado. El botón
      // volvía a rojo y al otro día salía el banner «DESPACHO SIN REGISTRAR» sobre un día que sí se
      // había registrado — que es lo que el #643 creyó arreglar y no arregló.
      //
      // `fechaDespachoBodega` es la MISMA función que usan el selector y la escritura de la planilla.
      const registros = marcarRegistro(state.registros, fechaDespachoBodega(state.fechaDespacho), action.payload);
      return { ...state, registros, registrado: action.payload };
    }

    default:
      return state;
  }
}

interface SantiagoContextValue {
  state: SantiagoState;
  dispatch: React.Dispatch<SantiagoAction>;
  /** `extra` pisa campos del estado: hace falta cuando se llama en la misma vuelta que un
   *  `dispatch`, porque ahí `stateRef` todavía tiene el valor viejo. */
  flushPending: (extra?: { registrado?: boolean; registros?: RegistroPorFecha }) => void;
  /** [Bodega · indicador visible] Ver el mismo campo en AppContext.tsx — misma señal, mismo
   *  motivo: el canal puede quedar unido y mudo sin avisar, y hasta ahora nadie en pantalla se
   *  enteraba (el respaldo por polling ya no se apaga, pero seguía siendo invisible). */
  canalSano: boolean;
  /** [Bodega · tarjeta "llena pero no guardada" al entrar] Re-consulta `shared_session_state` y
   *  aplica lo remoto YA (mismo camino que el catch-up de visibilidad/reconexión — conflictos,
   *  corta-ecos y todo). Sin esto, abrir una tienda usaba lo que ya hubiera en memoria: si el
   *  compañero guardó mientras este equipo estaba en background (el polling se pausa ahí), el
   *  peso ya había llegado por el canal de picking_pallets (~600ms) pero el ítem "guardado" podía
   *  demorar minutos. Quien selecciona la tienda llama esto para no depender de esa carrera. */
  catchUp: () => void;
}

const SantiagoContext = createContext<SantiagoContextValue | null>(null);

export function SantiagoProvider({ children }: { children: ReactNode }) {
  const [state, dispatchReact] = useReducer(reducer, undefined, loadState);
  const { user } = useAuth();
  const userId = user?.id;
  const [canalSano, setCanalSano] = useState(true);

  // Always-current ref so async callbacks never see stale state
  const stateRef        = useRef(state);
  stateRef.current      = state;
  // `stateRef` se adelanta en el MISMO instante del dispatch, no recién en el próximo render. Entre
  // un dispatch y su render (después de un `await`, React no pinta en el acto) podía llegar un
  // remoto, mezclarse contra el estado de ANTES y su LOAD_STATE borraba lo recién agregado: la
  // unidad volvía «sin guardar» con sus datos. El reducer es puro, así que calcularlo dos veces
  // (acá y en React) da lo mismo.
  //
  // React recibe el estado ya calculado (`__ESTADO`), no la acción: así el ref y React nunca
  // pueden divergir aunque algún día el reducer deje de ser puro.
  const dispatch = useCallback((action: SantiagoAction) => {
    const siguiente = reducer(stateRef.current, action);
    stateRef.current = siguiente;
    dispatchReact({ type: '__ESTADO', estado: siguiente });
  }, []);
  const lastPushedRef   = useRef<string>('');       // [P5] BASE canónica (serializarBaseSantiago)
  const lastPushedFullRef = useRef<string>('');     // [P5] payload completo: solo para "¿hay que empujar?"
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushingRef    = useRef(false); // true while the async Supabase upsert is in-flight
  const isInitializedRef = useRef(false);
  const clearedAtRef         = useRef<number>(0); // timestamp of last intentional RESET push
  const lastPushTimestampRef = useRef<number>(0); // pushedAt value included in last push payload
  const lastServerStampRef   = useRef<number>(0); // [C3/RC-6] updated_at (reloj SERVIDOR) del último push/adopción
  const catchUpRef        = useRef<() => void>(() => {}); // [P9] re-fetch + apply remoto (catch-up)
  const pendingCatchupRef = useRef(false);        // [P9] remoto llegó durante push local → catch-up al terminar
  const vencimientoPushRef = useRef<number>(0);   // tope del debounce (ver lib/esperaDePush)

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const normalize = (s: SyncableState): SyncableState => ({
      ...s,
      // Pasos deprecados ('resumen', 'regimen') → 'form' (ya no hay selección de régimen).
      step: ['resumen', 'regimen'].includes(s.step as string) ? 'form' : s.step,
    });

    const handleRemote = (remoteState: unknown, updatedAt?: number) => {
      // Solo se difiere mientras el upsert está EN VUELO. Un push meramente AGENDADO (el debounce)
      // ya no bloquea: descartar el cambio del compañero ahí era la causa de que se perdiera
      // trabajo con varias personas — después este equipo escribía el blob COMPLETO, sin lo suyo,
      // y la fila es una sola por día donde gana el último que escribe. Ver AppContext, misma nota.
      if (isPushingRef.current) { pendingCatchupRef.current = true; return; }
      // Block for 30 s after an intentional RESET to prevent remote from restoring cleared data
      if (Date.now() - clearedAtRef.current < 30_000) return;
      // Reject data without an explicit sessionDate or from a different calendar day
      const remoteSessionDate = (remoteState as { sessionDate?: string }).sessionDate;
      if (!remoteSessionDate || remoteSessionDate !== todayKey) return;
      // Las lápidas son acumulativas: se incorporan aunque el remoto sea viejo o sea mi eco.
      absorberLapidas((remoteState as { borrados?: unknown }).borrados);
      // [C3/RC-6] Rechaza un remoto MÁS VIEJO que lo último que incorporé, ordenando por reloj del
      // SERVIDOR (updated_at) y no por el de cada equipo; sin server-stamp cae al pushedAt del cliente.
      const rawPushedAt = (remoteState as { pushedAt?: number }).pushedAt;
      if (remotoEsMasViejo(updatedAt, lastServerStampRef.current, rawPushedAt, lastPushTimestampRef.current)) return;

      const remote = normalize(remoteState as SyncableState);
      // [P5] Base canónica: antes acá se serializaban 3 claves y en el push 5, así que `isDirty`
      // daba SIEMPRE true y el corta-ecos no cortaba nunca → cada equipo re-empujaba lo adoptado.
      const remoteStr = serializarBaseSantiago(remote);
      if (remoteStr === lastPushedRef.current) return; // already in sync
      // Voy a incorporar este remoto → avanzo el reloj de servidor de referencia.
      if (updatedAt != null && updatedAt > lastServerStampRef.current) lastServerStampRef.current = updatedAt;

      const localStr = serializarBaseSantiago(stateRef.current);
      const isDirty = localStr !== lastPushedRef.current;

      if (isDirty && remote.items) {
        // Merge por-tienda respetando quién cambió qué: sólo conservo MI copia de las tiendas que
        // realmente edité desde el último sync; las que no toqué adopto la versión remota (que puede
        // ser una edición más nueva del otro dispositivo). Antes era `{ ...remote, ...local }` y la
        // copia local pisaba TODA tienda → "revertía" al unir CH/bultos desde el móvil. Ver mergeItems.ts.
        const lastSyncedItems = itemsFromSnapshot<SantiagoItem>(lastPushedRef.current);
        // [Aviso de conflicto] Si A y B editaron el MISMO ítem de forma distinta desde el último
        // sync de cada uno, se avisa acá — vía evento, no vía contexto, porque el toast vive en
        // la pantalla (StepForm.tsx), no en el provider. Gana local igual (nunca se pierde un
        // cambio legítimo en silencio), pero ya no es en silencio.
        const merged = mergeItemsByTienda(remote.items, stateRef.current.items, lastSyncedItems, stableItemKey,
          (cod, item) => {
            if (typeof window === 'undefined') return;
            window.dispatchEvent(new CustomEvent('bodega-conflicto-edicion', { detail: { cod, orden: item.orden } }));
          },
          // [Lápidas] Lo que se borró (acá o en otro equipo) no vuelve. Ver `shared/lapidasBorrado.ts`.
          tieneLapida);
        dispatch({ type: 'LOAD_STATE', payload: { step: stateRef.current.step, regimen: stateRef.current.regimen, items: merged } });
      } else {
        // Lo local está limpio → se adopta el remoto, PERO lo que yo tengo y el remoto no trae se
        // conserva (ausencia no es borrado; ver mergeItems). "Limpio" es exactamente como queda
        // este equipo justo después de empujar, y el remoto de un equipo que aún no recibió mi
        // pallet no lo trae: antes acá se adoptaba el remoto entero y el pallet desaparecía.
        // Si quedé con algo que el remoto no tiene, la base pasa a ser el remoto → el estado queda
        // "sucio" y el próximo push lo sube, así el servidor también lo recupera.
        lastPushedRef.current = remoteStr;
        const localItems = stateRef.current.items ?? {};
        const items = remote.items
          ? mergeItemsByTienda(remote.items, localItems, localItems, stableItemKey, undefined, tieneLapida)
          : remote.items;
        dispatch({ type: 'LOAD_STATE', payload: { ...remote, items } });
      }
    };

    // [P9] Catch-up: re-consulta el estado y lo aplica (usado al volver a la pestaña/app y tras un push)
    catchUpRef.current = () => {
      fetchSessionStateMeta('santiago').then((m) => { if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined); }).catch(() => {});
    };

    // Initial fetch
    fetchSessionStateMeta('santiago')
      .then((m) => {
        isInitializedRef.current = true;
        if (!m?.state) return;
        // Reject data without an explicit sessionDate or from a different calendar day
        const remoteSessionDate = (m.state as { sessionDate?: string }).sessionDate;
        if (!remoteSessionDate || remoteSessionDate !== todayKey) return;
        absorberLapidas((m.state as { borrados?: unknown }).borrados);
        const s = normalize(m.state as SyncableState);
        lastPushedRef.current = serializarBaseSantiago(s);
        if (m.updatedAt != null) lastServerStampRef.current = m.updatedAt; // [C3/RC-6] base del reloj de servidor
        // [29/09] Se UNE con lo que este equipo tenía en localStorage en vez de reemplazarlo. Si
        // alguien guardó un pallet y salió de la pantalla antes del push (2,5 s), el desmontaje lo
        // deja solo en localStorage; antes, al volver, el remoto lo pisaba y el pallet se perdía.
        // Si queda algo que el remoto no tenía, la base (= remoto) difiere → el próximo push lo sube.
        const localItems = stateRef.current.items ?? {};
        const items = s.items
          ? mergeItemsByTienda(s.items, localItems, localItems, stableItemKey, undefined, tieneLapida)
          : s.items;
        dispatch({ type: 'LOAD_STATE', payload: { ...s, items } });
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works). Track connection health so the
    // polling fallback below only runs when Realtime is down — otherwise we'd re-download the
    // full state blob every 15 s on every open tab (wasted egress).
    let realtimeConnected = false;
    const unsub = subscribeToSessionState('santiago', userId, handleRemote, (connected) => {
      const reconnected = connected && !realtimeConnected;
      realtimeConnected = connected;
      setCanalSano(connected); // solo espejo para UI — el closure de arriba sigue siendo la fuente que usa el polling
      // On (re)connect, fetch once to catch any change missed while the socket was down.
      if (reconnected) {
        fetchSessionStateMeta('santiago').then((m) => { if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined); }).catch(() => {});
      }
    });

    // Respaldo: con el canal caído, cada 15 s. Con el canal SANO ya no se apaga — pasa a una vez
    // por minuto, solo para detectar que el canal quedó mudo. Antes el respaldo se apagaba del
    // todo mientras el canal dijera "conectado", y ese "conectado" solo cambia si el canal AVISA.
    // La caída muda (reinicio del servidor de tiempo real, rebalanceo, throttle) dejaba al equipo
    // ciego para siempre, y ciego se ve igual que "no pasó nada en bodega". Ver lib/ritmoDePoll.
    let tickPoll = 0;
    const pollId = setInterval(async () => {
      tickPoll += 1;
      if (!debeConsultar(realtimeConnected, tickPoll)) return;
      try {
        const m = await fetchSessionStateMeta('santiago');
        if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined);
      } catch {}
    }, TICK_MS);

    return () => { unsub(); clearInterval(pollId); };
  }, [userId]);

  // Debounced push to Supabase (2.5 s after last change) + localStorage fallback.
  // The debounce window also throttles how often the full row is re-broadcast over Realtime
  // to every subscriber — a longer window means fewer rebroadcasts of the whole blob (egress).
  // The unmount cleanup flushes to localStorage so navigating away never loses data.
  useEffect(() => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = {
      step: state.step, regimen: state.regimen, items: state.items,
      fechaDespacho: state.fechaDespacho, registrado: state.registrado, registros: state.registros,
      borrados: lapidasComoLista(),
    };
    // [P5] El chequeo de cambios mira el payload COMPLETO; la base del merge/corta-ecos va aparte.
    const current = JSON.stringify(payload);
    if (current === lastPushedFullRef.current) { vencimientoPushRef.current = 0; return; }

    const doPush = () => {
      debounceRef.current = null;
      vencimientoPushRef.current = 0;
      // Mark a clear so handleRemote won't restore data for 30 s
      const isEmpty = Object.keys(payload.items).length === 0;
      if (isEmpty) clearedAtRef.current = Date.now();
      const prevLastPushed = lastPushedRef.current;
      const prevLastFull   = lastPushedFullRef.current;
      lastPushedRef.current     = serializarBaseSantiago(payload);
      lastPushedFullRef.current = current;
      isPushingRef.current = true;
      const pushedAt = Date.now();
      lastPushTimestampRef.current = pushedAt;
      pushSessionState('santiago', { ...payload, pushedAt, sessionDate: todayKey }, userId ?? undefined)
        .then((serverTs) => { if (serverTs != null) lastServerStampRef.current = Math.max(lastServerStampRef.current, serverTs); }) // [C3/RC-6] reloj de servidor de mi push
        .catch(() => { lastPushedRef.current = prevLastPushed; lastPushedFullRef.current = prevLastFull; }) // reset so dirty check retries correctly
        .finally(() => {
          isPushingRef.current = false;
          // [P9] Si llegó un remoto mientras empujábamos, ponerse al día ahora (no se descarta).
          if (pendingCatchupRef.current) { pendingCatchupRef.current = false; catchUpRef.current(); }
        });
      try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...state, _savedAt: Date.now() })); } catch {}
    };

    // Debounce CON TOPE: nunca más de 2,5 s desde el primer cambio pendiente. Sin él, ahora que
    // cada fusión remota es un cambio de estado más, el tráfico ajeno podría posponer el push
    // propio indefinidamente. Ver lib/esperaDePush.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const { espera, vencimiento } = esperaDePush(vencimientoPushRef.current, Date.now());
    vencimientoPushRef.current = vencimiento;
    // `registrado` es un flag CRÍTICO: empujar INMEDIATO (sin el debounce de 2.5s). El usuario
    // suele ir a Inicio justo tras Registrar → eso desmonta el provider y el cleanup del debounce
    // solo guarda en localStorage (no empuja a Supabase), así que registrado=true no llegaba a la
    // BD y PendingDraftBanner mostraba "sin registrar" al día siguiente. Empujarlo ya evita la carrera.
    if (state.registrado) doPush();
    else debounceRef.current = setTimeout(doPush, espera);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Flush synchronously on unmount so navigating away doesn't lose data
        try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...stateRef.current, _savedAt: Date.now() })); } catch {}
      }
    };
  }, [state.step, state.regimen, state.items, state.fechaDespacho, state.registrado, state]);

  /**
   * Empuja YA lo que estuviera pendiente. Se llama antes de navegar.
   *
   * `extra` pisa campos del estado. NO es un adorno: `stateRef.current` se actualiza en un efecto,
   * así que justo después de un `dispatch` todavía tiene el estado VIEJO. Quien llama a esto en la
   * misma vuelta que un dispatch —el modal de REGISTRAR— empujaba el estado de ANTES.
   *
   * El 30/09 los dos registros del día quedaron en `actividad_bodega` y en la planilla, pero el
   * estado compartido siguió diciendo `registrado: false` y `registros: {}`. Al día siguiente el
   * banner avisaba «DESPACHO SIN REGISTRAR · 30 SEP» sobre un día que sí se había registrado — y
   * ofrecía registrarlo otra vez.
   */
  const flushPending = useCallback((extra?: { registrado?: boolean; registros?: RegistroPorFecha }) => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = {
      step: stateRef.current.step, regimen: stateRef.current.regimen, items: stateRef.current.items,
      fechaDespacho: stateRef.current.fechaDespacho, registrado: stateRef.current.registrado, registros: stateRef.current.registros,
      borrados: lapidasComoLista(),
      ...extra,
    };
    const current = JSON.stringify(payload);
    if (current === lastPushedFullRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    vencimientoPushRef.current = 0;
    const prevPushed = lastPushedRef.current;
    const prevFull   = lastPushedFullRef.current;
    lastPushedRef.current     = serializarBaseSantiago(payload);
    lastPushedFullRef.current = current;
    const pushedAt = Date.now();
    lastPushTimestampRef.current = pushedAt;
    pushSessionState('santiago', { ...payload, pushedAt, sessionDate: todayKey }, userId ?? undefined)
      .then((serverTs) => { if (serverTs != null) lastServerStampRef.current = Math.max(lastServerStampRef.current, serverTs); }) // [C3/RC-6]
      .catch(() => { lastPushedRef.current = prevPushed; lastPushedFullRef.current = prevFull; });
    try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...stateRef.current, _savedAt: Date.now() })); } catch {}
  }, [userId]);

  // [P9] Al volver a la pestaña/app → catch-up con el estado remoto; al ocultarla → flush de pendientes.
  useVisibilityRefetch(() => catchUpRef.current(), flushPending);

  const catchUp = useCallback(() => catchUpRef.current(), []);

  return (
    <SantiagoContext.Provider value={{ state, dispatch, flushPending, canalSano, catchUp }}>
      {children}
    </SantiagoContext.Provider>
  );
}

export function useSantiago() {
  const ctx = useContext(SantiagoContext);
  if (!ctx) throw new Error('useSantiago must be used within SantiagoProvider');
  return ctx;
}
