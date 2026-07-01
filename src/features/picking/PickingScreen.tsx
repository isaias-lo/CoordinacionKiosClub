'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useApp } from '@/context/AppContext';
import { Printer, Bell, AlertTriangle, RefreshCw, Package } from 'lucide-react';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi'; // deprecated — config now server-side

import { refreshCalendario, subscribeToCalendarChanges } from '@/features/despacho/utils/useCalendario';
import { LabelConfig, DEFAULT_LABEL_CONFIG, BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { supabase } from '@/lib/supabase';
import { fetchNotificacionesPendientes, subscribeToNotificaciones } from '@/lib/calendarioArmadoSync';

// ─── Local modules ────────────────────────────────────────────────────────────
import type {
  PickingOperation, PickerGroup, TodayStore, OdooConfig,
  PickingSession, PalletSlot, PrintRecord, SessionStateRow,
  SupervisorPrint, PickerNameChange, SupervisorPresence, PickerType, SectionFilter,
} from './picking-types';
import {
  SAVED_NAMES_KEY, SESSION_KEY, SECTION_FILTER_KEY, COLS_PER_ROW_KEY,
  LABEL_CONFIG_KEY, CANONICAL_NAMES_KEY, AUTO_REFRESH_MS, CANONICAL_PICKER_KEYS,
} from './picking-types';
import {
  todayISO, getStoreName, parseOrigin, isAbastecimientoOp, resolveStoreCode,
  categoriesToContenido, buildCanonicalId, sanitizeForBarcode,
} from './picking-utils';
import type { PickingEvento } from './picking-utils';
import { StatsTab }           from './components/StatsTab';
import { HistorialTab }       from './components/HistorialTab';
import { ActivityTab } from './components/ActivityTab';
import { ConfigTab }          from './components/ConfigTab';
import CalendarioColumnas     from '@/features/control-interno/CalendarioColumnas';
import { PickerGroupCard }    from './components/PickerGroupCard';
import { StoreListPanel }     from './components/StoreListPanel';
import { AgregarAdelantoDialog } from './components/AgregarAdelantoDialog';
import { enqueuePickingItem, flushPickingQueue } from './picking-offline-queue';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import {
  getTiendasAdelantoHoy, deleteTiendaAdelanto, todayISO as adelantoTodayISO,
  type TiendaAdelanto,
} from '@/features/despacho/shared/tiendasAdelanto';


// ─── Session helpers ──────────────────────────────────────────────────────────

function loadSession(): Partial<PickingSession> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as PickingSession;
    if (s.date !== todayISO()) return {};
    return s;
  } catch { return {}; }
}

