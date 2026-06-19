'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BarcodeCard, LabelConfig, DEFAULT_LABEL_CONFIG, CFG_SLIDER_CSS, PropRow, ToggleRow } from '@/features/despacho/shared/BarcodeCard';
import { TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../santiago/data/tiendasSantiago';
import { TIENDAS } from '../regiones/data/tiendas';
import { processPdf } from '../regiones/utils/pdfUtils';
import { formatCod } from '../rutas/utils/helpers';
import { TIENDAS_INICIAL } from '../rutas/data/tiendas';
import { getTiendasDelDia } from '../utils/useCalendario';
import { useOdooProgress } from '../shared/useOdooProgress';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useDayRollover } from '@/hooks/useDayRollover';
import { useApp } from '../../../context/AppContext';
import { fetchSessionState, subscribeToSessionState, pushSessionState } from '@/lib/userSessionState';
import { supabase } from '@/lib/supabase';
import type { SantiagoState, SantiagoItem } from '../santiago/types';
import type { DispatchItem } from '../../../types';

/* ── Canonical pallet ID — debe coincidir con /api/despacho-picking ─────── */
function stampFromTodayISO(): string {
  const d = new Date();
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}
function buildCanonicalId(tipo: 'Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate', seq: number, cod: string): string {
  const stamp = stampFromTodayISO();
  if (tipo === 'Pallet')      return `P${seq}${cod}${stamp}P`;
  if (tipo === 'Contenedor')  return `C${seq}${cod}${stamp}C`;
  if (tipo === 'Chocolate')   return `CH${seq}${cod}${stamp}CH`;
  return `${seq}B${cod}${stamp}B`;
}

/* ── Types ── */
interface StoreLabel {
  source: 'santiago' | 'regiones';
  cod: string;
  name: string;
  address: string;
  ventana: string;
  items: LabelItem[];
}

interface LabelItem {
  orden: string;
  tipo: 'Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate';
  itemNum: number;
  totalItems: number;
  peso: number;
  guias: string[];
  totalValue: number;
}

interface GuideEntry {
  fileName: string;
  guias: string[];
  totalSum: number;
  driveFileId?: string;
}

const _today = new Date();
const TODAY_KEY = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
const GUIDES_KEY = `estadoGuias_${TODAY_KEY}`;

function loadSantiagoItems(): Record<string, SantiagoItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    // Solo la clave del día. NO usar el fallback legacy sin fecha (`santiagoState`):
    // arrastraba las tiendas de días anteriores y las mostraba en verde/naranja como si
    // siguieran activas hoy. SantiagoContext escribe en la clave con fecha desde el sync.
    const raw = localStorage.getItem(`santiagoState_${TODAY_KEY}`);
    if (!raw) return {};
    const s = JSON.parse(raw) as SantiagoState;
    return s.items || {};
  } catch { return {}; }
}

function loadGuides(): Record<string, GuideEntry> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(GUIDES_KEY) || '{}'); }
  catch { return {}; }
}
function saveGuides(g: Record<string, GuideEntry>) {
  localStorage.setItem(GUIDES_KEY, JSON.stringify(g));
}


// Barcode1D → imported via BarcodeCard from @/features/despacho/shared/BarcodeCard

// Label (Zebra 100x150mm) → replaced by shared BarcodeCard