function saveSession(data: PickingSession): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PickingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showToast } = useApp();

  const odooConfig: OdooConfig = getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' };
  const hasOdoo = !!odooConfig.url;

  // Auth token for authenticated picking API calls
  const tokenRef = useRef<string>('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { tokenRef.current = data.session?.access_token ?? ''; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      tokenRef.current = s?.access_token ?? '';
    });
    return () => subscription.unsubscribe();
  }, []);

  const pickingFetch = useCallback((url: string, init: RequestInit = {}): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${tokenRef.current}`,
      },
    }), []);

  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    fetchNotificacionesPendientes().then(n => setNotifCount(n.length));
    return subscribeToNotificaciones(n => setNotifCount(n.length));
  }, []);

  const [panelView, setPanelView] = useState<'stores' | 'planilla'>('stores');
  const [rightTab, setRightTab]   = useState<'monitoreo' | 'actividad' | 'estadisticas' | 'historial' | 'configuracion' | 'calendario'>('monitoreo');

  // Resizable left panel
  const { width: leftWidth, isDesktop, handleMouseDown: handlePanelMouseDown, handleTouchStart: handlePanelTouchStart } =
    useResizablePanel({ storageKey: 'picking_left_panel_width', defaultWidth: 288, min: 180, max: 480 });

  // Online/offline detection + flush de cola offline al reconectar
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Flush cualquier operación encolada mientras estaba offline
      void flushPickingQueue(pickingFetch, (count) => {
        showToast(`✓ ${count} acción${count !== 1 ? 'es' : ''} sincronizada${count !== 1 ? 's' : ''} al reconectar`, '#16A34A');
      });
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pickingFetch, showToast]);

  // Restaurar sesión al montar
  const session = useMemo(() => loadSession(), []);

  const [selectedCods, setSelectedCods] = useState<string[]>([]);
  const [opsMap, setOpsMap]             = useState<Record<string, PickingOperation[]>>(session.opsMap ?? {});
  const [loadingCods, setLoadingCods]   = useState<string[]>([]);
  const [lastRefresh, setLastRefresh]   = useState<Date | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [calStores, setCalStores]         = useState<TodayStore[]>([]);
  const [adelantos, setAdelantos]         = useState<TiendaAdelanto[]>([]);
  const [adelantoDialogOpen, setAdelantoDialogOpen] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  // Nombres de tiendas desde Supabase — sobreescriben el hardcoded TIENDAS_INICIAL
  const [tiendaOverrides, setTiendaOverrides] = useState<Record<string, string>>({});

  const [sectionFilter, setSectionFilter] = useLocalStorage<SectionFilter>(SECTION_FILTER_KEY, 'all');
  const [colsPerRow, setColsPerRow]       = useLocalStorage<number>(COLS_PER_ROW_KEY, 3);


  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    const fromSession = session.pickerDisplayNames;
    if (fromSession && Object.keys(fromSession).length > 0) return fromSession;
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(SAVED_NAMES_KEY) ?? '{}') as Record<string, string>; }
    catch { return {}; }
  });
  const [palletSlots, setPalletSlots] = useState<PalletSlot[]>([]);
  const palletSlotsRef = useRef<PalletSlot[]>([]);
  palletSlotsRef.current = palletSlots;
  const pendingDeleteIds = useRef<Set<number>>(new Set());
  // Decreasing counter for optimistic (temp) slot IDs — negative to never collide with real DB ids
  const tempIdRef = useRef(-1);

  // Derived: count per state_key
  const pickerPallets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of palletSlots) map[s.state_key] = (map[s.state_key] ?? 0) + 1;
    return map;
  }, [palletSlots]);

  // Derived: count per (state_key, tipo) — feeds the 3 independent counters
  const palletsByTipoAndStateKey = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const s of palletSlots) {
      const t = s.tipo || 'P';
      if (!result[s.state_key]) result[s.state_key] = {};
      result[s.state_key][t] = (result[s.state_key][t] ?? 0) + 1;
    }
    return result;
  }, [palletSlots]);

  // Derived: pallet_num for each slot = its rank (1-based) within (store_cod, tipo) independently.
  // P slots count P-1, P-2...; C slots count C-1, C-2...; B slots count B-1, B-2...
  const palletNumsBySlotId = useMemo(() => {
    const result: Record<number, number> = {};
    const byStoreTipo: Record<string, PalletSlot[]> = {};
    for (const s of palletSlots) {
      const key = `${s.store_cod}::${s.tipo || 'P'}`;
      if (!byStoreTipo[key]) byStoreTipo[key] = [];
      byStoreTipo[key].push(s);
    }
    for (const slots of Object.values(byStoreTipo)) {
      slots.forEach((s, idx) => { result[s.id] = idx + 1; });
    }
    return result;
  }, [palletSlots]);

  // Derived: sorted list of pallet numbers per state_key
  const assignedNumsByStateKey = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const s of palletSlots) {
      const num = palletNumsBySlotId[s.id];
      if (num !== undefined) {
        if (!result[s.state_key]) result[s.state_key] = [];
        result[s.state_key].push(num);
      }
    }
    for (const key of Object.keys(result)) result[key].sort((a, b) => a - b);
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  // Slots per state_key sorted by pallet number (same order as assignedNumsByStateKey)
  const slotsByStateKey = useMemo(() => {
    const result: Record<string, PalletSlot[]> = {};
    for (const s of palletSlots) {
      if (!result[s.state_key]) result[s.state_key] = [];
      result[s.state_key].push(s);
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => (palletNumsBySlotId[a.id] ?? 0) - (palletNumsBySlotId[b.id] ?? 0));
    }
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  const [errorCods, setErrorCods]         = useState<string[]>([]);

  const [labelConfig, setLabelConfig]     = useLocalStorage<LabelConfig>(LABEL_CONFIG_KEY, DEFAULT_LABEL_CONFIG);
  const [canonicalNames, setCanonicalNames] = useLocalStorage<Record<string, string>>(CANONICAL_NAMES_KEY, {});

  // ── Shared session state: picker names + types visible across all supervisor desktops ──
  const [sessionStateRows, setSessionStateRows] = useState<SessionStateRow[]>([]);
  const dirtyStateKeys  = useRef<Set<string>>(new Set());
  const upsertTimers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadSessionState = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_session_state')
        .select('state_key, picker_label, tipo')
        .eq('date', todayISO());
      if (data) setSessionStateRows(data as SessionStateRow[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadSessionState(); }, [loadSessionState]);
  // Debounce 1 s: upsertSessionState fires on every keystroke (500 ms debounced writes),
  // so the subscriber would reload on every character typed by any supervisor.
  useRealtimeRefresh('picking_session_state', loadSessionState, true, 15000, 1000);

  // Merge server state into local — skip keys actively being edited by this client
  // Only names are synced cross-client; tipos are managed locally per client (date-scoped localStorage)
  useEffect(() => {
    if (!sessionStateRows.length) return;
    setPickerDisplayNames(prev => {
      const next = { ...prev };
      for (const r of sessionStateRows)
        if (!dirtyStateKeys.current.has(r.state_key) && r.picker_label) next[r.state_key] = r.picker_label;
      return next;
    });
  }, [sessionStateRows]);

  // Debounced upsert — waits 500ms of inactivity before writing to server
  const upsertSessionState = useCallback((stateKey: string, pickerLabel: string, tipo: string) => {
    dirtyStateKeys.current.add(stateKey);
    clearTimeout(upsertTimers.current[stateKey]);
    upsertTimers.current[stateKey] = setTimeout(() => {
      void pickingFetch('/api/picking-session-state', {
        method: 'POST',
        body: JSON.stringify({ state_key: stateKey, date: todayISO(), picker_label: pickerLabel, tipo }),
      }).then(() => { dirtyStateKeys.current.delete(stateKey); });
    }, 500);
  }, []);

  const [printOnlyStore, setPrintOnlyStore]       = useState<string | null>(null);
  const [printOnlyStateKey, setPrintOnlyStateKey] = useState<string | null>(null);
  const [doPrint, setDoPrint]                     = useState(false);
  const [selectionPrint, setSelectionPrint]       = useState<{ stateKey: string; palletNums: Set<number> } | null>(null);
  const [mounted, setMounted]                     = useState(false);

  // Cross-desktop print visibility — single source of truth for both printedKeys and HistorialTab
  const [printRecords, setPrintRecords] = useState<PrintRecord[]>([]);
  const printedKeys       = useMemo(() => new Set(printRecords.map(r => r.state_key)), [printRecords]);
  // Map state_key → last PrintRecord — para mostrar advertencia "ya impreso por X" en cada card
  const printRecordByKey  = useMemo(() => new Map(printRecords.map(r => [r.state_key, r])), [printRecords]);
  // Ref que guarda la promesa de recordPrints en vuelo — el efecto doPrint la espera antes de llamar window.print()
  const pendingPrintRef   = useRef<Promise<number> | null>(null);

  // ── Supervisor presence — quién más está activo y qué está imprimiendo ──────
  const [otherSupervisors, setOtherSupervisors] = useState<Record<string, SupervisorPresence>>({});
  const presenceRef  = useRef<SupervisorPresence>({ name: '', userId: '', recentPrints: [], lastActive: '' });
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    const myId  = profile.id;
    const myName = profile.full_name ?? 'Supervisor';
    presenceRef.current = { name: myName, userId: myId, recentPrints: [], lastActive: new Date().toISOString() };

    const ch = supabase.channel(`picking-supervisors-${todayISO()}`, {
      config: { presence: { key: myId } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<SupervisorPresence>();
      const others: Record<string, SupervisorPresence> = {};
      for (const [uid, metas] of Object.entries(state)) {
        if (uid === myId) continue;
        const meta = (metas as SupervisorPresence[])[0];
        if (meta) others[uid] = meta;
      }
      setOtherSupervisors(others);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track(presenceRef.current);
      }
    });

    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); channelRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const loadPrintRecords = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_prints')
        .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name, print_count, batch')
        .eq('date', todayISO())
        .order('printed_at', { ascending: true });
      if (data) setPrintRecords(data as PrintRecord[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPrintRecords(); }, [loadPrintRecords]);
  useEffect(() => { setMounted(true); }, []);

  // ── Name change history ────────────────────────────────────────────────────
  const [nameChanges, setNameChanges] = useState<PickerNameChange[]>([]);

  const loadNameChanges = useCallback(async () => {
    try {
      const date = todayISO();
      const { data } = await supabase
        .from('picker_name_changes')
        .select('id, picker_key, old_name, new_name, changed_by_name, changed_at')
        .gte('changed_at', `${date}T00:00:00.000Z`)
        .lte('changed_at', `${date}T23:59:59.999Z`)
        .order('changed_at', { ascending: false });
      if (data) setNameChanges(data as PickerNameChange[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadNameChanges(); }, [loadNameChanges]);

  // ── Auditoría de altas/bajas de pallets (crear / eliminar) ──────────────────
  const [pickingEventos, setPickingEventos] = useState<PickingEvento[]>([]);

  const loadEventos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_eventos')
        .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
        .eq('date', todayISO())
        .order('created_at', { ascending: true });
      if (data) setPickingEventos(data as PickingEvento[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadEventos(); }, [loadEventos]);

  // Single channel for prints, name changes and pallet audit — reduces WebSocket channels.
  // A change on any is infrequent enough that reloading all callbacks is acceptable.
  useRealtimeRefresh('picking_prints,picker_name_changes,picking_eventos', useCallback(() => {
    void loadPrintRecords();
    void loadNameChanges();
    void loadEventos();
  }, [loadPrintRecords, loadNameChanges, loadEventos]));

  // ── Pallet slots: DB-backed, real-time ──────────────────────────────────────
  // Uses the browser Supabase client directly to avoid the Next.js API round-trip on
  // every realtime-triggered reload. RLS on picking_pallets allows all authenticated users.
  const loadPalletSlots = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id, store_cod, state_key, picker_label, tipo, contenido, refs, created_at, seq, canonical_id')
        .eq('date', todayISO())
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (data) {
        // Excluir IDs creados desde Bodega (origen "<cod>__bodega") — solo viven en Bodega/Enrutador/Seguimiento
        const slots = (data as PalletSlot[]).filter(s => !String(s.state_key ?? '').endsWith('__bodega') && s.picker_label !== 'Bodega');
        setPalletSlots(slots);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPalletSlots(); }, [loadPalletSlots]);
  // Incremental realtime: apply INSERT/UPDATE/DELETE deltas directly to local state
  // instead of doing a full DB reload on every event. Eliminates the query storm where
  // N supervisors each reload the full table on every change.
  // onReconnect = loadPalletSlots ensures a full reload if the WebSocket was disconnected
  // (catching any events missed during the gap).
  useEffect(() => {
    const unsub = subscribeToPickingPallets(
      ({ eventType, new: newRow, old: oldRow }) => {
        // Extract only the PalletSlot fields we care about from the full payload row
        const toSlot = (r: Record<string, unknown>): PalletSlot => ({
          id:           r.id as number,
          store_cod:    r.store_cod as string,
          state_key:    r.state_key as string,
          picker_label: (r.picker_label as string) ?? '',
          tipo:         (r.tipo as string) ?? 'P',
          contenido:    (r.contenido as string) ?? 'hogar',
          refs:         (r.refs as string) ?? '',
          created_at:   r.created_at as string,
        });

        if (eventType === 'INSERT') {
          const isActive = (newRow as { is_active?: boolean }).is_active;
          if (isActive !== false) {
            const slot = toSlot(newRow as Record<string, unknown>);
            setPalletSlots(prev =>
              prev.some(s => s.id === slot.id) ? prev : [...prev, slot]
            );
          }
        } else if (eventType === 'UPDATE') {
          const row = newRow as Record<string, unknown> & { is_active?: boolean };
          const id  = row.id as number;
          if (!row.is_active) {
            // Slot deactivated (e.g. combine operation) — remove from visible state
            setPalletSlots(prev => prev.filter(s => s.id !== id));
          } else {
            setPalletSlots(prev =>
              prev.map(s => s.id !== id ? s : toSlot(row))
            );
          }
        } else if (eventType === 'DELETE') {
          const id = (oldRow as { id?: number }).id;
          if (id !== undefined) setPalletSlots(prev => prev.filter(s => s.id !== id));
        }
      },
      loadPalletSlots, // full reload on WebSocket reconnect
    );
    return unsub;
  }, [loadPalletSlots]);

  const addPalletSlot = useCallback(async (stateKey: string, storeCod: string, pickerLabel: string, tipo: string, contenido = 'hogar', refs = '') => {
    const date = todayISO();
    // Idempotencia: id de operación único por click. Si el POST se reintenta (red,
    // doble-click, replay de cola offline), el server deduplica por client_op_id.
    const clientOpId = crypto.randomUUID();
    const actorName = presenceRef.current.name;
    // Optimistic update: add a temp slot immediately so the counter in PickerGroupCard
    // reflects the in-flight add. This prevents the rapid-click race condition where
    // clicking + multiple times before the POST returns creates duplicate slots.
    const tempId = tempIdRef.current--;
    const tempSlot: PalletSlot = {
      id: tempId, store_cod: storeCod, state_key: stateKey,
      picker_label: pickerLabel, tipo, contenido, refs,
      created_at: new Date().toISOString(),
    };
    setPalletSlots(prev => [...prev, tempSlot]);
    try {
      const res = await pickingFetch('/api/picking-pallets', {
        method: 'POST',
        body: JSON.stringify({ date, store_cod: storeCod, state_key: stateKey, picker_label: pickerLabel, tipo, contenido, refs, actor_name: actorName, client_op_id: clientOpId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.error('[picking] addPalletSlot error', res.status, err.error ?? '');
        setPalletSlots(prev => prev.filter(s => s.id !== tempId));
        showToast('⚠ No se pudo agregar el pallet — se reintentará al reconectar', '#D97706');
        enqueuePickingItem({ op: 'add', stateKey, storeCod, pickerLabel, tipo, contenido, refs, date, clientOpId, actorName });
        return;
      }
      const json = await res.json() as { data?: PalletSlot };
      if (json.data) {
        // 4-case dedup: the incremental INSERT handler may have already added the real slot
        // (realtime via WebSocket arrives faster than the HTTP response).
        // Possible states: (A) only temp, (B) temp + real, (C) only real, (D) neither.
        setPalletSlots(prev => {
          const hasTemp = prev.some(s => s.id === tempId);
          const hasReal = prev.some(s => s.id === json.data!.id);
          if (hasTemp && hasReal) return prev.filter(s => s.id !== tempId); // (B) drop temp
          if (hasTemp)            return prev.map(s => s.id === tempId ? json.data! : s); // (A) swap
          if (!hasReal)           return [...prev, json.data!]; // (D) add real
          return prev;           // (C) real already there, nothing to do
        });
        pickingFetch('/api/despacho-picking', {
          method: 'POST',
          body: JSON.stringify({ slot_id: json.data.id, store_cod: storeCod, tipo, contenido, date }),
        }).catch(err => console.error('[picking] despacho-picking error', err));
        // Recargar mis propios eventos: así el usuario ve su propia alta en Actividad al
        // instante (la presencia solo se transmite a otros supervisores).
        void loadEventos();
      } else {
        setPalletSlots(prev => prev.filter(s => s.id !== tempId));
      }
    } catch (e) {
      console.error('[picking] addPalletSlot network error', e);
      setPalletSlots(prev => prev.filter(s => s.id !== tempId));
      showToast('⚠ Sin conexión — el pallet se agregará al reconectar', '#D97706');
      enqueuePickingItem({ op: 'add', stateKey, storeCod, pickerLabel, tipo, contenido, refs, date, clientOpId, actorName });
    }
  }, [pickingFetch, showToast, loadEventos]);

  const removePalletSlot = useCallback(async (stateKey: string, tipo: string) => {
    if (!isOnline) { console.warn('[picking] offline — cannot remove pallet slot'); return; }
    // Read from ref (avoids stale closure) and skip pending deletes; filters by tipo for 3-counter accuracy
    const slot = palletSlotsRef.current
      .filter(s => s.state_key === stateKey && (s.tipo || 'P') === tipo && !pendingDeleteIds.current.has(s.id))
      .at(-1);
    if (!slot) return;
    pendingDeleteIds.current.add(slot.id);
    setPalletSlots(prev => prev.filter(s => s.id !== slot.id));
    try {
      const res = await pickingFetch('/api/picking-pallets', {
        method: 'DELETE',
        body: JSON.stringify({ id: slot.id, actor_name: presenceRef.current.name }),
      });
      if (!res.ok) setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
      else void loadEventos(); // ver mi propia baja en Actividad al instante
    } catch {
      setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
    } finally {
      pendingDeleteIds.current.delete(slot.id);
    }
  }, [loadEventos]);

  // sectionFilter y labelConfig persistidos automáticamente por useLocalStorage

  // ── Canonical names: shared across all supervisor desktops ────────────────────
  const loadCanonicalNames = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picker_canonical_names')
        .select('key, display_name')
        .order('key');
      if (!data?.length) return;
      const next: Record<string, string> = {};
      for (const r of data) if (r.display_name) next[r.key] = r.display_name;
      setCanonicalNames(next);
    } catch { /* silent */ }
  }, []);

  // Cargar canonical names una vez que el token esté disponible (profile cargado)
  useEffect(() => { if (profile) void loadCanonicalNames(); }, [loadCanonicalNames, profile]);
  useRealtimeRefresh('picker_canonical_names', loadCanonicalNames);

  // Cargar nombres de tiendas desde Supabase — mismo patrón que CalendarioColumnas.
  // Sobreescribe TIENDAS_INICIAL con los datos editados en /admin/tiendas.
  const loadTiendaOverrides = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('tiendas')
        .select('codigo, nombre');
      if (!data) return;
      const overrides: Record<string, string> = {};
      for (const t of data) if (t.codigo && t.nombre) overrides[t.codigo] = t.nombre;
      setTiendaOverrides(overrides);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { void loadTiendaOverrides(); }, [loadTiendaOverrides]);
  // tiendas is a static lookup table — no realtime subscription needed
  // (los nombres con override y la fusión con adelantos se resuelven en el memo
  //  `todayStores` más abajo)

  const handleCanonicalNamesChange = useCallback((names: Record<string, string>, changedKey?: string, changedVal?: string, byName?: string) => {
    setCanonicalNames(names); // persisted automatically by useLocalStorage
    if (changedKey !== undefined) {
      void pickingFetch('/api/picker-canonical-names', {
        method: 'POST',
        body: JSON.stringify({ key: changedKey, display_name: changedVal ?? '', updated_by_name: byName ?? '' }),
      });
    }
  }, []);

  const handleColsPerRowChange = useCallback((n: number) => {
    setColsPerRow(n); // persisted automatically by useLocalStorage
  }, [setColsPerRow]);

  // Case-insensitive lookup: Odoo may return "pickers 3" while canonical key is "Pickers 3"
  const getCanonicalName = useCallback((key: string): string => {
    if (canonicalNames[key]) return canonicalNames[key];
    const lower = key.toLowerCase();
    const match = CANONICAL_PICKER_KEYS.find(k => k.toLowerCase() === lower);
    return match ? (canonicalNames[match] ?? '') : '';
  }, [canonicalNames]);

  // Persistir nombres en localStorage (cross-session)
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, JSON.stringify(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Persistir sesión en sessionStorage cuando cambia el estado relevante
  useEffect(() => {
    saveSession({ date: todayISO(), selectedCods, opsMap, pickerDisplayNames });
  }, [selectedCods, opsMap, pickerDisplayNames]);

  // Disparar impresión después del re-render:
  // 1) espera a que recordPrints termine (registro en Supabase)
  // 2) doble rAF para que JsBarcode (dynamic import) haya pintado los SVG
  useEffect(() => {
    if (!doPrint) return;
    setDoPrint(false);
    void (async () => {
      if (pendingPrintRef.current) {
        const failures = await pendingPrintRef.current;
        pendingPrintRef.current = null;
        if (failures > 0) showToast(`⚠ ${failures} etiqueta(s) no se pudieron registrar`, '#D97706');
      }
      const handleAfterPrint = () => {
        setPrintOnlyStore(null);
        setPrintOnlyStateKey(null);
        setSelectionPrint(null);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      // Double rAF: primer frame aplica el render de React, segundo frame
      // garantiza que JsBarcode (dynamic import async) terminó de dibujar los SVG
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    })();
  }, [doPrint, showToast]);

  // Cargar tiendas del calendario (bust caché para evitar datos viejos del merge)
  // Nombre de tienda: Supabase override primero, luego hardcoded
  const nameFor = useCallback((cod: string): string =>
    tiendaOverrides[cod] || getStoreName(cod), [tiendaOverrides]);

  const applyCalendar = useCallback((cal: Record<string, { rm: string[]; costa: string[]; fal: string[] }>) => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const today = DAY_CODES[new Date().getDay()];
    const day = cal[today];
    if (!day) return;
    setCalStores([
      ...day.fal.map(cod   => ({ cod, name: nameFor(cod), sources: ['regiones'] as ('rm' | 'regiones')[] })),
      ...day.costa.map(cod => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
      ...day.rm.map(cod    => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
    ]);
  }, [nameFor]);

  // ── Tiendas de adelanto (extra del día, fuera del calendario central) ──────
  const loadAdelantos = useCallback(async () => {
    setAdelantos(await getTiendasAdelantoHoy());
  }, []);
  useEffect(() => { void loadAdelantos(); }, [loadAdelantos]);
  useRealtimeRefresh('tiendas_adelanto', loadAdelantos, true, 30000, 1000);

  const handleDeleteAdelanto = useCallback(async (id: number) => {
    const ok = await deleteTiendaAdelanto(id);
    if (ok) setAdelantos(prev => prev.filter(a => a.id !== id));
    else showToast('No se pudo eliminar el adelanto');
  }, [showToast]);

  // todayStores = calendario (con overrides de nombre) + tiendas de adelanto de hoy.
  const todayStores = useMemo<TodayStore[]>(() => {
    const base = calStores.map(s => ({ ...s, name: tiendaOverrides[s.cod] || getStoreName(s.cod) }));
    const present = new Set(base.map(s => s.cod));
    const extra: TodayStore[] = adelantos.map(a => ({
      cod:      a.store_cod,
      name:     tiendaOverrides[a.store_cod] || getStoreName(a.store_cod),
      sources:  (a.zona === 'fal' ? ['regiones'] : ['rm']) as ('rm' | 'regiones')[],
      adelanto: { id: a.id, zona: a.zona, fecha_despacho: a.fecha_despacho },
    }));
    // Anota como adelanto las que ya estuvieran en el calendario; agrega las nuevas.
    for (const e of extra) {
      if (present.has(e.cod)) {
        const i = base.findIndex(s => s.cod === e.cod);
        if (i >= 0) base[i] = { ...base[i], adelanto: e.adelanto };
      } else {
        base.push(e);
      }
    }
    return base;
  }, [calStores, adelantos, tiendaOverrides]);

  // Lookup store_cod → adelanto (para marcar la etiqueta de esa tienda).
  const adelantoByCod = useMemo(() => {
    const m: Record<string, { fecha_despacho: string | null }> = {};
    for (const a of adelantos) m[a.store_cod] = { fecha_despacho: a.fecha_despacho };
    return m;
  }, [adelantos]);

  // Resizable divider logic is handled by useResizablePanel hook above.

  useEffect(() => {
    setStoresLoading(true);
    // refreshCalendario busts both in-memory and localStorage cache → always gets live Sheets data
    refreshCalendario()
      .then(cal => { applyCalendar(cal); setStoresLoading(false); })
      .catch(() => setStoresLoading(false));
    // Re-apply when admin updates calendar from another tab
    return subscribeToCalendarChanges(applyCalendar);
  }, [applyCalendar]);

  // Si hay tiendas seleccionadas al restaurar sesión, mostrar planilla y siempre recargar ops frescos
  useEffect(() => {
    if (selectedCods.length > 0) {
      setPanelView('planilla');
      selectedCods.forEach(cod => void fetchOpsForStore(cod));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allGroups = useMemo((): PickerGroup[] => {
    const result: PickerGroup[] = [];
    for (const cod of selectedCods) {
      const ops = opsMap[cod] ?? [];
      // Group by normalized (lowercase/trim) name → same picker regardless of casing entered on each desktop
      const map: Record<string, { displayKey: string; ops: PickingOperation[] }> = {};
      for (const op of ops) {
        const raw        = op.responsible || 'Sin asignar';
        const normalized = raw.toLowerCase().trim();
        if (!map[normalized]) map[normalized] = { displayKey: raw, ops: [] };
        map[normalized].ops.push(op);
      }
      for (const [normKey, { displayKey, ops: gOps }] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
        result.push({ key: displayKey, storeCod: cod, stateKey: `${cod}__${normKey}`, operations: gOps });
      }
    }
    return result;
  }, [selectedCods, opsMap]);

  const fetchOpsForStore = useCallback(async (cod: string) => {
    if (!hasOdoo) return;
    setLoadingCods(prev => [...prev, cod]);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_today_operations', config: odooConfig, query: cod }),
      });
      const data = (await res.json()) as {
        pickings?: Array<{
          id: number; name: string; origin: string; partner: string;
          fromLocation: string; toLocation: string; state: string;
          scheduledDate: string; dateDone: string | null; pickingType: string;
          responsible: string; responsibleId: number | null; lineCount: number;
          batch?: string;
        }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const parsed: PickingOperation[] = (data.pickings ?? [])
        .filter(p => isAbastecimientoOp(p.origin) && !p.origin.toUpperCase().startsWith('AUDITORIA'))
        .map(p => {
          const { categories, originDate } = parseOrigin(p.origin);
          // Identifica la tienda por destino (columna "A") con respaldo al origin/partner,
          // para ser robusto a typos manuales en el Documento Origen.
          return { ...p, categories, storeCodeFromOrigin: resolveStoreCode(p), originDate };
        });
      setOpsMap(prev => ({ ...prev, [cod]: parsed }));
      setErrorCods(prev => prev.filter(c => c !== cod));
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[picking]', e);
      setErrorCods(prev => prev.includes(cod) ? prev : [...prev, cod]);
    } finally {
      setLoadingCods(prev => prev.filter(c => c !== cod));
    }
  }, [hasOdoo, odooConfig]);

  // Auto-refresh silencioso cada 3 minutos para tiendas seleccionadas
  useEffect(() => {
    if (selectedCods.length === 0) return;
    const id = setInterval(() => {
      selectedCods.forEach(cod => void fetchOpsForStore(cod));
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [selectedCods, fetchOpsForStore]);

  // NOTA: el progreso de Odoo para el semáforo de Bodega lo calcula ahora UNA sola fuente
  // —el refresco batch del servidor en GET /api/picking-store-progress, que atribuye los
  // pickings por tienda con `resolveStoreCode` sobre TODAS las tiendas—. Antes PickingScreen
  // también posteaba un conteo (total = ops cargadas por el picker), calculado con un criterio
  // distinto; los dos escritores se pisaban con totales diferentes y el semáforo saltaba entre
  // verde y naranja al cambiar de pestaña. Con fuente única el estado es estable (refresco ≤60s).

  const handleToggleStore = useCallback(async (cod: string) => {
    const isSelected = selectedCods.includes(cod);
    if (isSelected) {
      setSelectedCods(prev => prev.filter(c => c !== cod));
    } else {
      setSelectedCods(prev => [...prev, cod]);
      if (!opsMap[cod]) await fetchOpsForStore(cod);
    }
    setPanelView('planilla');
  }, [selectedCods, opsMap, fetchOpsForStore]);

  const refreshOp = useCallback(async (op: PickingOperation, storeCod: string) => {
    if (!hasOdoo) return;
    setRefreshingId(op.id);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_check_state', config: odooConfig, query: op.name }),
      });
      const data = (await res.json()) as { state?: string; dateDone?: string | null };
      if (res.ok && data.state) {
        setOpsMap(prev => ({
          ...prev,
          [storeCod]: (prev[storeCod] ?? []).map(o =>
            o.id === op.id ? { ...o, state: data.state!, dateDone: data.dateDone ?? o.dateDone } : o
          ),
        }));
      }
    } catch { /* silent */ }
    setRefreshingId(null);
  }, [hasOdoo, odooConfig]);

  // Grupos cuyo movimiento es de OTRO DÍA (arrastre/error de Odoo). Regla de negocio:
  // el picking siempre se cierra el mismo día → un movimiento con fecha de origen válida y
  // distinta de hoy nunca es legítimo. Se ocultan del flujo (no se trabaja contra ellos).
  // Conservador: si la fecha está vacía/ilegible se trata como de hoy (beneficio de la duda).
  const otroDiaGroupKeys = useMemo(() => {
    const d = new Date();
    const todayDMY = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const validDate = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);
    const keys = new Set<string>();
    for (const g of allGroups) {
      if (g.operations.length > 0 && g.operations.every(o => validDate(o.originDate) && o.originDate !== todayDMY))
        keys.add(g.stateKey);
    }
    return keys;
  }, [allGroups]);

  const otroDiaCount = useMemo(
    () => allGroups.filter(g => otroDiaGroupKeys.has(g.stateKey)).length,
    [allGroups, otroDiaGroupKeys],
  );

  const filteredGroups = useMemo(() => {
    return allGroups.filter(g => {
      if (otroDiaGroupKeys.has(g.stateKey)) return false;          // ocultar movimientos de otro día
      if (sectionFilter === 'all') return true;
      const cats = new Set(g.operations.flatMap(o => o.categories));
      if (sectionFilter === 'aseo-comida') return cats.has('Aseo') || cats.has('Comida');
      if (sectionFilter === 'chocolates')  return cats.has('Chocolates');
      return cats.has('Hogar');
    });
  }, [allGroups, sectionFilter, otroDiaGroupKeys]);

  // Grupos de TODAS las secciones por tienda — para calcular offsets globales
  const allGroupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of allGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [allGroups]);

  const groupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of filteredGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [filteredGroups]);

  // Guarda seq y canonical_id en picking_pallets al momento de imprimir
  // Solo actualiza slots que aún no tienen canonical_id (idempotente en re-impresión)
  const assignCanonicalIds = useCallback(async (groups: PickerGroup[]) => {
    const date = todayISO();
    const slots: { id: number; seq: number; canonical_id: string }[] = [];
    for (const group of groups) {
      const groupSlots = slotsByStateKey[group.stateKey] ?? [];
      for (const slot of groupSlots) {
        if (!slot.id || slot.id < 0) continue;  // saltar slots temporales (aún no persistidos)
        const pNum = palletNumsBySlotId[slot.id];
        if (pNum === undefined) continue;
        const tipo = (slot.tipo as PickerType) ?? 'P';
        slots.push({
          id:           slot.id,
          seq:          pNum,
          canonical_id: buildCanonicalId(tipo, pNum, group.storeCod, date),
        });
      }
    }
    if (!slots.length) return;
    await pickingFetch('/api/picking-pallets', {
      method: 'PATCH',
      body:   JSON.stringify({ slots }),
    }).catch(() => {});
  }, [slotsByStateKey, palletNumsBySlotId, pickingFetch]);

  const recordPrints = useCallback(async (groups: PickerGroup[]): Promise<number> => {
    const date = todayISO();
    const candidates = groups.filter(group => (pickerPallets[group.stateKey] ?? 0) > 0);
    if (candidates.length === 0) return 0;

    const results = await Promise.allSettled(
      candidates.map(group => {
        const pallets     = pickerPallets[group.stateKey] ?? 0;
        const pickerLabel = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key;
        // Tipo dominante entre todos los slots del picker (evita perder grupos mixtos P+B)
        const slotTipos = (slotsByStateKey[group.stateKey] ?? []).map(s => s.tipo || 'P');
        const tipo = slotTipos.length === 0 ? 'P' :
          slotTipos.reduce((acc, t) =>
            slotTipos.filter(x => x === t).length > slotTipos.filter(x => x === acc).length ? t : acc
          , slotTipos[0]);
        // BATCH (Transferir Agrupación) de Odoo: primer batch no vacío entre las operaciones del picker
        const batch = group.operations.find(o => o.batch)?.batch ?? '';
        return pickingFetch('/api/picking-prints', {
          method: 'POST',
          body: JSON.stringify({ stateKey: group.stateKey, pickerLabel, pallets, tipo, date, printedByName: profile?.full_name ?? '', batch }),
        }).then(res => {
          if (!res.ok) throw new Error(`picking-prints ${res.status}`);
          return { storeCod: group.storeCod, pickerLabel, pallets, tipo, printedAt: new Date().toISOString() } satisfies SupervisorPrint;
        });
      })
    );

    const newPrints = results
      .filter((r): r is PromiseFulfilledResult<SupervisorPrint> => r.status === 'fulfilled')
      .map(r => r.value);
    const failures = results.filter(r => r.status === 'rejected').length;

    if (failures > 0) {
      console.error(`[picking] ${failures} registro(s) de impresión no guardados`);
      // Encolar prints fallidos para reintentar al reconectar
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const group     = candidates[i];
          const pallets   = pickerPallets[group.stateKey] ?? 0;
          const pickerLabel = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key;
          const slotTipos = (slotsByStateKey[group.stateKey] ?? []).map(s => s.tipo || 'P');
          const tipo = slotTipos.length === 0 ? 'P' :
            slotTipos.reduce((acc, t) =>
              slotTipos.filter(x => x === t).length > slotTipos.filter(x => x === acc).length ? t : acc
            , slotTipos[0]);
          const batch = group.operations.find(o => o.batch)?.batch ?? '';
          enqueuePickingItem({ op: 'print', stateKey: group.stateKey, pickerLabel, pallets, tipo, date, printedByName: profile?.full_name ?? '', batch });
        }
      });
    }

    if (newPrints.length > 0 && channelRef.current) {
      const updated: SupervisorPresence = {
        ...presenceRef.current,
        recentPrints: [...newPrints, ...presenceRef.current.recentPrints].slice(0, 8),
        lastActive:   new Date().toISOString(),
      };
      presenceRef.current = updated;
      void channelRef.current.track(updated);
    }

    // Recargar los registros propios: la presencia solo se transmite a OTROS supervisores,
    // así que sin esto el usuario actual no vería sus propias impresiones/reimpresiones en
    // Actividad (sí las vería un compañero que recarga). El reload lo hace determinista.
    void loadPrintRecords();

    return failures;
  }, [pickerPallets, pickerDisplayNames, getCanonicalName, pickingFetch, slotsByStateKey, isOnline, loadPrintRecords]);

  // Imprime y registra SOLO los labels de un picker específico.
  // Evita que un supervisor "reclame" los pickers de otro al hacer click en su propia card.
  const printGroupLabels = useCallback(async (group: PickerGroup) => {
    // Bloquear impresión si el grupo no tiene slots PERSISTIDOS (id real > 0).
    // Evita el Caso 1: registrar un print sin pallet real → queda en Actividad pero
    // sin slot en Monitoreo/Bodega y sin código.
    const persisted = (slotsByStateKey[group.stateKey] ?? []).filter(s => (s.id ?? 0) > 0).length;
    if (persisted === 0) {
      showToast('⚠ Agrega al menos un pallet (con conexión) antes de imprimir', '#D97706');
      return;
    }
    setSelectionPrint(null);
    setPrintOnlyStore(null);
    setPrintOnlyStateKey(group.stateKey);
    // 1) Asignar seq + canonical ANTES de registrar/imprimir → la etiqueta lleva código y queda en BD.
    await assignCanonicalIds([group]);
    // 2) Registrar la impresión y disparar el print del navegador.
    pendingPrintRef.current = recordPrints([group]);
    setDoPrint(true);
  }, [slotsByStateKey, showToast, recordPrints, assignCanonicalIds]);

  const printStoreLabels = useCallback((cod: string) => {
    setSelectionPrint(null);
    setPrintOnlyStateKey(null);
    setPrintOnlyStore(cod);
    const groups = groupedByStore[cod] ?? [];
    pendingPrintRef.current = recordPrints(groups);
    void assignCanonicalIds(groups);
    setDoPrint(true);
  }, [groupedByStore, recordPrints, assignCanonicalIds]);

  const printSelectedLabels = useCallback((stateKey: string, palletNums: Set<number>) => {
    setSelectionPrint({ stateKey, palletNums });
    setPrintOnlyStore(null);
    setDoPrint(true);
    // Asignar canonical_id para los slots seleccionados
    const allGroups = Object.values(groupedByStore).flat().filter(g => g.stateKey === stateKey);
    void assignCanonicalIds(allGroups);
  }, [groupedByStore, assignCanonicalIds]);

  const printAll = useCallback(() => {
    setPrintOnlyStore(null);
    setPrintOnlyStateKey(null);
    pendingPrintRef.current = Promise.all(
      selectedCods.map(cod => recordPrints(groupedByStore[cod] ?? []))
    ).then(counts => counts.reduce((s, n) => s + n, 0));
    for (const cod of selectedCods) void assignCanonicalIds(groupedByStore[cod] ?? []);
    setDoPrint(true);
  }, [selectedCods, groupedByStore, recordPrints, assignCanonicalIds]);

  const todayLabel     = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  // Datos de impresión — una etiqueta por slot, sección activa del supervisor
  const printableLabels = useMemo(() => {
    type LabelData = {
      value: string; palletNum: number; total: number;
      storeCod: string; pickerLabel: string; responsibleKey: string;
      allCategories: string[]; totalPickers: number; stateKey: string; tipo: string; slotId: number;
      canonicalId: string; footerExtra?: string;
    };
    const labels: LabelData[] = [];
    for (const cod of selectedCods) {
      const storeGroups    = groupedByStore[cod] ?? [];       // respects section filter
      const allStoreGroups = allGroupedByStore[cod] ?? [];    // for totalPickers count
      const storeSlots     = palletSlots.filter(s => s.store_cod === cod);
      if (storeSlots.length === 0 || storeGroups.length === 0) continue;
      // Pre-compute total per tipo for this store (P count, C count, B count independently)
      const totalByTipo: Record<string, number> = {};
      for (const s of storeSlots) totalByTipo[s.tipo || 'P'] = (totalByTipo[s.tipo || 'P'] ?? 0) + 1;

      const firstSlotTime: Record<string, number> = {};
      for (const s of storeSlots) {
        const t = new Date(s.created_at).getTime();
        if (firstSlotTime[s.state_key] === undefined || t < firstSlotTime[s.state_key])
          firstSlotTime[s.state_key] = t;
      }
      const sortedGroups = [...storeGroups].sort((a, b) =>
        (firstSlotTime[a.stateKey] ?? Infinity) - (firstSlotTime[b.stateKey] ?? Infinity)
      );

      for (const group of sortedGroups) {
        const groupSlots = storeSlots.filter(s => s.state_key === group.stateKey);
        if (!groupSlots.length) continue;
        const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
        const refs  = group.operations.map(o => o.name).join('+');
        const cats  = allCategories.join(',');
        // Prioridad: 1) nombre del supervisor en esta sesión, 2) canónico de Supabase, 3) label del slot (histórico), 4) clave Odoo
        const label = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || groupSlots[0]?.picker_label || group.key;
        for (const slot of groupSlots) {
          const pNum  = palletNumsBySlotId[slot.id];
          const tipo  = (slot.tipo as PickerType) ?? 'P';
          const total = totalByTipo[tipo] ?? 1;
          labels.push({
            value: `${group.storeCod};${sanitizeForBarcode(label)};${refs};${tipo}${pNum};${cats}`,
            palletNum: pNum,
            total,
            storeCod: group.storeCod,
            pickerLabel: label,
            responsibleKey: group.key,
            allCategories,
            totalPickers: allStoreGroups.length,
            stateKey: group.stateKey,
            tipo,
            slotId: slot.id,
            canonicalId: buildCanonicalId(tipo, pNum, group.storeCod, todayISO()),
            footerExtra: slot.refs || undefined,
          });
        }
      }
    }
    return labels;
  }, [selectedCods, groupedByStore, allGroupedByStore, palletSlots, palletNumsBySlotId, pickerDisplayNames, getCanonicalName]);

  const hasBarcodes = printableLabels.length > 0;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html:
      '@media print{' +
      '@page{size:landscape;margin:0}' +
      'html,body{width:100%;height:100%;margin:0;padding:0}' +
      // El portal renderiza #picking-print-root como hijo directo de body.
      // body>* oculta todo; el selector de ID tiene mayor especificidad y gana.
      'body>*{display:none!important}' +
      '#picking-print-root{display:block!important;width:100%;height:auto}' +
      '.picking-label{display:flex!important;flex-direction:column!important;' +
      'width:100vw!important;height:100vh!important;max-width:100vw!important;' +
      'border-radius:0!important;margin:0!important;border:none!important;' +
      'padding:8mm!important;box-sizing:border-box!important;' +
      'break-after:page;page-break-after:always;overflow:hidden}' +
      '.picking-label>div{flex:1!important;display:flex!important;flex-direction:column!important;' +
      'height:100%!important;min-height:0!important;padding:0!important}' +
      '.picking-label:last-child{break-after:avoid;page-break-after:avoid}}'
    }} />

    {/* Portal a document.body — escapa AppShell (overflow:hidden + transform:translateZ)
        y permite que break-after:page funcione con múltiples etiquetas */}
    {mounted && createPortal(
      <div id="picking-print-root" style={{ display: 'none' }}>
        {(selectionPrint
          ? printableLabels.filter(l => l.stateKey === selectionPrint.stateKey && selectionPrint.palletNums.has(l.palletNum))
          : printOnlyStateKey
            ? printableLabels.filter(l => l.stateKey === printOnlyStateKey)
            : printOnlyStore
              ? printableLabels.filter(l => l.storeCod === printOnlyStore)
              : printableLabels
        ).map((label, idx) => (
          <BarcodeCard key={idx} {...label} labelConfig={labelConfig} />
        ))}
      </div>,
      document.body
    )}

    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5F6FA]">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0 print:hidden"
        style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Solo navegación interna en mobile (planilla → lista de tiendas). El "Inicio"
            se quitó: el sidebar ya provee la navegación a casa. */}
        {panelView === 'planilla' && (
          <button className="lg:hidden border-none cursor-pointer text-white/60 hover:text-white text-[13px] font-medium px-2.5 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.07)' }}
            onClick={() => setPanelView('stores')}>
            ← Tiendas
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[20px] font-bold text-white leading-tight tracking-wide">
            Abastecimiento
            {selectedCods.length > 0 && (
              <span className="ml-2 text-[13px] font-normal text-white/40 tracking-normal">{selectedCods.join(' · ')}</span>
            )}
          </div>
          {!selectedCods.length && (
            <div className="text-[11px] text-white/35 truncate">{profile?.full_name ?? ''} · {todayLabel}</div>
          )}
        </div>

        {selectedCods.length > 0 && lastRefresh && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-white/30 shrink-0">
            <RefreshCw size={11} />
            {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

      </div>

      {/* ── Alerta cambios calendario ── */}
      {notifCount > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 print:hidden"
          style={{ background: 'rgba(255,149,0,0.10)', borderBottom: '1px solid rgba(255,149,0,0.25)' }}>
          <Bell size={14} className="text-amber-600 shrink-0" />
          <div className="flex-1 text-[12px] text-amber-700 font-medium">
            Control Interno realizó {notifCount} cambio{notifCount !== 1 ? 's' : ''} al calendario
          </div>
          <button
            onClick={() => router.push('/despacho/config-tiendas')}
            className="text-[12px] font-semibold px-3 py-1 rounded shrink-0 cursor-pointer border"
            style={{ borderColor: 'rgba(217,119,6,0.35)', color: '#92400E', background: 'transparent' }}>
            Revisar
          </button>
        </div>
      )}

      {/* ── Split body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL */}
        <div
          className={[
            'flex flex-col bg-white shrink-0 overflow-hidden',
            panelView === 'planilla' ? 'hidden lg:flex' : 'flex',
            isDesktop ? '' : 'w-full border-r border-border',
          ].join(' ')}
          style={isDesktop ? { width: leftWidth } : undefined}
        >
          <StoreListPanel
            selectedCods={selectedCods}
            loadingCods={loadingCods}
            errorCods={errorCods}
            opsMap={opsMap}
            todayStores={todayStores}
            storesLoading={storesLoading}
            onToggleStore={handleToggleStore}
            tiendaOverrides={tiendaOverrides}
            onOpenAdelanto={() => setAdelantoDialogOpen(true)}
            onDeleteAdelanto={handleDeleteAdelanto}
          />
        </div>

        {adelantoDialogOpen && (
          <AgregarAdelantoDialog
            date={adelantoTodayISO()}
            creadoPor={profile?.full_name ?? undefined}
            onClose={() => setAdelantoDialogOpen(false)}
            onAdded={loadAdelantos}
          />
        )}

        {/* RESIZE DIVIDER — desktop only */}
        {isDesktop && (
          <div
            className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
            style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
            onMouseDown={handlePanelMouseDown}
            onTouchStart={handlePanelTouchStart}
          >
            <div className="absolute inset-0 group-hover:bg-blue-500/10 transition-colors duration-150" />
            <div className="flex flex-col gap-1 relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: '#94A3B8' }} />
              ))}
            </div>
          </div>
        )}

        {/* RIGHT PANEL */}
        <div className={[
          'flex flex-col flex-1 overflow-hidden min-w-0',
          panelView === 'stores' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>

          {/* Offline banner */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium text-amber-800 bg-amber-50 border-b border-amber-200 print:hidden flex-shrink-0">
              <AlertTriangle size={13} className="shrink-0" />
              <span>Sin conexión — los cambios no se están guardando</span>
            </div>
          )}

          {/* ── Tab bar ── */}
          <div className="flex flex-shrink-0 print:hidden overflow-x-auto"
            style={{ background: '#fff', borderBottom: '1px solid var(--color-border)' }}>
            {([
              { key: 'monitoreo',     label: 'Monitoreo'   },
              { key: 'actividad',     label: 'Actividad'   },
              { key: 'historial',     label: 'Historial'   },
              { key: 'estadisticas',  label: 'Estadísticas'},
              { key: 'configuracion', label: 'Config'      },
              { key: 'calendario',    label: 'Calendario'  },
            ] as { key: typeof rightTab; label: string }[]).map(tab => {
              const active = rightTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                  className="relative flex-1 py-2.5 text-[11px] font-medium cursor-pointer transition-colors border-none bg-transparent whitespace-nowrap px-3"
                  style={{
                    color: active ? '#1A2550' : '#64748B',
                    borderBottom: active ? '2px solid var(--color-info)' : '2px solid transparent',
                  }}>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Tab content: Estadísticas ── */}
          {rightTab === 'estadisticas' && (
            <StatsTab odooConfig={odooConfig} hasOdoo={hasOdoo} canonicalNames={canonicalNames} />
          )}

          {/* ── Tab content: Actividad ── */}
          {rightTab === 'actividad' && (
            <div className="flex-1 overflow-hidden min-h-0">
              <ActivityTab
                live={{ printRecords, nameChanges, palletSlots, eventos: pickingEventos, supervisors: otherSupervisors }}
                today={todayISO()}
              />
            </div>
          )}

          {/* ── Tab content: Historial ── */}
          {rightTab === 'historial' && <HistorialTab allGroups={allGroups} nameChanges={nameChanges} records={printRecords} palletSlots={palletSlots} onRefresh={loadPrintRecords} />}

          {/* ── Tab content: Configuración ── */}
          {rightTab === 'configuracion' && (
            <ConfigTab
              labelConfig={labelConfig}
              onLabelConfigChange={setLabelConfig}
              canonicalNames={canonicalNames}
              onCanonicalNamesChange={handleCanonicalNamesChange}
              colsPerRow={colsPerRow}
              onColsPerRowChange={handleColsPerRowChange}
              currentUserName={profile?.full_name ?? ''}
            />
          )}

          {/* ── Tab content: Calendario (general, solo lectura) ── */}
          {rightTab === 'calendario' && (
            <div className="flex-1 overflow-y-auto min-h-0 p-3">
              <CalendarioColumnas readOnly forceGeneral />
            </div>
          )}

          {/* ── Tab content: Monitoreo ── */}
          {rightTab === 'monitoreo' && (selectedCods.length === 0 ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex flex-col items-center justify-center text-center px-8 py-12">
                <div className="mb-4 text-slate-200"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="text-[16px] font-semibold text-slate-500 mb-1.5">Selecciona una o más tiendas</div>
                <div className="text-[13px] text-slate-400 max-w-sm mx-auto">
                  Elige las tiendas del panel izquierdo para gestionar sus operaciones.
                </div>
                {!hasOdoo && (
                  <div className="mt-6 bg-white border border-[rgba(220,38,38,0.25)] rounded-xl px-4 py-3 text-[14px] text-red text-left inline-block">
                    <span className="font-bold">Odoo no configurado.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pb-10">

              {/* Filtro de sección + columnas por fila */}
              <div className="mt-4 mb-3 print:hidden flex flex-wrap items-center gap-4">
                <div>
                  <div className="text-[11px] font-medium text-slate-400 mb-2">Sección</div>
                  <div className="flex gap-1.5">
                    {([
                      { key: 'all',         label: 'Todas' },
                      { key: 'aseo-comida', label: 'Aseo y Comida' },
                      { key: 'hogar',       label: 'Hogar' },
                      { key: 'chocolates',  label: 'Chocolates' },
                    ] as { key: SectionFilter; label: string }[]).map(({ key, label }) => (
                      <button key={key} onClick={() => setSectionFilter(key)}
                        className="px-3.5 py-1.5 rounded text-[12px] font-medium cursor-pointer transition-all border"
                        style={{
                          background: sectionFilter === key ? 'var(--color-info)' : '#fff',
                          color:      sectionFilter === key ? '#fff'    : '#64748B',
                          borderColor: sectionFilter === key ? 'var(--color-info)' : 'var(--color-border)',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ml-auto">
                  {hasBarcodes && (
                    <button onClick={printAll}
                      className="flex items-center gap-2 border-none cursor-pointer font-semibold text-[13px] px-3.5 py-1.5 rounded"
                      style={{ background: '#2563EB', color: '#fff' }}>
                      <Printer size={14} />
                      Imprimir {printableLabels.length}
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-[14px] font-semibold text-text-2">
                    {filteredGroups.length === 0
                      ? 'Sin operaciones de Abastecimiento hoy'
                      : `${filteredGroups.length} picker${filteredGroups.length !== 1 ? 's' : ''} · ${selectedCods.length} tienda${selectedCods.length !== 1 ? 's' : ''}`}
                  </div>
                  {otroDiaCount > 0 && (
                    <div className="text-[11px] text-text-3 mt-0.5">
                      {otroDiaCount} movimiento{otroDiaCount !== 1 ? 's' : ''} de otro día oculto{otroDiaCount !== 1 ? 's' : ''} (error de Odoo — no {otroDiaCount !== 1 ? 'son' : 'es'} de hoy)
                    </div>
                  )}
                  {lastRefresh && (
                    <div className="text-[13px] text-text-3">
                      Actualizado: {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => selectedCods.forEach(cod => void fetchOpsForStore(cod))}
                  disabled={loadingCods.length > 0}
                  className="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer border rounded px-3 py-1.5 transition-all disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
                  <RefreshCw size={12} className={loadingCods.length > 0 ? 'animate-spin' : ''} />
                  {loadingCods.length > 0 ? 'Cargando…' : 'Actualizar'}
                </button>
              </div>

              {selectedCods.map(cod => {
                const storeGroups = groupedByStore[cod] ?? [];
                const isLoading   = loadingCods.includes(cod);
                const ops         = opsMap[cod] ?? [];
                const totalOps = ops.length;
                const doneOps = ops.filter(o => o.state === 'done').length;
                const storeStatus: 'none' | 'partial' | 'complete' =
                  totalOps === 0 ? 'none' : doneOps === totalOps ? 'complete' : 'partial';
                return (
                  <div key={cod} className="mb-6">
                    <div className="flex items-center gap-3 mb-3 print:mb-2 flex-wrap">
                      <span className="font-mono text-[13px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{cod}</span>
                      <span className="text-[16px] text-text-2 font-semibold">{nameFor(cod)}</span>
                      {storeStatus === 'complete' && (
                        <span className="text-[13px] font-bold px-3 py-0.5 rounded-full"
                          style={{ background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                          ✓ Todo realizado
                        </span>
                      )}
                      {storeStatus === 'partial' && (
                        <span className="text-[13px] font-bold px-3 py-0.5 rounded-full"
                          style={{ background: 'rgba(234,179,8,0.12)', color: '#D97706', border: '1px solid rgba(234,179,8,0.3)' }}>
                          {doneOps}/{totalOps} ops
                        </span>
                      )}
                      {isLoading && <span className="text-[14px] text-text-3 font-medium">Cargando…</span>}
                      {!isLoading && storeGroups.length === 0 && (
                        <span className="text-[14px] text-text-3 font-medium">Sin operaciones de Abastecimiento hoy</span>
                      )}
                      {/* Per-store print button */}
                      {(() => {
                        const storeLabels = printableLabels.filter(l => l.storeCod === cod);
                        if (!storeLabels.length) return null;
                        return (
                          <button onClick={() => printStoreLabels(cod)}
                            className="ml-auto print:hidden text-[13px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                            style={{ background: 'rgba(217,119,6,0.1)', color: '#D97706', border: '1px solid rgba(217,119,6,0.3)' }}>
                            <Printer size={13} /> {cod} · {storeLabels.length} etiqueta{storeLabels.length !== 1 ? 's' : ''}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Sin asignar warning */}
                    {(() => {
                      const sinAsignar = (allGroupedByStore[cod] ?? []).filter(g => g.key === 'Sin asignar');
                      const count = sinAsignar.reduce((s, g) => s + g.operations.length, 0);
                      if (!count) return null;
                      return (
                        <div className="mb-3 print:hidden flex items-center gap-3 bg-white border border-[rgba(220,38,38,0.2)] rounded-xl px-4 py-2.5">
                          <AlertTriangle size={18} className="shrink-0" style={{color:'#DC2626'}} />
                          <div className="flex-1 text-[13px]" style={{ color: '#B91C1C' }}>
                            <span className="font-bold">{count} operación{count !== 1 ? 'es' : ''} sin responsable en Odoo</span>
                            {' '}— no generarán etiqueta. Asigna picker en Odoo y recarga.
                          </div>
                          <button onClick={() => void fetchOpsForStore(cod)}
                            className="text-[13px] font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-all"
                            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.25)' }}>
                            ↻ Recargar
                          </button>
                        </div>
                      );
                    })()}

                    {(() => {
                        const allStore = allGroupedByStore[cod] ?? [];

                        const renderCard = (group: PickerGroup, stickerBelow = false) => {
                          const nums = assignedNumsByStateKey[group.stateKey] ?? [];
                          return (
                            <PickerGroupCard
                              key={group.stateKey}
                              group={group}
                              displayName={pickerDisplayNames[group.stateKey] || getCanonicalName(group.key)}
                              palletsByTipo={palletsByTipoAndStateKey[group.stateKey] ?? {}}
                              sectionFilter={sectionFilter}
                              adelanto={adelantoByCod[group.storeCod]}
                              onNameChange={name => {
                                setPickerDisplayNames(prev => ({ ...prev, [group.stateKey]: name }));
                                upsertSessionState(group.stateKey, name, 'P');
                              }}
                              onTipoPalletsChange={(tipo, n) => {
                                const current = palletsByTipoAndStateKey[group.stateKey]?.[tipo] ?? 0;
                                const delta = n - current;
                                const label = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key;
                                const groupCats = [...new Set(group.operations.flatMap(o => o.categories))];
                                const contenido = categoriesToContenido(groupCats);
                                const groupRefs = group.operations.map(o => o.name).join('+');
                                if (delta > 0) {
                                  for (let i = 0; i < delta; i++) void addPalletSlot(group.stateKey, cod, label, tipo, contenido, groupRefs);
                                } else if (delta < 0) {
                                  for (let i = 0; i < -delta; i++) void removePalletSlot(group.stateKey, tipo);
                                }
                              }}
                              onRefreshOp={(op) => void refreshOp(op, cod)}
                              onPrint={() => printGroupLabels(group)}
                              refreshingId={refreshingId}
                              totalPickers={allStore.length}
                              assignedNums={nums}
                              isPrinted={printedKeys.has(group.stateKey)}
                              colsPerRow={colsPerRow}
                              onPrintSelected={(palletNums) => printSelectedLabels(group.stateKey, palletNums)}
                              slots={slotsByStateKey[group.stateKey] ?? []}
                              stickerBelow={stickerBelow}
                              lastPrint={printRecordByKey.get(group.stateKey)}
                              myName={profile?.full_name ?? ''}
                            />
                          );
                        };

                        // Filtro activo (Hogar / Aseo y Comida): render plano, sin cambios
                        if (sectionFilter !== 'all') {
                          return <div className="space-y-4">{storeGroups.map(g => renderCard(g))}</div>;
                        }

                        // "Todas": grid de 3 columnas fijas, siempre visibles
                        const SECTION_META = {
                          'aseo-comida': { label: 'Aseo y Comida', color: '#D97706', bg: 'rgba(217,119,6,0.06)',  border: 'rgba(217,119,6,0.28)' },
                          hogar:         { label: 'Hogar',         color: '#1D4ED8', bg: 'rgba(29,78,216,0.06)',  border: 'rgba(29,78,216,0.22)' },
                          chocolates:    { label: 'Chocolates',    color: '#92400E', bg: 'rgba(146,64,14,0.06)', border: 'rgba(146,64,14,0.22)' },
                          mixto:         { label: 'Mixto',         color: '#7C3AED', bg: 'rgba(124,58,237,0.06)', border: 'rgba(124,58,237,0.22)' },
                        } as const;

                        const getSection = (g: PickerGroup): keyof typeof SECTION_META => {
                          const cats = new Set(g.operations.flatMap(o => o.categories));
                          const hasHogar      = cats.has('Hogar');
                          const hasAseoComida = cats.has('Aseo') || cats.has('Comida');
                          const hasChoco      = cats.has('Chocolates');
                          if (hasHogar && hasAseoComida) return 'mixto';
                          if (hasChoco) return 'chocolates';
                          if (hasAseoComida) return 'aseo-comida';
                          return 'hogar';
                        };

                        const countSlots = (gs: PickerGroup[]) =>
                          gs.reduce((sum, g) => sum + Object.values(palletsByTipoAndStateKey[g.stateKey] ?? {}).reduce((a, b) => a + b, 0), 0);

                        const aseoComidaGroups = storeGroups.filter(g => getSection(g) === 'aseo-comida');
                        const hogarGroups      = storeGroups.filter(g => getSection(g) === 'hogar');
                        const chocoGroups      = storeGroups.filter(g => getSection(g) === 'chocolates');
                        const mixtoGroups      = storeGroups.filter(g => getSection(g) === 'mixto');
                        const mixtoTotal       = countSlots(mixtoGroups);

                        const renderSectionHeader = (key: keyof typeof SECTION_META, total: number) => {
                          const meta = SECTION_META[key];
                          return (
                            <div className="mb-4 print:hidden">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-barlow-condensed text-[18px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: meta.color }}>
                                  {meta.label}
                                </span>
                                {total > 0 && (
                                  <span className="text-[13px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                                    style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                    {total} pallet{total !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="h-[3px] rounded-full w-full" style={{ background: meta.color, opacity: 0.55 }} />
                            </div>
                          );
                        };

                        const columns: Array<{ key: keyof typeof SECTION_META; groups: PickerGroup[] }> = [
                          { key: 'aseo-comida', groups: aseoComidaGroups },
                          { key: 'hogar',       groups: hogarGroups },
                          { key: 'chocolates',  groups: chocoGroups },
                        ];

                        return (
                          <div className="space-y-4">
                            {/* Grid de 3 columnas fijas — todas siempre visibles */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                              {columns.map((col) => {
                                const total = countSlots(col.groups);
                                const meta  = SECTION_META[col.key];
                                return (
                                  <div key={col.key}>
                                    {renderSectionHeader(col.key, total)}
                                    {col.groups.length > 0 ? (
                                      <div className="space-y-3">
                                        {col.groups.map(g => renderCard(g, true))}
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 px-4"
                                        style={{ borderColor: meta.color + '28', background: meta.bg }}>
                                        <div className="mb-1" style={{ opacity: 0.18 }}><Package size={28} /></div>
                                        <div className="text-[12px] font-semibold text-center" style={{ color: meta.color, opacity: 0.5 }}>
                                          Sin operaciones aún
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Mixto (Hogar + Aseo en el mismo picker) — ancho completo abajo */}
                            {mixtoGroups.length > 0 && (
                              <div>
                                {renderSectionHeader('mixto', mixtoTotal)}
                                <div className="space-y-3">
                                  {mixtoGroups.map(g => renderCard(g))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