/* ── Store card ── */
function StoreCard({
  store, isSelected, onClick, checked, onCheck, audited = false, storeStatus = 'none', storeDoneOps = 0, storeTotalOps = 0,
}: {
  store: StoreLabel;
  isSelected: boolean;
  onClick: () => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
  audited?: boolean;
  storeStatus?: 'none' | 'pending' | 'partial' | 'complete';
  storeDoneOps?: number;
  storeTotalOps?: number;
}) {
  const pallets      = store.items.filter(i => i.tipo === 'Pallet').length;
  const bultos       = store.items.filter(i => i.tipo === 'Bulto').length;
  const contenedores = store.items.filter(i => i.tipo === 'Contenedor').length;
  const hasGuides = store.items.some(i => i.guias.length > 0);
  const empty = store.items.length === 0;
  const cardBg = isSelected
    ? 'bg-[rgba(27,42,107,0.06)]'
    : storeStatus === 'complete'
    ? 'bg-[rgba(22,163,74,0.04)]'
    : storeStatus === 'partial'
    ? 'bg-[rgba(217,119,6,0.04)]'
    : storeStatus === 'pending'
    ? 'bg-[rgba(156,163,175,0.04)]'
    : empty
    ? 'bg-bg/40'
    : 'bg-white hover:bg-bg';
  const cardBorder = isSelected
    ? 'border-l-navy'
    : storeStatus === 'complete'
    ? 'border-l-success'
    : storeStatus === 'partial'
    ? 'border-l-[#D97706]'
    : storeStatus === 'pending'
    ? 'border-l-[#9CA3AF]'
    : 'border-l-transparent';
  return (
    <div
      onClick={onClick}
      className={`relative flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-border transition-all border-l-[3px] ${cardBg} ${cardBorder}`}>

      {/* Indicador progreso Odoo */}
      {storeStatus === 'pending' && (
        <span
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
          style={{ background: '#9CA3AF', boxShadow: '0 0 0 2px #fff' }}
          title="Pendiente"
        />
      )}
      {storeStatus === 'complete' && (
        <span
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
          style={{ background: 'var(--status-done)', boxShadow: '0 0 0 2px #fff' }}
          title="✓ Todos los movimientos realizados"
        />
      )}
      {storeStatus === 'partial' && (
        <span
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
          style={{ background: 'var(--status-partial)', boxShadow: '0 0 0 2px #fff' }}
          title={storeDoneOps + '/' + storeTotalOps + ' movimientos realizados'}
        />
      )}

      {/* Checkbox para selección de impresión — estilo caja (como Picking) */}
      <div
        onClick={e => { e.stopPropagation(); if (!empty) onCheck(!checked); }}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${empty ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{
          borderColor: checked ? 'var(--color-secondary)' : 'rgba(26,37,80,0.2)',
          background:  checked ? 'var(--color-secondary)' : 'transparent',
          color: '#fff',
        }}>
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-[13px] font-bold shrink-0 px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(26,37,80,0.07)', color: '#374151' }}>
            {formatCod(store.cod)}
          </span>
          {hasGuides && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(22,163,74,0.10)] text-success uppercase">
              PDF ✓
            </span>
          )}
          {audited && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(22,163,74,0.18)] text-success uppercase">
              ✓ Auditado
            </span>
          )}
        </div>
        <div className="text-[14px] truncate leading-tight" style={{ color: '#374151' }}>{store.name}</div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        {pallets > 0 && (
          <span className="font-barlow-condensed text-[14px] font-bold text-info bg-[rgba(37,99,235,0.10)] px-2.5 py-1 rounded-lg">
            {pallets}P
          </span>
        )}
        {bultos > 0 && (
          <span className="font-barlow-condensed text-[14px] font-bold text-warn bg-[rgba(217,119,6,0.10)] px-2.5 py-1 rounded-lg">
            {bultos}B
          </span>
        )}
        {contenedores > 0 && (
          <span className="font-barlow-condensed text-[14px] font-bold px-2.5 py-1 rounded-lg"
            style={{ color: '#6B21A8', background: 'rgba(107,33,168,0.10)' }}>
            {contenedores}C
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN
═══════════════════════════════════════ */
type GroupKey = 'region' | 'santiago' | 'costa';
const GROUP_META: { key: GroupKey; label: string; bg: string; color: string }[] = [
  { key: 'region',   label: 'REGIONES', bg: 'rgba(37,99,235,0.07)',  color: '#1D4ED8' },
  { key: 'costa',    label: 'COSTA',    bg: 'rgba(16,185,129,0.07)', color: '#059669' },
  { key: 'santiago', label: 'SANTIAGO', bg: 'rgba(26,37,80,0.05)',   color: '#374151' },
];

export function EstadoPage({ tabBar }: { tabBar?: ReactNode } = {}) {
  const { state: appState } = useApp();
  const odooProgress = useOdooProgress();  // tiendas con picking terminado hoy
  useDayRollover();  // recarga al cruzar medianoche → evita guías/estado fantasma del día anterior

  // Columna izquierda redimensionable (divisor arrastrable, como Picking)
  const { width: leftWidth, isDesktop, handleMouseDown: handlePanelMouseDown, handleTouchStart: handlePanelTouchStart } =
    useResizablePanel({ storageKey: 'estado_left_panel_width', defaultWidth: 440, min: 320, max: 640 });

  // Tiendas del día por grupo (fal→REGIONES, costa→COSTA, rm→SANTIAGO)
  const [calGroups, setCalGroups] = useState<Record<GroupKey, string[]>>({ region: [], costa: [], santiago: [] });
  useEffect(() => {
    let alive = true;
    Promise.all([getTiendasDelDia('fal'), getTiendasDelDia('costa'), getTiendasDelDia('rm')])
      .then(([fal, costa, rm]) => {
        if (alive) setCalGroups({ region: fal, costa, santiago: rm });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [stores,        setStores]        = useState<StoreLabel[]>([]);
  const [guides,        setGuides]        = useState<Record<string, GuideEntry>>({});
  const [selected,      setSelected]      = useState<string | null>(null);
  const [printCods,     setPrintCods]     = useState<Set<string>>(new Set());
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragOver,      setDragOver]      = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  // canonical_ids de pallets auditados hoy (despacho_rm + despacho_regiones)
  const [auditedIds,    setAuditedIds]    = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  // Registra tiendas que el usuario desmarcó explícitamente.
  // rebuild las respeta y no las vuelve a marcar automáticamente.
  const userUncheckedRef = useRef<Set<string>>(new Set());

  const ESTADO_LABEL_CONFIG_KEY = 'estado_label_config_v1';
  const [labelConfig, setLabelConfig] = useState<LabelConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_LABEL_CONFIG;
    try { return { ...DEFAULT_LABEL_CONFIG, ...JSON.parse(localStorage.getItem('estado_label_config_v1') ?? '{}') }; }
    catch { return DEFAULT_LABEL_CONFIG; }
  });
  const [configOpen, setConfigOpen] = useState(false);

  function updateLabelConfig(cfg: LabelConfig) {
    setLabelConfig(cfg);
    localStorage.setItem(ESTADO_LABEL_CONFIG_KEY, JSON.stringify(cfg));
  }

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const rebuild = useCallback((guideMap: Record<string, GuideEntry>, regData: Record<string, DispatchItem[]>) => {
    const result: StoreLabel[] = [];

    const santItems = loadSantiagoItems();
    Object.entries(santItems).forEach(([cod, items]) => {
      if (!items.length) return;
      const t = getTiendaSantiagoByCod(cod);
      if (!t) return;
      const pallets      = items.filter(i => i.tipo === 'Pallet');
      const bultos       = items.filter(i => i.tipo === 'Bulto');
      const contenedores = items.filter(i => i.tipo === 'Contenedor');
      const chocolates   = items.filter(i => i.tipo === 'Chocolate');
      const allItems     = [...pallets, ...bultos, ...contenedores, ...chocolates];
      const guide        = guideMap[cod];
      const guideNums    = guide?.guias || [];
      const perItem      = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'santiago', cod, name: t.tienda, address: t.direccion, ventana: t.ventanaHoraria,
        items: allItems.map((it, idx) => {
          const typeItems = it.tipo === 'Pallet' ? pallets : it.tipo === 'Contenedor' ? contenedores : it.tipo === 'Chocolate' ? chocolates : bultos;
          const typeIdx   = typeItems.indexOf(it);
          return { orden: it.orden, tipo: it.tipo, itemNum: typeIdx + 1, totalItems: typeItems.length, peso: it.peso,
            guias: guideNums.length > 0 ? (idx < guideNums.length ? [guideNums[idx]] : guideNums) : [],
            totalValue: perItem };
        }),
      });
    });

    Object.entries(regData).forEach(([name, items]) => {
      if (!items.length) return;
      const t = TIENDAS[name];
      if (!t) return;
      const pallets     = items.filter(i => i.pkg === 'pallet');
      const bultos      = items.filter(i => i.pkg === 'box');
      const contenedores = items.filter(i => i.pkg === 'contenedor');
      const allItems    = [...pallets, ...bultos, ...contenedores];
      const guide       = guideMap[t.cod];
      const guideNums   = guide?.guias || [];
      const perItem     = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'regiones', cod: t.cod, name: t.name, address: `${t.calle || ''} ${t.numero || ''}`.trim(), ventana: '',
        items: allItems.map((it, idx) => {
          const isPallet     = it.pkg === 'pallet';
          const isContenedor = it.pkg === 'contenedor';
          const typeItems    = isPallet ? pallets : isContenedor ? contenedores : bultos;
          const typeIdx      = typeItems.indexOf(it);
          const tipo: 'Pallet' | 'Bulto' | 'Contenedor' = isPallet ? 'Pallet' : isContenedor ? 'Contenedor' : 'Bulto';
          return { orden: it.orden, tipo, itemNum: typeIdx + 1, totalItems: typeItems.length, peso: it.peso,
            guias: it.guia ? [it.guia] : (guideNums.length > 0 ? (idx < guideNums.length ? [guideNums[idx]] : guideNums) : []),
            totalValue: it.valor || perItem };
        }),
      });
    });

    result.sort((a, b) => a.cod.localeCompare(b.cod));
    setStores(result);
    // Auto-selecciona solo tiendas NUEVAS (no vistas antes).
    // Las que el usuario desmarcó explícitamente (userUncheckedRef) se respetan.
    setPrintCods(prev => {
      const next = new Set(prev);
      result.forEach(s => {
        if (!next.has(s.cod) && !userUncheckedRef.current.has(s.cod)) next.add(s.cod);
      });
      for (const cod of [...next]) { if (!result.find(s => s.cod === cod)) next.delete(cod); }
      return next;
    });
    setSelected(prev => {
      // Mantener selección si la tienda sigue existiendo.
      // NO auto-seleccionar: en móvil causaría navegar al detalle sin que
      // el usuario lo pidiera. En desktop el usuario puede tocar cualquier tienda.
      if (prev && result.find(s => s.cod === prev)) return prev;
      return null;
    });
  }, []);

  useEffect(() => {
    const g = loadGuides();
    setGuides(g);
    rebuild(g, appState.dispatch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch]);

  // Sincroniza el estado Santiago desde Supabase (cross-device).
  // SantiagoContext escribe en shared_session_state al registrar en cualquier
  // dispositivo. EstadoPage lee de localStorage, que es local al dispositivo.
  // Este efecto carga los datos remotos y los fusiona con el localStorage para
  // que el celular vea las tiendas registradas en Desktop (y viceversa).
  useEffect(() => {
    const LOCAL_KEY = `santiagoState_${TODAY_KEY}`;

    function applyRemote(remote: unknown) {
      try {
        const rs = remote as SantiagoState;
        if (!rs?.items || Object.keys(rs.items).length === 0) return;
        // Fusión: items locales tienen prioridad (registros del dispositivo actual)
        const localRaw   = localStorage.getItem(LOCAL_KEY) || localStorage.getItem('santiagoState');
        const localItems = localRaw
          ? ((JSON.parse(localRaw) as SantiagoState).items ?? {})
          : {} as Record<string, SantiagoItem[]>;
        const merged: SantiagoState = { ...rs, items: { ...rs.items, ...localItems } };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
        // Rebuild para que la UI refleje los datos recién llegados
        setGuides(prev => { rebuild(prev, appState.dispatch); return prev; });
      } catch {}
    }

    // Carga inicial desde Supabase
    fetchSessionState('santiago').then(applyRemote).catch(() => {});

    // Suscripción realtime: si Desktop registra más tiendas, el celular se actualiza
    const unsub = subscribeToSessionState('santiago', '', applyRemote);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch, rebuild]);

  // Sincroniza guías PDF desde Supabase (cross-device).
  // Las guías se guardan en localStorage del dispositivo que sube el PDF.
  // Este efecto las carga al montar y escucha cambios en tiempo real para que
  // móvil y desktop siempre estén en sincronía.
  useEffect(() => {
    function applyRemoteGuides(remote: unknown) {
      try {
        const remoteGuides = remote as Record<string, GuideEntry>;
        if (!remoteGuides || typeof remoteGuides !== 'object' || Array.isArray(remoteGuides)) return;
        setGuides(prev => {
          // Fusión: remoto como base, local como override (lo subido en este dispositivo tiene prioridad)
          const merged = { ...remoteGuides, ...prev };
          saveGuides(merged);
          rebuild(merged, appState.dispatch);
          return merged;
        });
      } catch {}
    }

    // Carga inicial: fusiona local + remoto y, si local tiene guías que
    // Supabase aún no conoce, las sube automáticamente (migración de sesión anterior).
    fetchSessionState('guides').then(remote => {
      const localGuides = loadGuides();
      const remoteGuides =
        remote && typeof remote === 'object' && !Array.isArray(remote)
          ? (remote as Record<string, GuideEntry>)
          : {};
      const merged = { ...remoteGuides, ...localGuides };
      // Si el local tiene guías no en Supabase → push automático (sync primera vez)
      if (Object.keys(localGuides).length > 0) {
        pushSessionState('guides', merged).catch(() => {});
      }
      applyRemoteGuides(merged);
    }).catch(() => {});

    const unsub = subscribeToSessionState('guides', '', applyRemoteGuides);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch, rebuild]);

  // Bridge: PDFs subidos en NACIONAL (AppContext.pdfData) → guides → activa QR.
  // Manual uploads in EstadoPage take priority (not overwritten).
  useEffect(() => {
    const pdfData = appState.pdfData;
    if (!pdfData || Object.keys(pdfData).length === 0) return;
    setGuides(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(pdfData).forEach(([tiendaName, pdf]) => {
        const t = TIENDAS[tiendaName];
        if (!t || next[t.cod]) return;
        next[t.cod] = { fileName: pdf.fileName, guias: pdf.guias.map(g => g.num), totalSum: pdf.totalSum };
        changed = true;
      });
      if (!changed) return prev;
      saveGuides(next);
      pushSessionState('guides', next).catch(() => {});
      rebuild(next, appState.dispatch);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.pdfData]);

  // Carga los canonical_ids auditados HOY desde despacho_rm + despacho_regiones
  // para mostrar badges "Auditado" en StoreCard y Label. Solo lectura: si falla,
  // los badges no aparecen pero el resto del flujo sigue funcionando.
  useEffect(() => {
    const cods = stores.map(s => s.cod);
    if (!cods.length) { setAuditedIds(new Set()); return; }
    const now = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const fechaHoy = `${dd}/${mm}/${yyyy}`;

    let cancelled = false;
    (async () => {
      try {
        const [rmRes, regRes] = await Promise.all([
          supabase.from('despacho_rm')
            .select('auditado_canonical_id')
            .in('cod', cods)
            .eq('fecha', fechaHoy)
            .eq('auditado', true),
          supabase.from('despacho_regiones')
            .select('auditado_canonical_id')
            .in('cod', cods)
            .eq('fecha', fechaHoy)
            .eq('auditado', true),
        ]);
        if (cancelled) return;
        const ids = new Set<string>();
        for (const r of (rmRes.data ?? []) as { auditado_canonical_id: string | null }[]) {
          if (r.auditado_canonical_id) ids.add(r.auditado_canonical_id);
        }
        for (const r of (regRes.data ?? []) as { auditado_canonical_id: string | null }[]) {
          if (r.auditado_canonical_id) ids.add(r.auditado_canonical_id);
        }
        setAuditedIds(ids);
      } catch {
        /* silencioso: badge opcional */
      }
    })();
    return () => { cancelled = true; };
  }, [stores]);

  // Poll Santiago localStorage every 3 s — SantiagoContext isn't in this tree
  useEffect(() => {
    let lastSantiago = JSON.stringify(loadSantiagoItems());
    const id = setInterval(() => {
      const current = JSON.stringify(loadSantiagoItems());
      if (current !== lastSantiago) {
        lastSantiago = current;
        setGuides(prev => {
          rebuild(prev, appState.dispatch);
          return prev;
        });
      }
    }, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch, rebuild]);

  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    setUploadLoading(true);

    const codMap: Record<string, string> = {};
    TIENDAS_SANTIAGO.forEach(t => { codMap[t.cod] = t.cod; });
    Object.values(TIENDAS).forEach(t => { codMap[t.cod] = t.cod; });

    let assigned = 0, skipped = 0;
    const sinManifiesto: string[] = [];
    const driveFallidos: string[] = [];
    const newGuides = { ...guides };

    for (const file of Array.from(files)) {
      const clean = file.name.replace(/\.pdf$/i, '');
      const match = clean.match(/^(\d{1,2}[A-ZÁÉÍÓÚÑ]{2,4}\d?)/i);
      if (!match) { skipped++; continue; }
      const rawCod = match[1].toUpperCase();
      const norm   = rawCod.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const storeCod = codMap[rawCod] || codMap[norm]
        || Object.keys(codMap).find(k => k.normalize('NFD').replace(/[̀-ͯ]/g, '') === norm);
      if (!storeCod) { skipped++; continue; }
      try {
        const data = await processPdf(file);
        if (!data.guias.length) data.guias = [{ num: clean, total: 0 }];

        // Subir el PDF a Drive. NO bloquea la lectura de folios, pero si falla hay
        // que avisar: sin drive_url no se puede mostrar el botón "Descargar PDF".
        let driveFileId: string | undefined;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const driveRes = await fetch('/api/drive-upload', { method: 'POST', body: fd });
          if (driveRes.ok) driveFileId = (await driveRes.json()).fileId;
        } catch { /* non-blocking — se reporta abajo vía driveFallidos */ }
        if (!driveFileId) driveFallidos.push(storeCod);

        newGuides[storeCod] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum, driveFileId };

        // Mark dispatch rows as En camino in Supabase
        fetch('/api/seguimiento', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cod: storeCod, estado: 'Pendiente' }),
        }).catch(() => {});

        // Vincular folios al manifiesto de la ruta (match robusto por código + ventana de fecha)
        try {
          const linkRes = await fetch('/api/ruta-guias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_cod: storeCod,
              folios: data.guias.map(g => g.num),
              drive_url: driveFileId,
            }),
          });
          const linkJson = await linkRes.json().catch(() => ({})) as { linked?: number; reason?: string };
          if (linkRes.ok && linkJson.linked === 0) sinManifiesto.push(storeCod);
        } catch { /* no bloquear la subida si falla el vínculo */ }

        assigned++;
      } catch { skipped++; }
    }

    if (fileRef.current) fileRef.current.value = '';
    setUploadLoading(false);
    saveGuides(newGuides);
    setGuides(newGuides);
    rebuild(newGuides, appState.dispatch);
    // Sync guides across devices (fire-and-forget)
    pushSessionState('guides', newGuides).catch(() => {});
    if (assigned > 0)
      showToast(`✓ ${assigned} guía${assigned !== 1 ? 's' : ''} asignada${assigned !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitida${skipped !== 1 ? 's' : ''}` : ''}`);
    else
      showToast('No se pudo asignar. El nombre debe empezar con el código (ej: 11ILC-guia.pdf)', false);
    if (driveFallidos.length)
      showToast(`⚠ Folios leídos pero el PDF NO se guardó en Drive para ${driveFallidos.join(', ')} — vuelve a subirlo (no habrá botón Descargar PDF)`, false);
    if (sinManifiesto.length)
      showToast(`⚠ Guía subida pero aún sin manifiesto para ${sinManifiesto.join(', ')}`, false);
  };

  /* Print only the currently-previewed store */
  const printSingleStore = (cod: string) => {
    const prev = printCods;
    setPrintCods(new Set([cod]));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const restore = () => { setPrintCods(prev); window.removeEventListener('afterprint', restore); };
      window.addEventListener('afterprint', restore);
      window.print();
    }));
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const allChecked  = stores.length > 0 && printCods.size === stores.length;
  const noneChecked = printCods.size === 0;

  const selectedStore = stores.find(s => s.cod === selected);
  const totalP = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Pallet').length, 0);
  const totalB = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Bulto').length, 0);
  const totalSelectedLabels = stores
    .filter(s => printCods.has(s.cod))
    .reduce((n, s) => n + s.items.length, 0);

  // Tiendas del día agrupadas (REGIONES / COSTA / SANTIAGO) — fusiona el
  // calendario con las tiendas ya registradas; las no registradas aparecen
  // como placeholder (sin items) para reflejar el calendario completo.
  const displayGroups = useMemo(() => {
    const byCod = new Map(stores.map(s => [s.cod, s]));
    const used  = new Set<string>();
    const result: Record<GroupKey, StoreLabel[]> = { region: [], costa: [], santiago: [] };

    (['region', 'costa', 'santiago'] as GroupKey[]).forEach(g => {
      for (const cod of calGroups[g]) {
        if (used.has(cod)) continue;
        const reg = byCod.get(cod);
        if (reg) result[g].push(reg);
        else {
          const source: 'santiago' | 'regiones' = g === 'region' ? 'regiones' : 'santiago';
          result[g].push({ source, cod, name: TIENDAS_INICIAL[cod]?.n ?? cod, address: '', ventana: '', items: [] });
        }
        used.add(cod);
      }
    });

    // Registradas que no están en el calendario de hoy → ubicar por fuente
    for (const s of stores) {
      if (used.has(s.cod)) continue;
      result[s.source === 'regiones' ? 'region' : 'santiago'].push(s);
      used.add(s.cod);
    }
    return result;
  }, [calGroups, stores]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html:
        CFG_SLIDER_CSS +
        '@media print{' +
        '@page{size:landscape;margin:0}' +
        'html,body{width:100%;height:100%;margin:0;padding:0}' +
        'body>*{display:none!important}' +
        '#estado-print-area{display:block!important;width:100%;height:100%}' +
        '.picking-label{display:flex!important;flex-direction:column!important;' +
        'width:100vw!important;height:100vh!important;max-width:100vw!important;' +
        'border-radius:0!important;margin:0!important;border:none!important;' +
        'padding:8mm!important;box-sizing:border-box!important;' +
        'break-after:page;page-break-after:always;overflow:hidden}' +
        '.picking-label>div{flex:1!important;display:flex!important;flex-direction:column!important;' +
        'height:100%!important;min-height:0!important;padding:0!important}' +
        '.picking-label:last-child{break-after:avoid;page-break-after:avoid}}'
      }} />

      {/* Print area rendered as portal directly into body — escapes all overflow:hidden containers */}
      {mounted && createPortal(
        <div id="estado-print-area" style={{ display: 'none' }}>
          {stores
            .filter(store => printCods.has(store.cod))
            .flatMap(store =>
              store.items.map((item, idx) => {
                const tipoCod = item.tipo === 'Pallet' ? 'P' : item.tipo === 'Contenedor' ? 'C' : item.tipo === 'Chocolate' ? 'CH' : 'B';
                const canonicalId = buildCanonicalId(item.tipo, item.itemNum, store.cod);
                const audited = auditedIds.has(canonicalId);
                return (
                  <BarcodeCard
                    key={`${store.cod}-${idx}`}
                    value={canonicalId}
                    palletNum={item.itemNum}
                    total={item.totalItems}
                    storeCod={store.cod}
                    storeName={store.name}
                    pickerLabel={store.ventana || store.name}
                    responsibleKey={store.source === 'santiago' ? 'BODEGA SANTIAGO' : 'BODEGA REGIONES'}
                    allCategories={item.guias}
                    totalPickers={0}
                    tipo={tipoCod}
                    canonicalId={canonicalId}
                    labelConfig={labelConfig}
                    audited={audited}
                    footerExtra={item.peso > 0 ? `${item.peso} kg` : undefined}
                  />
                );
              })
            )}
        </div>,
        document.body
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ══════════════════════════════
            LEFT — Subida + Lista + Imprimir
            Móvil sin selección: visible (flex-1 acotado → scroll funciona).
            Móvil con tienda seleccionada: oculto (el panel derecho ocupa toda la pantalla).
            Desktop: ancho redimensionable con el divisor arrastrable.
        ══════════════════════════════ */}
        <div
          className={`${selected ? 'hidden lg:flex' : 'flex'} flex-col overflow-hidden border-r border-border bg-white ${isDesktop ? 'shrink-0' : 'flex-1 w-full'}`}
          style={isDesktop ? { width: leftWidth } : undefined}>

          {/* Stats header — estilo claro (igual que "Tiendas de hoy" de Abastecimiento) */}
          <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0 bg-white">
            <div className="font-barlow-condensed text-[14px] font-semibold text-navy uppercase tracking-widest flex items-center gap-2">
              Tiendas de hoy
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(217,119,6,0.12)] text-amber-700">{stores.length}</span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {totalP > 0 && <span className="font-barlow-condensed text-[14px] font-bold text-info">{totalP} pallet{totalP !== 1 ? 's' : ''}</span>}
              {totalB > 0 && <span className="font-barlow-condensed text-[14px] font-bold text-warn">{totalB} bulto{totalB !== 1 ? 's' : ''}</span>}
              {totalP === 0 && totalB === 0 && <span className="text-[13px] text-text-3">Sin despacho registrado</span>}
            </div>
          </div>

          {/* PDF Upload zone (compact) */}
          <div
            className={`flex-shrink-0 border-b border-border transition-colors ${dragOver ? 'bg-[rgba(211,47,47,0.04)]' : 'bg-bg'}`}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}>

            <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />

            <div
              onClick={() => !uploadLoading && fileRef.current?.click()}
              className={`mx-3 mt-3 rounded-xl border-2 border-dashed flex items-center gap-3 px-4 py-3 cursor-pointer transition-all
                ${dragOver ? 'border-red bg-[rgba(211,47,47,0.06)]' : 'border-border hover:border-red/50 hover:bg-[rgba(211,47,47,0.02)]'}`}>
              {uploadLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-border border-t-red rounded-full animate-spin flex-shrink-0" style={{ borderWidth: 2 }} />
                  <span className="font-barlow-condensed text-[14px] font-bold text-text-2">Procesando guías…</span>
                </>
              ) : dragOver ? (
                <>
                  <span className="text-2xl flex-shrink-0">📂</span>
                  <span className="font-barlow-condensed text-[15px] font-bold text-red">Suelta los PDFs aquí</span>
                </>
              ) : (
                <>
                  <span className="text-2xl opacity-30 flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-barlow-condensed text-[14px] font-bold text-text leading-tight">Subir guías de despacho</p>
                    <p className="text-[11px] text-text-3 leading-tight mt-0.5">Arrastra PDFs o haz clic · ej: 11ILC-guia.pdf</p>
                  </div>
                  <span className="text-[11px] text-text-3 font-bold border border-border rounded-lg px-2 py-1 flex-shrink-0 bg-white">PDF</span>
                </>
              )}
            </div>

            {/* Chips de guías removidos: el "(PDF ✓)" por tienda ya indica cuáles tienen guía. */}
            <div className="pb-2" />
          </div>

          {/* Print controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-bg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-3 uppercase tracking-widest">Selección para imprimir</span>
              <button
                onClick={() => {
                  if (allChecked) {
                    // El usuario desmarca todas explícitamente → registrar todas
                    stores.forEach(s => userUncheckedRef.current.add(s.cod));
                    setPrintCods(new Set());
                  } else {
                    // El usuario marca todas → limpiar exclusiones
                    userUncheckedRef.current.clear();
                    setPrintCods(new Set(stores.map(s => s.cod)));
                  }
                }}
                disabled={stores.length === 0}
                className="text-[12px] font-bold text-info hover:underline cursor-pointer border-none bg-transparent disabled:opacity-30">
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>
            <button
              onClick={() => window.print()}
              disabled={noneChecked || stores.length === 0}
              className="btn-info w-full py-3 text-[15px]">
              🖨 Imprimir {noneChecked ? '— nada seleccionado' : `${totalSelectedLabels} etiqueta${totalSelectedLabels !== 1 ? 's' : ''}`}
            </button>
          </div>

          {/* Store list — agrupada por REGIONES / COSTA / SANTIAGO */}
          <div className="flex-1 overflow-y-auto">
            {GROUP_META.every(g => displayGroups[g.key].length === 0) ? (
              <div className="py-20 text-center px-6">
                <div className="text-5xl mb-4 opacity-10">📦</div>
                <p className="text-[15px] text-text-2 font-bold mb-1">Sin tiendas para hoy</p>
                <p className="text-[13px] text-text-3 leading-snug">
                  Revisa el calendario o registra despacho en Bodega Santiago / Regiones
                </p>
              </div>
            ) : (
              GROUP_META.map(g => {
                const list = displayGroups[g.key];
                if (list.length === 0) return null;
                const readyCount = list.filter(s => odooProgress.get(s.cod)?.status === 'complete').length;
                return (
                  <div key={g.key}>
                    <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 flex items-center gap-2"
                      style={{ background: g.bg, color: g.color, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      {g.label} ({list.length})
                      {readyCount > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A' }}>
                          ✓ {readyCount} listo{readyCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {list.map(s => {
                      const storeAudited = s.items.some(i =>
                        auditedIds.has(buildCanonicalId(i.tipo, i.itemNum, s.cod)),
                      );
                      return (
                        <StoreCard
                          key={s.cod}
                          store={s}
                          isSelected={selected === s.cod}
                          storeStatus={odooProgress.get(s.cod)?.status ?? 'none'}
                          storeDoneOps={odooProgress.get(s.cod)?.done ?? 0}
                          storeTotalOps={odooProgress.get(s.cod)?.total ?? 0}
                          onClick={() => setSelected(s.cod)}
                          checked={printCods.has(s.cod)}
                          audited={storeAudited}
                          onCheck={v => {
                            if (!v) userUncheckedRef.current.add(s.cod);
                            else userUncheckedRef.current.delete(s.cod);
                            setPrintCods(prev => {
                              const next = new Set(prev);
                              v ? next.add(s.cod) : next.delete(s.cod);
                              return next;
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* DIVISOR ARRASTRABLE — solo desktop (igual que Picking) */}
        {isDesktop && (
          <div
            className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
            style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
            onMouseDown={handlePanelMouseDown}
            onTouchStart={handlePanelTouchStart}>
            <div className="absolute inset-0 group-hover:bg-blue-500/10 transition-colors duration-150" />
            <div className="flex flex-col gap-1 relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: '#94A3B8' }} />
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════
            RIGHT — Previsualización de etiquetas
            Móvil sin selección: oculto (solo se ve la lista).
            Móvil con tienda seleccionada: full-screen con botón "← Volver".
            Desktop: siempre visible al lado de la lista.
        ══════════════════════════════ */}
        <div className={`${selected ? 'flex' : 'hidden lg:flex'} flex-col flex-1 overflow-hidden bg-[#ECEEF3]`}>

          {/* Tabs (estilo Picking) — pegados al tope del panel derecho, sin franja gris. */}
          {tabBar}

          {/* Contenido con scroll y padding (debajo de los tabs) */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-col">

          {/* Botón Volver — solo en móvil cuando hay tienda seleccionada */}
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="lg:hidden flex-shrink-0 flex items-center gap-2 mb-4 px-3 py-2 rounded-xl border border-border bg-white text-navy font-bold text-[13px] cursor-pointer active:opacity-70 self-start"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              ← Volver a lista
            </button>
          )}

          {!selectedStore ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-10">🏷️</div>
                <p className="text-[16px] text-text-3 font-semibold opacity-60">
                  {stores.length === 0 ? 'Sin datos — registra despacho primero' : 'Toca una tienda para ver sus etiquetas'}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <div className="font-barlow-condensed text-[26px] font-bold text-navy leading-tight">
                    {formatCod(selectedStore.cod)}
                    <span className="text-text-2 font-semibold ml-2">— {selectedStore.name}</span>
                  </div>
                  <p className="text-[13px] text-text-3 mt-1">
                    {selectedStore.items.length} etiqueta{selectedStore.items.length !== 1 ? 's' : ''}
                    {selectedStore.address ? ` · ${selectedStore.address}` : ''}
                    {selectedStore.ventana  ? ` · Ventana: ${selectedStore.ventana}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setConfigOpen(v => !v)}
                    className="btn-outline text-[13px] whitespace-nowrap"
                    style={configOpen ? { background: 'rgba(37,99,235,0.08)', borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB' } : undefined}>
                    ⚙ Config
                  </button>
                  <button
                    onClick={() => printSingleStore(selectedStore.cod)}
                    className="btn-info text-[13px] whitespace-nowrap">
                    🖨 Solo esta tienda
                  </button>
                </div>
              </div>

              {/* Config panel */}
              {configOpen && (
                <div className="mb-6 bg-white rounded-2xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[14px] font-bold text-navy">Diseño de etiqueta</div>
                    <button
                      onClick={() => updateLabelConfig({ ...DEFAULT_LABEL_CONFIG })}
                      className="text-[12px] font-medium rounded-xl px-3 py-1.5 cursor-pointer transition-all active:scale-95"
                      style={{ color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
                      ↺ Restablecer
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8] mb-1">Tipografía</div>
                      <PropRow label="Ventana / nombre" field="pickerFontSize" min={20} max={50} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="N.º pallet (P-1)" field="palletNumSize" min={50} max={120} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Cód. tienda" field="storeFontSize" min={80} max={200} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Nombre tienda" field="storeNameFontSize" min={24} max={72} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Guías / categ." field="catFontSize" min={12} max={30} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Fecha" field="dateFontSize" min={8} max={20} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8] mb-1">Código de barras</div>
                      <PropRow label="Grosor barras" field="barcodeBarWidth" min={1} max={4} unit="" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Altura" field="barcodeHeight" min={40} max={130} labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <PropRow label="Ancho" field="barcodeContainerWidth" min={60} max={100} unit="%" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8] mb-1 mt-3">Visibilidad</div>
                      <ToggleRow label="Fuente (Bodega Santiago/Regiones)" field="showResponsable" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <ToggleRow label="Guías como etiquetas" field="showCategories" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <ToggleRow label="Nombre de tienda" field="showStoreName" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                      <ToggleRow label="Fecha impresión" field="showDate" labelConfig={labelConfig} onUpdate={(f, v) => updateLabelConfig({ ...labelConfig, [f]: v })} />
                    </div>
                  </div>
                </div>
              )}

              {/* Preview grid — BarcodeCard scaled to fit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 360px)', gap: 16 }}>
                {(() => {
                  const SCALE = 0.50;
                  const W = 720 * SCALE; // 360px
                  const H = 600 * SCALE; // 300px
                  return selectedStore.items.map((item, idx) => {
                    const tipoCod = item.tipo === 'Pallet' ? 'P' : item.tipo === 'Contenedor' ? 'C' : item.tipo === 'Chocolate' ? 'CH' : 'B';
                    const canonicalId = buildCanonicalId(item.tipo, item.itemNum, selectedStore.cod);
                    const audited = auditedIds.has(canonicalId);
                    return (
                      <div
                        key={idx}
                        className="shadow-xl rounded-xl overflow-hidden flex-shrink-0"
                        style={{ border: '1px solid #d0d4df', width: W, height: H, position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left', width: 720 }}>
                          <BarcodeCard
                            value={canonicalId}
                            palletNum={item.itemNum}
                            total={item.totalItems}
                            storeCod={selectedStore.cod}
                            storeName={selectedStore.name}
                            pickerLabel={selectedStore.ventana || selectedStore.name}
                            responsibleKey={selectedStore.source === 'santiago' ? 'BODEGA SANTIAGO' : 'BODEGA REGIONES'}
                            allCategories={item.guias}
                            totalPickers={0}
                            tipo={tipoCod}
                            canonicalId={canonicalId}
                            labelConfig={labelConfig}
                            audited={audited}
                            footerExtra={item.peso > 0 ? `${item.peso} kg` : undefined}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-xl text-white text-[15px] font-semibold shadow-2xl z-50 whitespace-nowrap ${toast.ok ? 'bg-[#16A34A]' : 'bg-[#D97706]'}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
