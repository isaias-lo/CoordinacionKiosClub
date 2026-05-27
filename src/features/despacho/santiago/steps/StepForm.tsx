'use client';
import { useState, useEffect, useRef } from 'react';
import { Navigation, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSantiago } from '../context/SantiagoContext';
import { useApp } from '../../../../context/AppContext';
import { getTiendasSantiagoHoy, TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import { formatCod } from '../../rutas/utils/helpers';
import { getTiendasSantiagoHoyGrouped, getCalendarioSantiagoInicialHoy } from '../utils/calendarSantiago';
import { subscribeToCalendarChanges } from '../../utils/useCalendario';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import type { TiendaSantiago, TipoCargamento, ContenidoSantiago, EstadoItem, SantiagoItem } from '../types';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { supabase } from '../../../../lib/supabase';
import { fetchSessionState, subscribeToSessionState, pushSessionState } from '@/lib/userSessionState';
import { processPdf } from '../../regiones/utils/pdfUtils';

/* ── Calendar localStorage ── */
const _d = new Date();
const todayKey = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const EXTRA_KEY   = `calExtraSANT_${todayKey}`;
const REMOVED_KEY = `calRemovedSANT_${todayKey}`;

/* ── Guías PDF — compartidas con EstadoPage vía Supabase ── */
const GUIDES_KEY = `estadoGuias_${todayKey}`;
type GuideEntry = { fileName: string; guias: string[]; totalSum: number };
function loadGuides(): Record<string, GuideEntry> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(GUIDES_KEY) || '{}'); } catch { return {}; }
}
function saveGuides(g: Record<string, GuideEntry>) { localStorage.setItem(GUIDES_KEY, JSON.stringify(g)); }
function loadExtra():   string[] { try { return JSON.parse(localStorage.getItem(EXTRA_KEY)   || '[]'); } catch { return []; } }
function loadRemoved(): string[] { try { return JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'); } catch { return []; } }

/* ── Constants ── */
const CONTENIDO_PALLET:     ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto'];
const CONTENIDO_BULTO:      ContenidoSantiago[] = ['Hogar', 'Chocolate'];
const CONTENIDO_CONTENEDOR: ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto'];
const ESTADO_DEFAULT: EstadoItem = 'Listo para despachar';
const ESTADOS: EstadoItem[] = [
  'Listo para despachar', 'Despachado', 'Carga recibida', 'Carga No recibida por tienda',
];
const CHOCOLATE_BULTO_DIMS = { alto: 38, largo: 78, ancho: 52, peso: 5 }; // Bulto con contenido Chocolate (legado)
const CHOCOLATE_DIMS       = { alto: 42, largo: 80, ancho: 56, pesoMax: 25 }; // Tipo Chocolate CH (oficial)
const CONTENEDOR_LARGO = 110;
const CONTENEDOR_ANCHO = 80;
const CONTENEDOR_ALTO  = 150;

/* ── FormRow ── */
interface FormRow {
  id: string;
  tipo: TipoCargamento;
  contenido: ContenidoSantiago;
  peso: string;
  alto: string;
  largo: string;
  ancho: string;
  saved?: boolean;
  savedItem?: SantiagoItem;
}

/* ── Resumen inline state type ── */
interface ResumenEditState {
  cod: string;
  idx: number;
  tipo: TipoCargamento;
  contenido: ContenidoSantiago;
  estado: EstadoItem;
  peso: string;
  alto: string;
  largo: string;
  ancho: string;
}

/* ═══════════════════════════════════════
   STORE GRID CARD
═══════════════════════════════════════ */
function TiendaGridCard({
  t, isActive, isToday, itemCount, palletCount, contenedorCount, chocolateCount,
  despachoP, despachoB, despachoC, hasGuide,
  onSelect, onAddToday, onRemoveFromToday,
}: {
  t: TiendaSantiago; isActive: boolean; isToday: boolean;
  itemCount: number; palletCount: number; contenedorCount: number; chocolateCount: number;
  despachoP?: number; despachoB?: number; despachoC?: number;
  hasGuide?: boolean;
  onSelect: () => void;
  onAddToday?: () => void;
  onRemoveFromToday?: () => void;
}) {
  const boxCount = itemCount - palletCount - contenedorCount - chocolateCount;
  const expP     = despachoP ?? 0;
  const expB     = despachoB ?? 0;
  const expC     = despachoC ?? 0;
  return (
    <div
      onClick={onSelect}
      className={`flex flex-col items-center justify-between px-2 py-3 cursor-pointer rounded-xl transition-all select-none min-h-[80px] relative active:scale-[0.97]
        ${isActive
          ? 'bg-[rgba(211,47,47,0.12)] border-2 border-red shadow-sm'
          : hasGuide
          ? 'bg-[rgba(22,163,74,0.07)] border-2 border-success active:bg-[rgba(22,163,74,0.12)]'
          : isToday
          ? 'bg-[rgba(211,47,47,0.04)] border border-[rgba(211,47,47,0.20)] active:bg-[rgba(211,47,47,0.09)]'
          : 'bg-white border border-border active:bg-bg'
        }`}>
      {isToday && onRemoveFromToday && (
        <button onClick={e => { e.stopPropagation(); onRemoveFromToday(); }}
          className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[10px] text-warn bg-[rgba(217,119,6,0.15)] rounded-full cursor-pointer border-none leading-none"
          title="Retirar de hoy">×</button>
      )}
      {!isToday && onAddToday && (
        <button onClick={e => { e.stopPropagation(); onAddToday(); }}
          className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[10px] text-success bg-[rgba(22,163,74,0.15)] rounded-full cursor-pointer border-none leading-none"
          title="Agregar a hoy">+</button>
      )}
      <div className={`font-barlow-condensed text-[16px] font-extrabold leading-none tracking-wide ${isActive ? 'text-red' : hasGuide ? 'text-success' : 'text-navy'}`}>
        {formatCod(t.cod)}
      </div>
      <div className="text-[10px] font-semibold text-text-2 w-full text-center leading-tight truncate px-0.5 mt-1 uppercase tracking-wide">
        {t.tienda}
      </div>
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 min-h-[16px]">
        {/* Ghost badges: picking (siempre visibles si existen) */}
        {expP > 0 && <span className="text-[11px] font-bold text-info/40 bg-[rgba(37,99,235,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-info/25">{expP}P</span>}
        {expB > 0 && <span className="text-[11px] font-bold text-warn/40 bg-[rgba(217,119,6,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-warn/25">{expB}B</span>}
        {expC > 0 && <span className="text-[11px] font-bold text-[rgba(107,33,168,0.40)] bg-[rgba(107,33,168,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-[rgba(107,33,168,0.25)]">{expC}C</span>}
        {/* Solid badges: items ingresados en despacho */}
        {palletCount     > 0 && <span className="text-[11px] font-bold text-info bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 rounded-full leading-none">{palletCount}P</span>}
        {boxCount        > 0 && <span className="text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.12)] px-1.5 py-0.5 rounded-full leading-none">{boxCount}B</span>}
        {contenedorCount > 0 && <span className="text-[11px] font-bold text-[#6B21A8] bg-[rgba(107,33,168,0.10)] px-1.5 py-0.5 rounded-full leading-none">{contenedorCount}C</span>}
        {chocolateCount  > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ color: '#92400E', background: 'rgba(146,64,14,0.10)' }}>{chocolateCount}CH</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   CALENDAR CONFIRMATION MODAL
═══════════════════════════════════════ */
function ConfirmCalendarModal({ name, mode, onConfirm, onCancel }: {
  name: string; mode: 'add' | 'remove'; onConfirm: () => void; onCancel: () => void;
}) {
  const t = TIENDAS_SANTIAGO.find(t => t.tienda === name);
  const isAdd = mode === 'add';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-navy/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl">
        <div className={`px-5 py-4 border-b text-center ${isAdd ? 'bg-[rgba(211,47,47,0.07)] border-[rgba(211,47,47,0.12)]' : 'bg-[rgba(217,119,6,0.07)] border-[rgba(217,119,6,0.12)]'}`}>
          <h3 className="font-barlow-condensed text-[21px] font-bold text-navy">Modificar calendario</h3>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-[14px] text-text-2 leading-relaxed">
            {isAdd ? '¿Agregar ' : '¿Retirar '}
            <span className="font-bold text-navy">{t?.tienda || name}</span>
            {isAdd ? ' al despacho de hoy?' : ' del despacho de hoy?'}
          </p>
          <p className="text-[12px] text-text-3 mt-1.5">Este cambio aplica solo para hoy.</p>
        </div>
        <div className="flex border-t border-border">
          <button onClick={onCancel}
            className="flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-text-2 bg-bg-2 active:bg-bg-3 cursor-pointer border-r border-border">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-white cursor-pointer ${isAdd ? 'bg-red' : 'bg-[#D97706]'}`}>
            {isAdd ? 'Confirmar' : 'Retirar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   FORM HEADER
═══════════════════════════════════════ */
function TiendaFormHeader({ tienda, pallets, bultos, onBack }: {
  tienda: TiendaSantiago; pallets: number; bultos: number; onBack: () => void;
}) {
  return (
    <div className="bg-navy px-3 py-3 flex items-center gap-2 flex-shrink-0">
      <button onClick={onBack}
        className="flex items-center justify-center w-8 h-8 text-white/70 text-[20px] cursor-pointer border-none bg-white/10 rounded-full flex-shrink-0 active:bg-white/20">
        ←
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-barlow-condensed text-[18px] font-bold text-white leading-tight truncate">{tienda.tienda}</div>
        <div className="font-mono text-[10px] text-white/50">{formatCod(tienda.cod)} · {tienda.ventanaHoraria}</div>
      </div>
      <div className="flex gap-3 flex-shrink-0">
        <div className="text-center">
          <div className="font-barlow-condensed text-[22px] font-extrabold text-[#93C5FD] leading-none">{pallets}</div>
          <div className="text-[9px] text-white/50 uppercase tracking-widest">P</div>
        </div>
        <div className="text-center">
          <div className="font-barlow-condensed text-[22px] font-extrabold text-[#FCD34D] leading-none">{bultos}</div>
          <div className="text-[9px] text-white/50 uppercase tracking-widest">B</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export function StepForm() {
  const router = useRouter();
  const { state, dispatch, flushPending } = useSantiago();
  const { showToast } = useApp();
  const { currentTienda, items, regimen } = state;

  /* Mobile view */
  const [view, setView] = useState<'list' | 'form' | 'resumen'>('list');

  /* Calendar */
  const [extraCods,    setExtraCods]    = useState<string[]>(loadExtra);
  const [removedCods,  setRemovedCods]  = useState<string[]>(loadRemoved);
  const [confirmAdd,   setConfirmAdd]   = useState<string | null>(null);
  const [confirmRemove,setConfirmRemove]= useState<string | null>(null);

  /* Search */
  const [search, setSearch] = useState('');

  /* Single-item form */
  const [tipo,      setTipo]      = useState<TipoCargamento>('Pallet');
  const [contenido, setContenido] = useState<ContenidoSantiago>('Hogar');
  const [peso,      setPeso]      = useState('');
  const [alto,      setAlto]      = useState('');
  const [largo,     setLargo]     = useState('');
  const [ancho,     setAncho]     = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  /* Combine items (drag-to-merge) — form view */
  const [dragIdx,         setDragIdx]         = useState<number | null>(null);
  const [dropIdx,         setDropIdx]         = useState<number | null>(null);
  const [combineModal,    setCombineModal]     = useState<{ srcIdx: number; tgtIdx: number; cod?: string } | null>(null);
  const itemDragRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Combine items — resumen view */
  const [rDragIdx, setRDragIdx] = useState<number | null>(null);
  const [rDropIdx, setRDropIdx] = useState<number | null>(null);
  const [rDragCod, setRDragCod] = useState<string | null>(null);
  const rLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Preset / multi-form */
  const [presets,       setPresets]      = useState<Record<string, { pallets: number; bultos: number; contenedores: number; chocolates: number }>>({});
  const [formRows,      setFormRows]     = useState<FormRow[]>([]);
  const [pickingSlots,  setPickingSlots]  = useState<Record<string, { tipo: string; contenido: string }[]>>({});

  /* Resumen inline state */
  const [resumenExpanded, setResumenExpanded] = useState<Set<string>>(new Set());
  const [resumenEditing,  setResumenEditing]  = useState<ResumenEditState | null>(null);

  function toggleResumenExpanded(cod: string) {
    setResumenExpanded(prev => {
      const next = new Set(prev);
      next.has(cod) ? next.delete(cod) : next.add(cod);
      return next;
    });
  }

  /* Guías PDF (compartidas con EstadoPage) */
  const [guides,        setGuides]        = useState<Record<string, GuideEntry>>(loadGuides);
  const [guideUploading, setGuideUploading] = useState(false);
  const guideFileRef = useRef<HTMLInputElement>(null);

  /* Calendar from Sheets */
  const [sheetsTodayGrouped, setSheetsTodayGrouped] = useState<{ rm: string[]; costa: string[] }>(getCalendarioSantiagoInicialHoy);
  const [selectedGrps, setSelectedGrps] = useState<Set<'rm' | 'costa'>>(new Set(['rm']));

  /* Dynamic tiendas from Supabase (merged with static at runtime) */
  const [supabaseTiendasMap, setSupabaseTiendasMap] = useState<Record<string, TiendaSantiago>>({});

  /* ── Sincronización de guías PDF con Supabase ── */
  useEffect(() => {
    function applyRemoteGuides(remote: unknown) {
      try {
        const rg = remote as Record<string, GuideEntry>;
        if (!rg || typeof rg !== 'object' || Array.isArray(rg)) return;
        setGuides(prev => {
          const merged = { ...rg, ...prev };
          saveGuides(merged);
          return merged;
        });
      } catch {}
    }
    fetchSessionState('guides').then(remote => {
      const localGuides = loadGuides();
      const remoteGuides =
        remote && typeof remote === 'object' && !Array.isArray(remote)
          ? (remote as Record<string, GuideEntry>)
          : {};
      const merged = { ...remoteGuides, ...localGuides };
      if (Object.keys(localGuides).length > 0) pushSessionState('guides', merged).catch(() => {});
      applyRemoteGuides(merged);
    }).catch(() => {});
    const unsub = subscribeToSessionState('guides', '', applyRemoteGuides);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Subida de guías PDF de Santiago ── */
  const handleGuideFiles = async (files: FileList) => {
    if (!files.length) return;
    setGuideUploading(true);
    const codMap: Record<string, string> = {};
    Object.values(tiendaByCod).forEach(t => { codMap[t.cod] = t.cod; });
    const newGuides = { ...guides };
    let assigned = 0, skipped = 0;
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
        newGuides[storeCod] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum };
        assigned++;
      } catch { skipped++; }
    }
    if (guideFileRef.current) guideFileRef.current.value = '';
    setGuideUploading(false);
    if (assigned > 0) {
      setGuides(newGuides);
      saveGuides(newGuides);
      pushSessionState('guides', newGuides).catch(() => {});
      showToast(
        `✓ ${assigned} guía${assigned !== 1 ? 's' : ''} asignada${assigned !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitida${skipped !== 1 ? 's' : ''}` : ''}`,
        '#16A34A',
      );
    } else {
      showToast('No se pudo asignar. El nombre debe empezar con el código (ej: 21NUC-guia.pdf)', '#D97706');
    }
  };

  useEffect(() => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const todayCode = DAY_CODES[new Date().getDay()];
    const RM_MAP: Record<string, string>    = { PEN: '23PEÑ', '23PEN': '23PEÑ' };
    const COSTA_MAP: Record<string, string> = { VIN: '37VIÑ', '37VIN': '37VIÑ' };

    // Initial fetch (checks localStorage cache first, then Sheets)
    getTiendasSantiagoHoyGrouped()
      .then(grouped => { setSheetsTodayGrouped(grouped); })
      .catch(() => {});

    // Real-time sync when CalendarioCentral saves from another tab
    return subscribeToCalendarChanges(cal => {
      const day = cal[todayCode];
      if (!day) return;
      const grouped = {
        rm:    (day.rm    || []).map(c => RM_MAP[c]    ?? c),
        costa: (day.costa || []).map(c => COSTA_MAP[c] ?? c),
      };
      if (grouped.rm.length > 0 || grouped.costa.length > 0) {
        setSheetsTodayGrouped(grouped);
      }
    });
  }, []);

  /* Load dynamic tiendas from Supabase (once on mount) */
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then(({ tiendas: data }: { tiendas: Array<Record<string, unknown>> }) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, TiendaSantiago> = {};
        for (const t of data) {
          const cod = String(t.codigo ?? '');
          if (!cod || t.activo === false) continue;
          const corredor = String(t.corredor ?? '').toLowerCase();
          const region   = String(t.region   ?? '').toLowerCase();
          const isVR     = corredor.includes('costa') || region.includes('valparaíso') || region === 'vr';
          const raw      = String(t.frecuencia ?? '');
          const dias     = raw ? raw.split(/[,;\s]+/).map(d => d.trim().toUpperCase()).filter(Boolean) : [];
          const tipoVal  = String(t.tipo ?? '');
          map[cod] = {
            cod,
            tienda:         String(t.nombre       ?? ''),
            region:         isVR ? 'VR' : 'RM',
            direccion:      String(t.direccion    ?? ''),
            comuna:         String(t.sector_comuna ?? ''),
            tipo:           (tipoVal === 'MALL' ? 'MALL' : 'STRIPCENTER') as 'MALL' | 'STRIPCENTER',
            ventanaHoraria: String(t.ventana      ?? ''),
            diasDespacho:   dias,
          };
        }
        setSupabaseTiendasMap(map);
      })
      .catch(() => {});
  }, []);

  /* Despacho ↔ Santiago bidirectional sync */
  const [despachoCounts, setDespachoCounts] = useState<Record<string, { p: number; b: number; c: number }>>({});

  // Write santiagoCounts whenever items change → Despacho reads this
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const counts: Record<string, { p: number; b: number; c: number }> = {};
    Object.entries(items).forEach(([cod, list]) => {
      const p = list.filter(i => i.tipo === 'Pallet').length;
      const b = list.filter(i => i.tipo === 'Bulto').length;
      const c = list.filter(i => i.tipo === 'Contenedor').length;
      if (p > 0 || b > 0 || c > 0) counts[cod] = { p, b, c };
    });
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    localStorage.setItem('santiagoCounts', JSON.stringify({ date: todayKey, counts }));
    pushCounts('santiago', counts).catch(() => {});
  }, [items]);

  // Read despachoCounts → sync from Despacho
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const todayDate = new Date();
    const todayKey  = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;
    const sync = () => {
      try {
        const raw = localStorage.getItem('despachoCounts');
        if (!raw) { setDespachoCounts({}); return; }
        const payload: { date?: string; counts?: Record<string, { p: number; b: number; c?: number }> } = JSON.parse(raw);
        // New format: { date, counts } — discard if from a different day
        if (payload.counts !== undefined) {
          const c = payload.date === todayKey ? payload.counts : {};
          setDespachoCounts(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { p: v.p, b: v.b, c: v.c ?? 0 }])));
        } else {
          // Legacy format: plain counts object (no date stamp)
          const raw2 = payload as Record<string, { p: number; b: number; c?: number }>;
          setDespachoCounts(Object.fromEntries(Object.entries(raw2).map(([k, v]) => [k, { p: v.p, b: v.b, c: v.c ?? 0 }])));
        }
      } catch (_) {}
    };
    sync();
    window.addEventListener('storage', sync);
    const interval = setInterval(sync, 2000);
    return () => { window.removeEventListener('storage', sync); clearInterval(interval); };
  }, []);

  // Load picking slots from picking_pallets (today) — feeds P/C/B + contenido in RM/Costa
  useEffect(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const load = async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('store_cod,tipo,contenido')
        .eq('date', dateStr);
      if (!data) return;
      const slots: Record<string, { tipo: string; contenido: string }[]> = {};
      for (const row of data) {
        const cod = row.store_cod;
        if (!slots[cod]) slots[cod] = [];
        slots[cod].push({ tipo: row.tipo || 'P', contenido: row.contenido || 'hogar' });
      }
      setPickingSlots(slots);
    };

    load();

    const channel = supabase
      .channel('picking-pallets-santiago')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_pallets' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const prevContenidoRef = useRef<ContenidoSantiago>('Hogar');
  const formScrollRef    = useRef<HTMLDivElement>(null);
  const pickingSlotsRef  = useRef(pickingSlots);

  /* Keep ref in sync so form-init effect always reads latest picking without re-running */
  useEffect(() => { pickingSlotsRef.current = pickingSlots; }, [pickingSlots]);

  /* ── Derived ── */
  const localTodayCods  = getTiendasSantiagoHoy().map(t => t.cod);
  const sheetsAllCods   = [...sheetsTodayGrouped.rm, ...sheetsTodayGrouped.costa];
  const baseTodayCods   = sheetsAllCods.length > 0 ? sheetsAllCods : localTodayCods;
  const allTodayCods    = [...baseTodayCods, ...extraCods.filter(c => !baseTodayCods.includes(c))]
    .filter(c => !removedCods.includes(c));
  // Static takes priority over Supabase (more carefully maintained)
  const tiendaByCod     = { ...supabaseTiendasMap, ...Object.fromEntries(TIENDAS_SANTIAGO.map(t => [t.cod, t])) };
  const todayTiendas    = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t);
  const filtered        = Object.values(tiendaByCod).filter(t => {
    const inGrp = t.region === 'VR' ? selectedGrps.has('costa') : selectedGrps.has('rm');
    if (!inGrp) return false;
    const q = search.toLowerCase();
    return !q || t.tienda.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.comuna.toLowerCase().includes(q);
  });
  const filteredCodSet  = new Set(filtered.map(t => t.cod));
  const todayList  = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t && filteredCodSet.has(t.cod));
  const othersList = filtered.filter(t => !allTodayCods.includes(t.cod));

  const allItems           = Object.values(items).flat();
  const statP              = allItems.filter(i => i.tipo === 'Pallet').length;
  const statB              = allItems.filter(i => i.tipo === 'Bulto').length;
  const activeTiendasCount = Object.keys(items).filter(k => items[k].length > 0).length;
  const activeTiendas      = [
    ...allTodayCods.filter(c => (items[c] || []).length > 0).map(c => [c, items[c]] as [string, typeof items[string]]),
    ...Object.entries(items).filter(([c, it]) => it.length > 0 && !allTodayCods.includes(c)),
  ];
  const tiendaItems        = currentTienda ? (items[currentTienda.cod] || []) : [];
  const tiendaPallets      = tiendaItems.filter(i => i.tipo === 'Pallet').length;
  const tiendaBultos       = tiendaItems.filter(i => i.tipo === 'Bulto').length;

  const isChocolateBulto  = tipo === 'Bulto' && contenido === 'Chocolate';
  const isChocolateTipo   = tipo === 'Chocolate';
  const isContenedor      = tipo === 'Contenedor';
  const finalLargo = tipo === 'Pallet' ? 120 : isContenedor ? CONTENEDOR_LARGO : isChocolateTipo ? CHOCOLATE_DIMS.largo : isChocolateBulto ? CHOCOLATE_BULTO_DIMS.largo : (parseFloat(largo) || 0);
  const finalAncho = tipo === 'Pallet' ? 100 : isContenedor ? CONTENEDOR_ANCHO : isChocolateTipo ? CHOCOLATE_DIMS.ancho : isChocolateBulto ? CHOCOLATE_BULTO_DIMS.ancho : (parseFloat(ancho) || 0);
  const finalAlto  = isContenedor ? CONTENEDOR_ALTO : isChocolateTipo ? CHOCOLATE_DIMS.alto : isChocolateBulto ? CHOCOLATE_BULTO_DIMS.alto : (parseFloat(alto) || 0);
  const pesoV      = (finalAlto * finalLargo * finalAncho) / 6000;
  const canAdd     = !!peso && parseFloat(peso) > 0 &&
    (isChocolateBulto || isChocolateTipo || isContenedor || (
      !!alto && parseFloat(alto) > 0 &&
      (tipo === 'Pallet' || (!!largo && parseFloat(largo) > 0 && !!ancho && parseFloat(ancho) > 0))
    ));

  /* ── Resumen helpers ── */
  const buildSummaryString = () =>
    activeTiendas.map(([cod, it]) => {
      const p  = it.filter(i => i.tipo === 'Pallet').length;
      const b  = it.filter(i => i.tipo === 'Bulto').length;
      const c  = it.filter(i => i.tipo === 'Contenedor').length;
      const ch = it.filter(i => i.tipo === 'Chocolate').length;
      return `${cod}: ${[p > 0 ? `${p}P` : '', b > 0 ? `${b}B` : '', c > 0 ? `${c}C` : '', ch > 0 ? `${ch}CH` : ''].filter(Boolean).join('+')}`;
    }).join(', ');

  const registrar = () => {
    if (!activeTiendas.length) { showToast('No hay items para registrar', '#D97706'); return; }
    flushPending(); // persist data before writing to Sheets
    sheetsSantiagoWrite(items, regimen!);
    showToast(`✓ Registrado · ${buildSummaryString()}`, '#16A34A');
  };

  const enrutar = () => {
    const rutasInput = activeTiendas.map(([cod, it]) => ({
      c: cod,
      p: it.filter(i => i.tipo === 'Pallet').length,
      b: it.filter(i => i.tipo === 'Bulto').length,
    })).filter(t => t.p > 0 || t.b > 0);
    localStorage.setItem('rutasInput', JSON.stringify(rutasInput));
    sessionStorage.setItem('despacho_from', '/despacho/santiago');
    flushPending(); // push antes de navegar — evita que el debounce se cancele al salir
    router.push('/despacho');
  };

  const goToResumen = () => {
    dispatch({ type: 'CLEAR_TIENDA' });
    setView('resumen');
  };

  /* ── Calendar actions ── */
  const addToToday = (name: string) => {
    const t = Object.values(tiendaByCod).find(t => t.tienda === name); if (!t) return;
    const next = [...extraCods, t.cod];
    setExtraCods(next); localStorage.setItem(EXTRA_KEY, JSON.stringify(next));
    showToast(`✓ ${t.tienda} agregada a hoy`, '#16A34A');
  };
  const removeFromToday = (name: string) => {
    const t = Object.values(tiendaByCod).find(t => t.tienda === name); if (!t) return;
    const newExtra   = extraCods.filter(c => c !== t.cod);
    const newRemoved = [...removedCods, t.cod];
    setExtraCods(newExtra);     localStorage.setItem(EXTRA_KEY,   JSON.stringify(newExtra));
    setRemovedCods(newRemoved); localStorage.setItem(REMOVED_KEY, JSON.stringify(newRemoved));
    showToast(`${t.tienda} retirada de hoy`, '#D97706');
  };

  const selectTienda = (t: TiendaSantiago) => {
    dispatch({ type: 'SELECT_TIENDA', payload: t });
    const existing = items[t.cod] || [];
    const hasManualPreset = presets[t.cod] &&
      (presets[t.cod].pallets > 0 || presets[t.cod].bultos > 0 || (presets[t.cod].contenedores ?? 0) > 0 || (presets[t.cod].chocolates ?? 0) > 0);
    if (!hasManualPreset && existing.length === 0) {
      const slots = pickingSlots[t.cod] ?? [];
      const pkP   = slots.filter(s => s.tipo === 'P').length;
      const pkC   = slots.filter(s => s.tipo === 'C').length;
      const pkB   = slots.filter(s => s.tipo === 'B').length;
      const pkCH  = slots.filter(s => s.tipo === 'CH').length;
      const dc    = despachoCounts[t.cod];
      if (pkP > 0 || pkC > 0 || pkB > 0 || pkCH > 0) {
        setPresets(prev => ({ ...prev, [t.cod]: { pallets: pkP, bultos: pkB, contenedores: pkC, chocolates: pkCH } }));
      } else if (dc && (dc.p > 0 || dc.b > 0)) {
        setPresets(prev => ({ ...prev, [t.cod]: { pallets: dc.p, bultos: dc.b, contenedores: dc.c ?? 0, chocolates: 0 } }));
      }
    }
    setView('form');
  };

  /* ── Form effects ──
     Only re-runs when the selected tienda changes. Uses pickingSlotsRef (always current)
     so picking real-time updates do NOT retrigger this and wipe the user's in-progress form. */
  useEffect(() => {
    setTipo('Pallet'); setContenido('Hogar');
    setPeso(''); setAlto(''); setLargo(''); setAncho('');
    setEditingIdx(null);
    prevContenidoRef.current = 'Hogar';
    if (currentTienda) {
      setTimeout(() => formScrollRef.current?.scrollTo({ top: 0 }), 60);
      const existing = items[currentTienda.cod] || [];
      const slots    = pickingSlotsRef.current[currentTienda.cod] ?? [];

      const SANT_TIPO: Record<string, TipoCargamento>    = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate' };
      const SANT_CONT: Record<string, ContenidoSantiago> = { comida: 'Comida', hogar: 'Hogar', mixto: 'Mixto' };

      if (existing.length === 0 && slots.length > 0) {
        // Build rows from picking slots with contenido pre-filled
        const rows: FormRow[] = slots.map((s, i) => ({
          id:       `pick-${s.tipo}-${i}-${Date.now()}`,
          tipo:     SANT_TIPO[s.tipo]    ?? 'Pallet',
          contenido: SANT_CONT[s.contenido] ?? 'Hogar',
          peso: '', alto: '', largo: '', ancho: '',
        }));
        setFormRows(rows);
      } else if (existing.length === 0) {
        const preset = presets[currentTienda.cod];
        if (preset) {
          const rows: FormRow[] = [];
          for (let i = 0; i < Math.max(0, preset.pallets - existing.filter(x => x.tipo === 'Pallet').length); i++)
            rows.push({ id: `p${i}-${Date.now()}`,  tipo: 'Pallet',    contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          for (let i = 0; i < Math.max(0, preset.bultos - existing.filter(x => x.tipo === 'Bulto').length); i++)
            rows.push({ id: `b${i}-${Date.now()}`,  tipo: 'Bulto',     contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          for (let i = 0; i < Math.max(0, (preset.contenedores ?? 0) - existing.filter(x => x.tipo === 'Contenedor').length); i++)
            rows.push({ id: `c${i}-${Date.now()}`,  tipo: 'Contenedor',contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          for (let i = 0; i < Math.max(0, (preset.chocolates ?? 0) - existing.filter(x => x.tipo === 'Chocolate').length); i++)
            rows.push({ id: `ch${i}-${Date.now()}`, tipo: 'Chocolate', contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          setFormRows(rows);
        } else {
          setFormRows([]);
        }
      } else {
        setFormRows([]);
      }
    } else {
      setFormRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTienda?.cod]);

  useEffect(() => { setContenido('Hogar'); prevContenidoRef.current = 'Hogar'; }, [tipo]);

  useEffect(() => {
    const prev = prevContenidoRef.current;
    prevContenidoRef.current = contenido;
    if (contenido === 'Chocolate') {
      setPeso(String(CHOCOLATE_BULTO_DIMS.peso)); setAlto(String(CHOCOLATE_BULTO_DIMS.alto));
      setAncho(String(CHOCOLATE_BULTO_DIMS.ancho)); setLargo(String(CHOCOLATE_BULTO_DIMS.largo));
    } else if (prev === 'Chocolate') {
      setPeso(''); setAlto(''); setAncho(''); setLargo('');
    }
  }, [contenido]);

  /* ── Add / edit item ── */
  const saveItem = () => {
    if (!currentTienda || !canAdd || !regimen) return;
    const cod = currentTienda.cod;
    const existing = items[cod] || [];
    const pA = finalAlto;
    const pL = finalLargo;
    const pW = finalAncho;
    if (editingIdx !== null) {
      dispatch({
        type: 'EDIT_ITEM', tiendaCod: cod, idx: editingIdx,
        item: {
          ...existing[editingIdx], tipo, contenido,
          estado: ESTADO_DEFAULT,
          peso: parseFloat(peso), alto: pA, largo: pL, ancho: pW,
          pesoVolumetrico: Math.round(pesoV * 100) / 100,
        },
      });
      setEditingIdx(null); setPeso(''); setAlto(''); setLargo(''); setAncho('');
      showToast('✓ Item actualizado', '#16A34A'); return;
    }
    const pc  = existing.filter(i => i.tipo === 'Pallet').length;
    const bc  = existing.filter(i => i.tipo === 'Bulto').length;
    const cc  = existing.filter(i => i.tipo === 'Contenedor').length;
    const chc = existing.filter(i => i.tipo === 'Chocolate').length;
    const orden = tipo === 'Pallet' ? `P${pc + 1}` : tipo === 'Contenedor' ? `C${cc + 1}` : tipo === 'Chocolate' ? `CH${chc + 1}` : `${bc + 1}B`;
    dispatch({
      type: 'ADD_ITEM',
      item: {
        id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo, contenido,
        peso: parseFloat(peso), alto: pA, largo: pL, ancho: pW,
        pesoVolumetrico: Math.round(pesoV * 100) / 100, regimen,
        orden,
        estado: ESTADO_DEFAULT,
      },
    });
    setPeso(''); setAlto('');
    if (tipo === 'Bulto' && !isChocolateBulto || tipo === 'Chocolate') { setLargo(''); setAncho(''); }
    showToast(`✓ ${orden} agregado`, '#16A34A');
  };

  const startEdit = (idx: number) => {
    const item = tiendaItems[idx];
    setEditingIdx(idx); setTipo(item.tipo); setContenido(item.contenido);
    setPeso(String(item.peso)); setAlto(String(item.alto));
    if (item.tipo === 'Bulto') { setLargo(String(item.largo)); setAncho(String(item.ancho)); }
    formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditingIdx(null); setPeso(''); setAlto(''); setLargo(''); setAncho(''); };

  /* ── Combine items handler ── */
  const handleSantiagoCombineConfirm = (peso: number, alto: number, cod?: string) => {
    const tiendaCod = cod ?? currentTienda?.cod;
    if (!combineModal || !tiendaCod) return;
    const { srcIdx, tgtIdx } = combineModal;
    const allItems = items[tiendaCod] || [];
    const src = allItems[srcIdx];
    const tgt = allItems[tgtIdx];
    if (!src || !tgt) return;
    const contenido: ContenidoSantiago = src.contenido === tgt.contenido ? src.contenido : 'Mixto';
    const pesoVolumetrico = Math.round((alto * src.ancho * src.largo) / 5000);
    const merged: SantiagoItem = { ...src, id: `${tiendaCod}-${Date.now()}`, peso, alto, contenido, pesoVolumetrico };
    const higher = Math.max(srcIdx, tgtIdx);
    const lower  = Math.min(srcIdx, tgtIdx);
    const newList = allItems.filter((_, i) => i !== higher && i !== lower);
    newList.splice(lower, 0, merged);
    let pc = 0, bc = 0, cc = 0, chc = 0;
    const renumbered = newList.map(i => ({
      ...i,
      orden: i.tipo === 'Pallet' ? `P${++pc}` : i.tipo === 'Contenedor' ? `C${++cc}` : i.tipo === 'Chocolate' ? `CH${++chc}` : `${++bc}B`,
    }));
    dispatch({ type: 'SET_ITEMS', tiendaCod, items: renumbered });
    setCombineModal(null);
  };

  /* ── Preset bar ── */
  const updateInlinePreset = (field: 'pallets' | 'bultos' | 'contenedores' | 'chocolates', value: string) => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const n   = Math.max(0, parseInt(value) || 0);
    const curr = presets[cod] || { pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 };
    setPresets(prev => ({ ...prev, [cod]: { ...curr, [field]: n } }));
    const tipo2: TipoCargamento = field === 'pallets' ? 'Pallet' : field === 'contenedores' ? 'Contenedor' : field === 'chocolates' ? 'Chocolate' : 'Bulto';
    const existing = (items[cod] || []).filter(i => i.tipo === tipo2).length;
    const savedRows = formRows.filter(r => r.tipo === tipo2 && r.saved).length;
    const delta = (Math.max(0, n - existing - savedRows)) - formRows.filter(r => r.tipo === tipo2 && !r.saved).length;
    if (delta > 0) {
      const newRows: FormRow[] = [];
      for (let i = 0; i < delta; i++)
        newRows.push({ id: `row-${Date.now()}-${i}`, tipo: tipo2, contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '', saved: false });
      setFormRows(prev => [...prev, ...newRows]);
    } else if (delta < 0) {
      let toRemove = Math.abs(delta);
      setFormRows(prev => {
        const result = [...prev];
        for (let i = result.length - 1; i >= 0 && toRemove > 0; i--)
          if (result[i].tipo === tipo2 && !result[i].saved) { result.splice(i, 1); toRemove--; }
        return result;
      });
    }
  };

  const updateRow = (id: string, field: keyof FormRow, value: string) =>
    setFormRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'contenido' && value === 'Chocolate') {
        updated.alto = String(CHOCOLATE_BULTO_DIMS.alto);
        updated.largo = String(CHOCOLATE_BULTO_DIMS.largo);
        updated.ancho = String(CHOCOLATE_BULTO_DIMS.ancho);
      } else if (field === 'contenido' && r.contenido === 'Chocolate') {
        updated.alto = ''; updated.largo = ''; updated.ancho = '';
      }
      return updated;
    }));

  const saveRow = (row: FormRow) => {
    if (!currentTienda || !regimen) return;
    const p = parseFloat(row.peso); if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const isChoc     = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
    const isChocTipo = row.tipo === 'Chocolate';
    const isCont     = row.tipo === 'Contenedor';
    if (isChocTipo && p > CHOCOLATE_DIMS.pesoMax) { showToast(`⚠ Chocolate máx ${CHOCOLATE_DIMS.pesoMax} kg`, '#D32F2F'); return; }
    const a  = isCont ? CONTENEDOR_ALTO  : isChocTipo ? CHOCOLATE_DIMS.alto  : isChoc ? CHOCOLATE_BULTO_DIMS.alto  : (parseFloat(row.alto)  || 0);
    const fL = row.tipo === 'Pallet' ? 120 : isCont ? CONTENEDOR_LARGO : isChocTipo ? CHOCOLATE_DIMS.largo : (isChoc ? CHOCOLATE_BULTO_DIMS.largo : (parseFloat(row.largo) || 0));
    const fA = row.tipo === 'Pallet' ? 100 : isCont ? CONTENEDOR_ANCHO : isChocTipo ? CHOCOLATE_DIMS.ancho : (isChoc ? CHOCOLATE_BULTO_DIMS.ancho : (parseFloat(row.ancho) || 0));
    if (!isCont && !isChocTipo && !a) { showToast('Ingresa el alto', '#D97706'); return; }
    if (row.tipo === 'Bulto' && !isChoc && (!fL || !fA)) { showToast('Ingresa largo y ancho', '#D97706'); return; }
    const cod = currentTienda.cod;
    const existing = items[cod] || [];
    const pc  = existing.filter(i => i.tipo === 'Pallet').length + 1;
    const bc  = existing.filter(i => i.tipo === 'Bulto').length + 1;
    const cc  = existing.filter(i => i.tipo === 'Contenedor').length + 1;
    const chc = existing.filter(i => i.tipo === 'Chocolate').length + 1;
    const savedItem: SantiagoItem = {
      id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo: row.tipo, contenido: row.contenido,
      peso: p, alto: a, largo: fL, ancho: fA,
      pesoVolumetrico: Math.round((a * fL * fA) / 6000 * 100) / 100, regimen,
      orden: row.tipo === 'Pallet' ? `P${pc}` : row.tipo === 'Contenedor' ? `C${cc}` : row.tipo === 'Chocolate' ? `CH${chc}` : `${bc}B`,
      estado: ESTADO_DEFAULT,
    };
    dispatch({ type: 'ADD_ITEM', item: savedItem });
    setFormRows(prev => prev.map(r => r.id === row.id ? { ...r, saved: true, savedItem } : r));
    showToast(`✓ ${savedItem.orden} agregado`, '#16A34A');
  };

  const editSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (!row?.savedItem) return;
    const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === row.savedItem!.id);
    if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: false, savedItem: undefined } : r));
  };

  const deleteSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (row?.savedItem) {
      const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === row.savedItem!.id);
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
    }
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  const addFormRow = (t: TipoCargamento) =>
    setFormRows(prev => [...prev, { id: `row-${Date.now()}`, tipo: t, contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' }]);

  /* ── Resumen editing ── */
  const rStartEdit = (cod: string, idx: number) => {
    const item = (items[cod] || [])[idx];
    if (!item) return;
    setResumenEditing({ cod, idx, tipo: item.tipo, contenido: item.contenido, estado: item.estado,
      peso: String(item.peso), alto: String(item.alto), largo: String(item.largo), ancho: String(item.ancho) });
    setResumenExpanded(prev => { const next = new Set(prev); next.add(cod); return next; });
  };
  const rCancelEdit = () => setResumenEditing(null);
  const rSaveEdit = () => {
    if (!resumenEditing) return;
    const { cod, idx, tipo: rTipo, contenido: rContenido, estado: rEstado } = resumenEditing;
    const item = (items[cod] || [])[idx];
    const isChoc       = rTipo === 'Bulto'      && rContenido === 'Chocolate';
    const isContenedor = rTipo === 'Contenedor';
    const alto  = isContenedor ? CONTENEDOR_ALTO  : isChoc ? CHOCOLATE_DIMS.alto  : (parseInt(resumenEditing.alto)  || 0);
    const largo = isContenedor ? CONTENEDOR_LARGO : rTipo === 'Pallet' ? item.largo : (isChoc ? CHOCOLATE_DIMS.largo : (parseInt(resumenEditing.largo) || 0));
    const ancho = isContenedor ? CONTENEDOR_ANCHO : rTipo === 'Pallet' ? item.ancho : (isChoc ? CHOCOLATE_DIMS.ancho : (parseInt(resumenEditing.ancho) || 0));
    dispatch({
      type: 'EDIT_ITEM', tiendaCod: cod, idx,
      item: { ...item, tipo: rTipo, contenido: rContenido, estado: rEstado,
        peso: parseFloat(resumenEditing.peso) || 0, alto, largo, ancho,
        pesoVolumetrico: (alto * largo * ancho) / 6000 },
    });
    setResumenEditing(null);
    showToast('✓ Item actualizado', '#16A34A');
  };

  /* ════════════════════════════════════
     LEFT PANEL CONTENT
  ════════════════════════════════════ */
  const renderStoreGrid = () => (
    <div className="flex-1 overflow-y-auto">
      {todayList.length > 0 && (
        <div>
          <div className="px-3 py-2 bg-[rgba(211,47,47,0.10)] border-b border-[rgba(211,47,47,0.20)] sticky top-0 z-10 flex items-baseline gap-2">
            <span className="font-barlow-condensed text-[15px] font-extrabold uppercase tracking-widest text-red">HOY</span>
            <span className="font-barlow-condensed text-[10px] text-red/50 uppercase tracking-wide hidden sm:inline">toca × para retirar</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {todayList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlots[t.cod] ?? [];
              const pk = pkSlots.length > 0 ? { p: pkSlots.filter(s => s.tipo === 'P').length, c: pkSlots.filter(s => s.tipo === 'C').length, b: pkSlots.filter(s => s.tipo === 'B').length } : undefined;
              return (
                <TiendaGridCard key={t.cod} t={t}
                  isActive={currentTienda?.cod === t.cod} isToday
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  contenedorCount={tI.filter(i => i.tipo === 'Contenedor').length}
                  chocolateCount={tI.filter(i => i.tipo === 'Chocolate').length}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  hasGuide={!!guides[t.cod]}
                  onSelect={() => selectTienda(t)}
                  onRemoveFromToday={() => setConfirmRemove(t.tienda)} />
              );
            })}
          </div>
        </div>
      )}
      {othersList.length > 0 && (
        <div>
          <div className="px-3 py-2 bg-bg border-b border-border sticky top-0 z-10 flex items-baseline gap-2">
            <span className="font-barlow-condensed text-[13px] font-bold uppercase tracking-widest text-text-3">Todas</span>
            <span className="font-barlow-condensed text-[10px] text-text-3/50 uppercase tracking-wide hidden sm:inline">toca + para agregar a hoy</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {othersList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlots[t.cod] ?? [];
              const pk = pkSlots.length > 0 ? { p: pkSlots.filter(s => s.tipo === 'P').length, c: pkSlots.filter(s => s.tipo === 'C').length, b: pkSlots.filter(s => s.tipo === 'B').length } : undefined;
              return (
                <TiendaGridCard key={t.cod} t={t}
                  isActive={currentTienda?.cod === t.cod} isToday={false}
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  contenedorCount={tI.filter(i => i.tipo === 'Contenedor').length}
                  chocolateCount={tI.filter(i => i.tipo === 'Chocolate').length}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  hasGuide={!!guides[t.cod]}
                  onSelect={() => selectTienda(t)}
                  onAddToday={() => setConfirmAdd(t.tienda)} />
              );
            })}
          </div>
        </div>
      )}
      {filtered.length === 0 && (
        <div className="py-16 text-center text-text-3">
          <div className="text-3xl mb-2 opacity-20">🏪</div>
          <p className="text-[13px] opacity-60">Sin resultados</p>
        </div>
      )}
    </div>
  );

  const renderStatsBar = () => (
    <div className="flex-shrink-0 bg-navy border-t-4 border-red">
      <div className="flex">
        {[
          { v: statP, l: 'Pallets', color: '#93C5FD' },
          { v: statB, l: 'Bultos',  color: '#FCD34D' },
          { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' },
        ].map(({ v, l, color }, i) => (
          <div key={l} className={`flex-1 py-2.5 text-center ${i < 2 ? 'border-r border-white/10' : ''}`}>
            <div className="font-barlow-condensed text-[26px] font-bold leading-none" style={{ color }}>{v}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3 pt-1 flex gap-2">
        {activeTiendasCount > 0 && (
          <button onClick={goToResumen}
            className="flex-1 py-2.5 bg-red text-white rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer active:bg-red-dark lg:hidden"
            style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.30)' }}>
            Ver resumen ({activeTiendasCount}) →
          </button>
        )}
        <button onClick={enrutar}
          className="flex-shrink-0 lg:flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95"
          style={{ background: 'rgba(211,47,47,0.10)', border: '1px solid rgba(211,47,47,0.50)' }}
          title="Ir al Enrutador">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{
                 background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
                 boxShadow: '0 3px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
               }}>
            <Navigation size={14} color="#fff" strokeWidth={2} />
          </div>
          <span className="hidden lg:inline font-barlow-condensed text-[15px] font-bold tracking-widest uppercase" style={{ color: '#B91C1C' }}>Enrutador</span>
        </button>
      </div>
    </div>
  );

  /* ════════════════════════════════════
     RESUMEN PANEL (mobile + desktop right)
  ════════════════════════════════════ */
  const renderResumenPanel = () => {
    const doneTiendas    = todayTiendas.filter(t => (items[t.cod] || []).length > 0);
    const pendingTiendas = todayTiendas.filter(t => !(items[t.cod] || []).length);

    const INPUT_CLS = 'w-full border border-border rounded-btn px-2 py-2 text-[13px] font-mono text-navy bg-white';
    const LABEL_CLS = 'text-[9px] text-text-3 mb-0.5 uppercase tracking-wide';

    return (
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Desktop header (stats + progress) */}
        <div className="hidden lg:block bg-navy px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-barlow-condensed text-[11px] uppercase tracking-widest text-white/40">Resumen en tiempo real</span>
            <div className="flex items-center gap-2">
              {activeTiendasCount > 1 && (
                <button
                  onClick={() => {
                    const allCods = activeTiendas.map(([c]) => c);
                    setResumenExpanded(resumenExpanded.size === allCods.length ? new Set() : new Set(allCods));
                  }}
                  className="font-barlow-condensed text-[11px] font-bold text-white/50 hover:text-white/90 cursor-pointer transition-colors">
                  {resumenExpanded.size === activeTiendasCount ? '▲ Colapsar' : '▼ Ver todo'}
                </button>
              )}
              {todayTiendas.length > 0 && pendingTiendas.length === 0 && (
                <span className="font-barlow-condensed text-[12px] font-bold text-[#86EFAC] bg-[rgba(134,239,172,0.15)] px-2 py-0.5 rounded-full">✓ Hoy completo</span>
              )}
              {activeTiendasCount > 0 && (
                <button onClick={enrutar}
                  className="font-barlow-condensed text-[12px] font-bold text-white bg-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.25)] px-2.5 py-1 rounded-full transition-all"
                  title="Enrutar">
                  🗺️ Enrutar
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-5 mb-2">
            {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }) => (
              <div key={l} className="text-center">
                <div className="font-barlow-condensed text-[24px] font-extrabold leading-none" style={{ color }}>{v}</div>
                <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
              </div>
            ))}
          </div>
          {todayTiendas.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                <span>{doneTiendas.length}/{todayTiendas.length} tiendas HOY</span>
                <span>{pendingTiendas.length > 0 ? `${pendingTiendas.length} pendiente${pendingTiendas.length > 1 ? 's' : ''}` : 'Todo registrado'}</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#86EFAC] rounded-full transition-all duration-500"
                  style={{ width: `${todayTiendas.length > 0 ? (doneTiendas.length / todayTiendas.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Mobile stats strip */}
        <div className="lg:hidden bg-navy flex items-center flex-shrink-0">
          {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }, i) => (
            <div key={l} className={`flex-1 py-3 text-center ${i < 2 ? 'border-r border-white/10' : ''}`}>
              <div className="font-barlow-condensed text-[26px] font-bold leading-none" style={{ color }}>{v}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
            </div>
          ))}
        </div>

        {/* Summary string */}
        {activeTiendas.length > 0 && (
          <div className="mx-3 mt-3 mb-1 bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.25)] rounded-xl px-3 py-2 flex-shrink-0">
            <div className="font-barlow-condensed text-[10px] uppercase tracking-widest text-success mb-0.5">Resumen despacho</div>
            <div className="font-barlow-condensed text-[14px] font-bold text-navy leading-snug">{buildSummaryString()}</div>
          </div>
        )}

        {/* Accordion */}
        <div className="flex-1 overflow-y-auto">
          {activeTiendas.length === 0 ? (
            <div className="py-16 text-center text-text-3">
              <div className="text-4xl mb-3 opacity-20">📋</div>
              <p className="text-[13px] opacity-50">Sin items registrados aún</p>
            </div>
          ) : (
            activeTiendas.map(([cod, it]) => {
              const t           = getTiendaSantiagoByCod(cod);
              const pallets     = it.filter(i => i.tipo === 'Pallet').length;
              const bultos      = it.filter(i => i.tipo === 'Bulto').length;
              const contenedores = it.filter(i => i.tipo === 'Contenedor').length;
              const isOpen      = resumenExpanded.has(cod);
              const totalPeso = it.reduce((s, i) => s + i.peso, 0);

              return (
                <div key={cod} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>
                  <div
                    onClick={() => { rCancelEdit(); toggleResumenExpanded(cod); }}
                    className={`flex items-center gap-2.5 px-3 py-3 cursor-pointer transition-all active:bg-bg ${isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'}`}>
                    <div className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded min-w-[42px] text-center flex-shrink-0">{formatCod(cod)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-navy truncate leading-tight">{t?.tienda || cod}</div>
                      <div className="text-[11px] text-text-3 truncate">{t?.comuna} · {t?.ventanaHoraria}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {pallets     > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-info bg-[rgba(37,99,235,0.10)] border border-[rgba(37,99,235,0.20)] px-2 py-0.5 rounded-full">{pallets}P</span>}
                      {bultos      > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-warn bg-[rgba(217,119,6,0.10)] border border-[rgba(217,119,6,0.20)] px-2 py-0.5 rounded-full">{bultos}B</span>}
                      {contenedores > 0 && <span className="font-barlow-condensed text-[13px] font-bold px-2 py-0.5 rounded-full border" style={{ color:'#6B21A8', background:'rgba(107,33,168,0.10)', borderColor:'rgba(107,33,168,0.20)' }}>{contenedores}C</span>}
                      <span className="text-text-3 text-[12px] ml-0.5">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-bg border-b border-border">
                        <div className="font-mono text-[11px] text-text-3 flex-1">
                          {it.length} item{it.length > 1 ? 's' : ''} · {totalPeso.toLocaleString('es-CL')} kg
                        </div>
                      </div>

                      {it.map((item, idx) => {
                        const isEditing = resumenEditing?.cod === cod && resumenEditing?.idx === idx;
                        const re = resumenEditing;
                        const rIsChoc = re?.tipo === 'Bulto' && re?.contenido === 'Chocolate';

                        if (isEditing && re) {
                          return (
                            <div key={item.id} className="border-l-4 border-info bg-[rgba(37,99,235,0.04)] border-b border-border/40">
                              <div className="px-3 pt-3 pb-3">
                                {/* Tipo */}
                                <div className="mb-2.5">
                                  <div className={LABEL_CLS}>Tipo</div>
                                  <div className="flex gap-2 mt-1">
                                    {(['Pallet', 'Bulto', 'Contenedor'] as TipoCargamento[]).map(tp => (
                                      <button key={tp}
                                        onClick={() => setResumenEditing(prev => prev ? { ...prev, tipo: tp, contenido: tp === 'Pallet' ? 'Comida' : tp === 'Contenedor' ? 'Hogar' : 'Hogar' } : prev)}
                                        className={`flex-1 font-barlow-condensed text-[14px] font-bold py-2 rounded-full border transition-all ${
                                          re.tipo === tp
                                            ? tp === 'Pallet'     ? 'bg-info text-white border-info'
                                            : tp === 'Contenedor' ? 'bg-[#6B21A8] text-white border-[#6B21A8]'
                                            : 'bg-warn text-white border-warn'
                                            : 'bg-white text-text-2 border-border'
                                        }`}>{tp}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* Contenido */}
                                <div className="mb-2.5">
                                  <div className={LABEL_CLS}>Contenido</div>
                                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                                    {(re.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                                      <button key={c}
                                        onClick={() => setResumenEditing(prev => prev ? { ...prev, contenido: c } : prev)}
                                        className={`font-barlow-condensed text-[13px] font-bold py-2 rounded-full border transition-all ${
                                          re.contenido === c ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'
                                        }`}>{c}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* Estado — solo Pallet */}
                                {re.tipo === 'Pallet' && (
                                  <div className="mb-2.5">
                                    <div className={LABEL_CLS}>Estado</div>
                                    <select value={re.estado}
                                      onChange={e => setResumenEditing(prev => prev ? { ...prev, estado: e.target.value as EstadoItem } : prev)}
                                      className="w-full border border-border rounded-btn px-2 py-2.5 text-[13px] text-navy bg-white mt-0.5">
                                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                  </div>
                                )}
                                {/* Dimensiones */}
                                <div className={`grid gap-2 mb-3 ${re.tipo === 'Bulto' && !rIsChoc ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                  <div>
                                    <div className={LABEL_CLS}>Peso kg</div>
                                    <input type="number" value={re.peso}
                                      onChange={e => setResumenEditing(prev => prev ? { ...prev, peso: e.target.value } : prev)}
                                      className={INPUT_CLS} step="0.1" />
                                  </div>
                                  {!rIsChoc && (
                                    <div>
                                      <div className={LABEL_CLS}>Alto cm</div>
                                      <input type="number" value={re.alto}
                                        onChange={e => setResumenEditing(prev => prev ? { ...prev, alto: e.target.value } : prev)}
                                        className={INPUT_CLS} />
                                    </div>
                                  )}
                                  {re.tipo === 'Bulto' && !rIsChoc && (
                                    <>
                                      <div>
                                        <div className={LABEL_CLS}>Largo cm</div>
                                        <input type="number" value={re.largo}
                                          onChange={e => setResumenEditing(prev => prev ? { ...prev, largo: e.target.value } : prev)}
                                          className={INPUT_CLS} />
                                      </div>
                                      <div>
                                        <div className={LABEL_CLS}>Ancho cm</div>
                                        <input type="number" value={re.ancho}
                                          onChange={e => setResumenEditing(prev => prev ? { ...prev, ancho: e.target.value } : prev)}
                                          className={INPUT_CLS} />
                                      </div>
                                    </>
                                  )}
                                  {rIsChoc && (
                                    <div className="text-[11px] text-text-3 bg-bg border border-border rounded-btn px-2 py-2 self-end">
                                      {CHOCOLATE_DIMS.alto}×{CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho} cm
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={rSaveEdit}
                                    className="flex-1 py-3 bg-info text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold cursor-pointer active:opacity-80">
                                    ✓ Guardar
                                  </button>
                                  <button onClick={rCancelEdit}
                                    className="px-5 py-3 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[15px] cursor-pointer active:bg-bg-3">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const isRDrop    = rDragIdx !== null && rDragCod === cod && rDropIdx === idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo;
                        const isRDragging = rDragCod === cod && rDragIdx === idx;
                        return (
                          <div
                            key={item.id}
                            data-r-item-idx={idx}
                            data-r-item-cod={cod}
                            draggable
                            onDragStart={() => { setRDragIdx(idx); setRDragCod(cod); }}
                            onDragOver={(e) => {
                              if (rDragIdx !== null && rDragCod === cod && rDragIdx !== idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo)
                                { e.preventDefault(); setRDropIdx(idx); }
                            }}
                            onDragLeave={() => setRDropIdx(prev => prev === idx ? null : prev)}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (rDragIdx !== null && rDragCod === cod && rDragIdx !== idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo)
                                setCombineModal({ srcIdx: rDragIdx, tgtIdx: idx, cod });
                              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
                            }}
                            onDragEnd={() => { setRDragIdx(null); setRDropIdx(null); setRDragCod(null); }}
                            onTouchStart={(e) => {
                              const t = e.touches[0];
                              (e.currentTarget as HTMLElement).dataset.txS = String(t.clientX);
                              (e.currentTarget as HTMLElement).dataset.tyS = String(t.clientY);
                              rLongPressRef.current = setTimeout(() => { setRDragIdx(idx); setRDragCod(cod); navigator.vibrate?.(25); }, 220);
                            }}
                            onTouchMove={(e) => {
                              const t = e.touches[0];
                              const el = e.currentTarget as HTMLElement;
                              if (rLongPressRef.current && (Math.abs(t.clientX - parseFloat(el.dataset.txS ?? '0')) > 8 || Math.abs(t.clientY - parseFloat(el.dataset.tyS ?? '0')) > 8))
                                { clearTimeout(rLongPressRef.current); rLongPressRef.current = null; }
                              if (rDragIdx === null) return;
                              e.preventDefault();
                              const under = document.elementFromPoint(t.clientX, t.clientY);
                              const itemEl = under?.closest('[data-r-item-idx]') as HTMLElement | null;
                              const tgt = itemEl ? parseInt(itemEl.dataset.rItemIdx ?? '-1') : -1;
                              const tgtCod = itemEl?.dataset.rItemCod;
                              setRDropIdx(tgt !== -1 && tgt !== rDragIdx && tgtCod === cod ? tgt : null);
                            }}
                            onTouchEnd={(e) => {
                              if (rLongPressRef.current) { clearTimeout(rLongPressRef.current); rLongPressRef.current = null; }
                              if (rDragIdx === null) return;
                              e.preventDefault();
                              const t = e.changedTouches[0];
                              const under = document.elementFromPoint(t.clientX, t.clientY);
                              const itemEl = under?.closest('[data-r-item-idx]') as HTMLElement | null;
                              const tgt = itemEl ? parseInt(itemEl.dataset.rItemIdx ?? '-1') : -1;
                              const tgtCod = itemEl?.dataset.rItemCod;
                              if (tgt !== -1 && tgt !== rDragIdx && tgtCod === cod && (items[cod]?.[rDragIdx])?.tipo === (items[cod]?.[tgt])?.tipo)
                                setCombineModal({ srcIdx: rDragIdx, tgtIdx: tgt, cod });
                              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
                            }}
                            className={[
                              'flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-b-0 transition-all select-none',
                              isRDragging ? 'opacity-40 bg-bg' : isRDrop ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'bg-white',
                              rDragIdx !== null && rDragCod === cod ? 'cursor-grabbing' : 'cursor-grab',
                            ].join(' ')}
                          >
                            <GripVertical size={12} color="#CBD5E1" className="flex-shrink-0" />
                            <span className={`font-barlow-condensed text-[13px] font-bold min-w-[32px] ${item.tipo === 'Pallet' ? 'text-info' : 'text-warn'}`}>{item.orden}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed ${item.tipo === 'Pallet' ? 'text-info bg-[rgba(37,99,235,0.10)]' : 'text-warn bg-[rgba(217,119,6,0.10)]'}`}>
                                  {item.tipo}
                                </span>
                                <span className="text-[12px] font-semibold text-text-2">{item.contenido}</span>
                                <span className="text-[12px] font-bold text-navy">{item.peso}kg</span>
                              </div>
                              <div className="text-[11px] text-text-3 mt-0.5 truncate">
                                {item.tipo === 'Bulto' && item.contenido === 'Chocolate'
                                  ? `${CHOCOLATE_DIMS.alto}×${CHOCOLATE_DIMS.largo}×${CHOCOLATE_DIMS.ancho} cm`
                                  : `${item.alto}cm${item.tipo === 'Bulto' ? ` · ${item.largo}×${item.ancho}cm` : ' · 120×100cm'}`
                                }
                                {' · '}{item.estado.split(' ').slice(0, 2).join(' ')}
                              </div>
                            </div>
                            <button onClick={() => rStartEdit(cod, idx)}
                              className="border border-border text-text-3 bg-bg-2 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] active:text-info flex-shrink-0">
                              ✎
                            </button>
                            <button onClick={() => { dispatch({ type: 'DELETE_ITEM', tiendaCod: cod, idx }); showToast(`${item.orden} eliminado`, '#D97706'); }}
                              className="border-none text-text-3 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] bg-bg-2 active:text-red flex-shrink-0">
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom action bar */}
        <div className="flex-shrink-0 bg-white border-t border-border px-3 py-2.5 flex gap-2"
             style={{ boxShadow: '0 -4px 16px rgba(26,37,80,0.10)' }}>
          <button
            onClick={() => setView('list')}
            className="lg:hidden w-12 flex items-center justify-center py-3.5 bg-bg-2 text-text-2 border border-border rounded-card text-[18px] cursor-pointer active:bg-bg-3"
            title="Volver">←</button>
          <button onClick={registrar} disabled={activeTiendas.length === 0}
            className="flex-1 py-3.5 bg-red text-white border-none rounded-card font-barlow-condensed text-[18px] font-bold tracking-wide cursor-pointer disabled:opacity-30 transition-all active:bg-red-dark"
            style={{ boxShadow: activeTiendas.length > 0 ? '0 4px 16px rgba(211,47,47,0.30)' : 'none' }}>
            ↑ Registrar despacho
          </button>
          {activeTiendas.length > 0 && (
            <button onClick={enrutar}
              className="w-12 flex items-center justify-center py-3.5 bg-navy text-white border-none rounded-card text-[18px] cursor-pointer active:bg-navy-dark transition-all"
              style={{ boxShadow: '0 4px 14px rgba(26,37,80,0.30)' }}
              title="Enrutar">🗺️</button>
          )}
          <button
            onClick={() => { if (confirm('¿Iniciar nuevo despacho? Los datos actuales se perderán.')) dispatch({ type: 'RESET' }); }}
            className="w-12 flex items-center justify-center py-3.5 bg-bg-2 text-text-2 border border-border rounded-card text-[18px] cursor-pointer active:bg-bg-3"
            title="Nuevo despacho">🗑</button>
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════
     RIGHT PANEL — MULTI-FORM
  ════════════════════════════════════ */
  const renderMultiForm = () => {
    if (!currentTienda) return null;
    const currentPreset = presets[currentTienda.cod] || { pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 };
    const pkSlots = pickingSlots[currentTienda.cod] ?? [];
    const pkRef = pkSlots.length > 0 ? { p: pkSlots.filter(s => s.tipo === 'P').length, c: pkSlots.filter(s => s.tipo === 'C').length, b: pkSlots.filter(s => s.tipo === 'B').length, ch: pkSlots.filter(s => s.tipo === 'CH').length } : null;
    const hasPickingRef = pkRef && (pkRef.p > 0 || pkRef.c > 0 || pkRef.b > 0 || pkRef.ch > 0);
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} />

        <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-2 flex-wrap">
          <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3">Cantidad</span>
          {hasPickingRef && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(26,37,80,0.07)', color: 'rgba(26,37,80,0.45)' }}>
              picking {pkRef.p}P {pkRef.c > 0 ? `${pkRef.c}C ` : ''}{pkRef.b > 0 ? `${pkRef.b}B ` : ''}{pkRef.ch > 0 ? `${pkRef.ch}CH` : ''}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold text-info">P</span>
              <input type="number" min="0" max="30"
                value={currentPreset.pallets || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('pallets', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-info [-webkit-appearance:none]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold" style={{ color: '#6B21A8' }}>C</span>
              <input type="number" min="0" max="30"
                value={currentPreset.contenedores || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('contenedores', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none [-webkit-appearance:none]"
                style={{ outlineColor: '#6B21A8' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold text-warn">B</span>
              <input type="number" min="0" max="30"
                value={currentPreset.bultos || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('bultos', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-warn [-webkit-appearance:none]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold" style={{ color: '#92400E' }}>CH</span>
              <input type="number" min="0" max="30"
                value={currentPreset.chocolates || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('chocolates', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none [-webkit-appearance:none]"
                style={{ outlineColor: '#92400E' }} />
            </div>
          </div>
        </div>

        <div ref={formScrollRef} className="flex-1 overflow-y-auto px-2 py-2">
          <div className="grid grid-cols-2 gap-2 mb-2">
            {formRows.map(row => {
              if (row.saved && row.savedItem) {
                return (
                  <div key={row.id} className={`bg-white rounded-xl border-2 p-2.5 ${row.tipo === 'Pallet' ? 'border-[rgba(37,99,235,0.40)]' : row.tipo === 'Contenedor' ? 'border-[rgba(107,33,168,0.40)]' : row.tipo === 'Chocolate' ? 'border-[rgba(146,64,14,0.40)]' : 'border-[rgba(217,119,6,0.40)]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-barlow-condensed text-[15px] font-extrabold ${row.tipo === 'Pallet' ? 'text-info' : row.tipo === 'Contenedor' ? 'text-[#6B21A8]' : row.tipo === 'Chocolate' ? 'text-[#92400E]' : 'text-warn'}`}>{row.savedItem.orden}</span>
                      <div className="flex gap-1">
                        <button onClick={() => editSavedRow(row.id)} className="text-[13px] text-text-3 active:text-info cursor-pointer border-none bg-transparent p-1">✎</button>
                        <button onClick={() => deleteSavedRow(row.id)} className="text-[13px] text-text-3 active:text-red cursor-pointer border-none bg-transparent p-1">✕</button>
                      </div>
                    </div>
                    <div className="text-[12px] text-text-2 space-y-0.5 mb-2">
                      <div className="font-semibold">{row.savedItem.peso}kg · {row.savedItem.alto}cm</div>
                      <div className="text-text-3">{row.savedItem.contenido}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-[11px] text-success font-bold">Agregado</span>
                    </div>
                  </div>
                );
              }
              const isChocRow  = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
              const isChocTipo = row.tipo === 'Chocolate';
              const isContRow  = row.tipo === 'Contenedor';
              const canSaveRow = parseFloat(row.peso) > 0 &&
                (isChocRow || isChocTipo || isContRow || (parseFloat(row.alto) > 0 &&
                  (row.tipo === 'Pallet' || (parseFloat(row.largo) > 0 && parseFloat(row.ancho) > 0))));
              return (
                <div key={row.id} className={`bg-white rounded-xl border px-2 py-2.5 ${row.tipo === 'Pallet' ? 'border-[rgba(37,99,235,0.25)]' : isContRow ? 'border-[rgba(107,33,168,0.25)]' : isChocTipo ? 'border-[rgba(146,64,14,0.25)]' : 'border-[rgba(217,119,6,0.25)]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-barlow-condensed text-[13px] font-bold ${row.tipo === 'Pallet' ? 'text-info' : isContRow ? 'text-[#6B21A8]' : isChocTipo ? 'text-[#92400E]' : 'text-warn'}`}>{isChocTipo ? 'CH' : row.tipo}</span>
                    <button onClick={() => setFormRows(prev => prev.filter(r => r.id !== row.id))} className="text-text-3 active:text-red cursor-pointer border-none bg-transparent text-[13px]">✕</button>
                  </div>
                  {!isContRow && !isChocTipo && (
                  <div className="flex gap-0.5 mb-2">
                    {(row.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                      <button key={c} onClick={() => updateRow(row.id, 'contenido', c)}
                        className={`flex-1 py-1 rounded border text-[9px] font-bold cursor-pointer transition-all ${row.contenido === c ? 'bg-[rgba(37,99,235,0.10)] border-info text-info' : 'border-border bg-bg-2 text-text-3'}`}>
                        {c.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  )}
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    <div>
                      <label className="text-[9px] text-text-3 uppercase block mb-0.5">peso</label>
                      <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)}
                        placeholder="kg" inputMode="decimal"
                        className="w-full bg-white border border-border rounded px-1.5 py-1.5 text-text font-barlow text-[13px] outline-none focus:border-red [-webkit-appearance:none]" />
                    </div>
                    {!isChocRow && !isContRow && !isChocTipo && (
                      <div>
                        <label className="text-[9px] text-text-3 uppercase block mb-0.5">alto</label>
                        <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)}
                          placeholder="cm" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-1.5 py-1.5 text-text font-barlow text-[13px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                    )}
                  </div>
                  {row.tipo === 'Bulto' && !isChocRow && (
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      {(['largo', 'ancho'] as const).map(f => (
                        <div key={f}>
                          <label className="text-[9px] text-text-3 uppercase block mb-0.5">{f}</label>
                          <input type="number" value={row[f]} onChange={e => updateRow(row.id, f, e.target.value)}
                            placeholder="cm" inputMode="decimal"
                            className="w-full bg-white border border-border rounded px-1.5 py-1.5 text-text font-barlow text-[13px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                      ))}
                    </div>
                  )}
                  {row.tipo === 'Pallet' && (
                    <div className="mb-1.5 text-[9px] text-info bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded px-1.5 py-1">120×100 cm</div>
                  )}
                  {isChocRow && (
                    <div className="mb-1.5 text-[9px] text-navy/60 bg-bg border border-border rounded px-1.5 py-1">
                      {CHOCOLATE_DIMS.alto}×{CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho} cm · fijas
                    </div>
                  )}
                  {isContRow && (
                    <div className="mb-1.5 text-[9px] text-[#6B21A8] bg-[rgba(107,33,168,0.06)] border border-[rgba(107,33,168,0.15)] rounded px-1.5 py-1">
                      110×80×150 cm · fijas
                    </div>
                  )}
                  {isChocTipo && (
                    <div className="mb-1.5 text-[9px] bg-[rgba(146,64,14,0.06)] border border-[rgba(146,64,14,0.15)] rounded px-1.5 py-1" style={{ color: '#92400E' }}>
                      {CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho}×{CHOCOLATE_DIMS.alto} cm · fijas · máx {CHOCOLATE_DIMS.pesoMax} kg
                    </div>
                  )}
                  <button onClick={() => saveRow(row)} disabled={!canSaveRow}
                    className={`w-full py-2 text-white border-none rounded font-barlow-condensed text-[13px] font-bold cursor-pointer disabled:opacity-30 ${row.tipo === 'Pallet' ? 'bg-info' : isContRow ? 'bg-[#6B21A8]' : isChocTipo ? 'bg-[#92400E]' : 'bg-warn'}`}>
                    + Agregar
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pb-2">
            <button onClick={() => addFormRow('Pallet')}     className="flex-1 py-2.5 border-2 border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Pallet</button>
            <button onClick={() => addFormRow('Bulto')}      className="flex-1 py-2.5 border-2 border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Bulto</button>
            <button onClick={() => addFormRow('Contenedor')} className="flex-1 py-2.5 border-2 border-dashed border-[#6B21A8]/50 text-[#6B21A8] rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Cont.</button>
            <button onClick={() => addFormRow('Chocolate')}  className="flex-1 py-2.5 border-2 border-dashed rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer" style={{ borderColor: 'rgba(146,64,14,0.50)', color: '#92400E' }}>+ Choc.</button>
          </div>
          {activeTiendasCount > 0 && (
            <button onClick={goToResumen}
              className="w-full py-3.5 bg-navy text-white border-none rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer active:bg-navy-dark mb-4 lg:hidden"
              style={{ boxShadow: '0 4px 14px rgba(26,37,80,0.22)' }}>
              Ver resumen ({activeTiendasCount}) →
            </button>
          )}
          <div className="h-4" />
        </div>
      </>
    );
  };

  /* ════════════════════════════════════
     RIGHT PANEL — SINGLE ITEM FORM
  ════════════════════════════════════ */
  const renderSingleForm = () => {
    if (!currentTienda) return null;
    const currentPreset = presets[currentTienda.cod] || { pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 };
    const pkSlots = pickingSlots[currentTienda.cod] ?? [];
    const pkRef = pkSlots.length > 0 ? { p: pkSlots.filter(s => s.tipo === 'P').length, c: pkSlots.filter(s => s.tipo === 'C').length, b: pkSlots.filter(s => s.tipo === 'B').length, ch: pkSlots.filter(s => s.tipo === 'CH').length } : null;
    const hasPickingRef = pkRef && (pkRef.p > 0 || pkRef.c > 0 || pkRef.b > 0 || pkRef.ch > 0);
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} />

        <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-2 flex-wrap">
          <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3">Cantidad</span>
          {hasPickingRef && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(26,37,80,0.07)', color: 'rgba(26,37,80,0.45)' }}>
              picking {pkRef.p}P {pkRef.c > 0 ? `${pkRef.c}C ` : ''}{pkRef.b > 0 ? `${pkRef.b}B ` : ''}{pkRef.ch > 0 ? `${pkRef.ch}CH` : ''}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold text-info">P</span>
              <input type="number" min="0" max="30"
                value={currentPreset.pallets || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('pallets', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-info [-webkit-appearance:none]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold" style={{ color: '#6B21A8' }}>C</span>
              <input type="number" min="0" max="30"
                value={currentPreset.contenedores || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('contenedores', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none [-webkit-appearance:none]"
                style={{ outlineColor: '#6B21A8' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold text-warn">B</span>
              <input type="number" min="0" max="30"
                value={currentPreset.bultos || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('bultos', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-warn [-webkit-appearance:none]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-barlow-condensed text-[13px] font-bold" style={{ color: '#92400E' }}>CH</span>
              <input type="number" min="0" max="30"
                value={currentPreset.chocolates || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset('chocolates', e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none [-webkit-appearance:none]"
                style={{ outlineColor: '#92400E' }} />
            </div>
          </div>
        </div>

        <div ref={formScrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {editingIdx !== null && (
            <div className="bg-[rgba(37,99,235,0.07)] border border-[rgba(37,99,235,0.25)] rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-info">Editando item #{editingIdx + 1}</span>
              <button onClick={cancelEdit} className="text-[13px] text-text-3 cursor-pointer border-none bg-none active:text-red">✕ Cancelar</button>
            </div>
          )}

          {/* Tipo */}
          <div className="flex gap-2 flex-wrap">
            {(['Pallet', 'Bulto', 'Contenedor', 'Chocolate'] as TipoCargamento[]).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex-1 py-3 lg:py-2.5 rounded-btn font-barlow-condensed text-[17px] lg:text-[15px] font-bold cursor-pointer border-2 transition-all ${
                  tipo === t
                    ? t === 'Pallet'     ? 'bg-[rgba(37,99,235,0.10)] border-info text-info'
                    : t === 'Contenedor' ? 'bg-[rgba(107,33,168,0.10)] border-[#6B21A8] text-[#6B21A8]'
                    : t === 'Chocolate'  ? 'bg-[rgba(146,64,14,0.10)] border-[#92400E] text-[#92400E]'
                    :                     'bg-[rgba(217,119,6,0.10)] border-warn text-warn'
                    : 'bg-white border-border text-text-2'
                }`}>
                {t === 'Contenedor' ? 'Cont.' : t === 'Chocolate' ? 'Choc. CH' : t}
              </button>
            ))}
          </div>
          {tipo === 'Contenedor' && (
            <div className="text-[11px] text-[#6B21A8] font-semibold px-1">
              Dims. fijas: {CONTENEDOR_LARGO}×{CONTENEDOR_ANCHO}×{CONTENEDOR_ALTO} cm (largo×ancho×alto)
            </div>
          )}

          {/* Contenido */}
          <div className="flex gap-2">
            {(tipo === 'Pallet' ? CONTENIDO_PALLET : tipo === 'Contenedor' ? CONTENIDO_CONTENEDOR : CONTENIDO_BULTO).map(c => (
              <button key={c} onClick={() => setContenido(c)}
                className={`flex-1 py-2.5 lg:py-2 rounded-btn font-barlow text-[14px] lg:text-[13px] font-semibold cursor-pointer border-2 transition-all ${
                  contenido === c ? 'bg-[rgba(37,99,235,0.12)] border-info text-info' : 'bg-white border-border text-text-2'
                }`}>
                {c}
              </button>
            ))}
          </div>

          {/* Peso */}
          <div>
            <label className="text-[12px] text-text-3 font-semibold uppercase tracking-wide block mb-1.5">Peso (kg)</label>
            <input type="number" inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} placeholder="0"
              className="w-full bg-white border-2 border-border rounded-btn px-3 py-3 lg:py-2.5 text-text font-barlow text-[17px] lg:text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
          </div>

          {/* Dimensiones */}
          {isChocolateBulto || isChocolateTipo ? (
            <div className="bg-[rgba(146,64,14,0.06)] border border-[rgba(146,64,14,0.15)] rounded-btn px-3 py-2.5 text-[13px]" style={{ color: '#92400E' }}>
              Dimensiones fijas: {CHOCOLATE_DIMS.largo} × {CHOCOLATE_DIMS.ancho} × {CHOCOLATE_DIMS.alto} cm (largo×ancho×alto) · máx {CHOCOLATE_DIMS.pesoMax} kg
            </div>
          ) : tipo === 'Pallet' ? (
            <>
              <div>
                <label className="text-[12px] text-text-3 font-semibold uppercase tracking-wide block mb-1.5">Alto (cm)</label>
                <input type="number" inputMode="decimal" value={alto} onChange={e => setAlto(e.target.value)} placeholder="0"
                  className="w-full bg-white border-2 border-border rounded-btn px-3 py-3 lg:py-2.5 text-text font-barlow text-[17px] lg:text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
              </div>
              <div className="bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded-btn px-3 py-2.5 text-[13px] text-info">
                Dimensiones fijas: 120 × 100 cm
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[{ l: 'Alto (cm)', v: alto, s: setAlto }, { l: 'Largo (cm)', v: largo, s: setLargo }, { l: 'Ancho (cm)', v: ancho, s: setAncho }].map(({ l, v, s }) => (
                <div key={l} className={l === 'Alto (cm)' ? 'col-span-2' : ''}>
                  <label className="text-[12px] text-text-3 font-semibold uppercase tracking-wide block mb-1.5">{l}</label>
                  <input type="number" inputMode="decimal" value={v} onChange={e => s(e.target.value)} placeholder="0"
                    className="w-full bg-white border-2 border-border rounded-btn px-3 py-3 lg:py-2.5 text-text font-barlow text-[17px] lg:text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                </div>
              ))}
            </div>
          )}

          {pesoV > 0 && (
            <div className="text-[13px] text-text-3 bg-bg-2 border border-border rounded-btn px-3 py-2">
              Peso volumétrico: <span className="font-bold text-navy">{pesoV.toFixed(2)} kg</span>
            </div>
          )}

          <div className="sticky bottom-0 z-10 pb-4 pt-2"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 28%)' }}>
            <button onClick={saveItem} disabled={!canAdd}
              className="w-full py-4 lg:py-3 bg-red text-white border-none rounded-card font-barlow-condensed text-[21px] lg:text-[18px] font-bold cursor-pointer disabled:opacity-30 active:bg-red-dark"
              style={{ boxShadow: canAdd ? '0 4px 14px rgba(211,47,47,0.28)' : 'none' }}>
              {editingIdx !== null ? '✓ Guardar cambios' : '+ Agregar'}
            </button>
          </div>

          {/* Items list */}
          {tiendaItems.length > 0 && (
            <div className="border-t border-border pt-3 mt-1">
              <div className="flex items-center justify-between mb-3">
                <div className="font-barlow-condensed text-[12px] uppercase tracking-widest text-text-3">Items ({tiendaItems.length})</div>
                {tiendaItems.length >= 2 && (
                  <div className="flex items-center gap-1 text-[10px] text-text-3 opacity-60">
                    <GripVertical size={10} />
                    <span>Arrastra sobre otro del mismo tipo para combinar</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {tiendaItems.map((item, idx) => {
                  const isEditing = editingIdx === idx;
                  const isDropTarget = dropIdx === idx && dragIdx !== null && tiendaItems[dragIdx]?.tipo === item.tipo;
                  const isDragging   = dragIdx === idx;
                  return (
                    <div
                      key={item.id}
                      data-item-idx={idx}
                      ref={el => { itemDragRefs.current[idx] = el; }}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx); }}
                      onDragOver={(e) => {
                        if (dragIdx !== null && dragIdx !== idx && tiendaItems[dragIdx]?.tipo === item.tipo) {
                          e.preventDefault(); setDropIdx(idx);
                        }
                      }}
                      onDragLeave={() => setDropIdx(prev => prev === idx ? null : prev)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null && dragIdx !== idx && tiendaItems[dragIdx]?.tipo === item.tipo)
                          setCombineModal({ srcIdx: dragIdx, tgtIdx: idx });
                        setDragIdx(null); setDropIdx(null);
                      }}
                      onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        (e.currentTarget as HTMLElement).dataset.touchStartX = String(t.clientX);
                        (e.currentTarget as HTMLElement).dataset.touchStartY = String(t.clientY);
                        longPressRef.current = setTimeout(() => {
                          setDragIdx(idx);
                          navigator.vibrate?.(25);
                        }, 220);
                      }}
                      onTouchMove={(e) => {
                        const t = e.touches[0];
                        const el = e.currentTarget as HTMLElement;
                        const dx = Math.abs(t.clientX - parseFloat(el.dataset.touchStartX ?? '0'));
                        const dy = Math.abs(t.clientY - parseFloat(el.dataset.touchStartY ?? '0'));
                        if (longPressRef.current && (dx > 8 || dy > 8)) {
                          clearTimeout(longPressRef.current);
                          longPressRef.current = null;
                        }
                        if (dragIdx === null) return;
                        e.preventDefault();
                        const under = document.elementFromPoint(t.clientX, t.clientY);
                        const itemEl = under?.closest('[data-item-idx]') as HTMLElement | null;
                        const tgt = itemEl ? parseInt(itemEl.dataset.itemIdx ?? '-1') : -1;
                        setDropIdx(tgt !== -1 && tgt !== dragIdx ? tgt : null);
                      }}
                      onTouchEnd={(e) => {
                        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
                        if (dragIdx === null) return;
                        e.preventDefault();
                        const t = e.changedTouches[0];
                        const under = document.elementFromPoint(t.clientX, t.clientY);
                        const itemEl = under?.closest('[data-item-idx]') as HTMLElement | null;
                        const tgt = itemEl ? parseInt(itemEl.dataset.itemIdx ?? '-1') : -1;
                        if (tgt !== -1 && tgt !== dragIdx && tiendaItems[dragIdx]?.tipo === tiendaItems[tgt]?.tipo)
                          setCombineModal({ srcIdx: dragIdx, tgtIdx: tgt });
                        setDragIdx(null); setDropIdx(null);
                      }}
                      className={[
                        'bg-white border-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all select-none',
                        isDragging   ? 'opacity-40 scale-[0.97]' : '',
                        isDropTarget ? 'border-emerald-500 bg-emerald-50 scale-[1.02]' : isEditing ? 'border-info bg-[rgba(37,99,235,0.04)]' : 'border-border',
                        dragIdx !== null ? 'cursor-grabbing' : 'cursor-grab',
                      ].join(' ')}
                    >
                      <GripVertical size={14} color="#CBD5E1" className="flex-shrink-0" />
                      <div className="font-mono text-[11px] text-text-3 w-5 text-center flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full font-barlow-condensed ${item.tipo === 'Pallet' ? 'text-info bg-[rgba(37,99,235,0.10)]' : 'text-warn bg-[rgba(217,119,6,0.10)]'}`}>{item.orden}</span>
                          <span className="text-[13px] font-semibold text-text-2">{item.contenido}</span>
                          <span className="text-[13px] font-bold text-navy">{item.peso}kg</span>
                        </div>
                        <div className="text-[11px] text-text-3 truncate">{item.alto}cm</div>
                      </div>
                      <button onClick={() => startEdit(idx)}
                        className={`border-none text-[15px] cursor-pointer px-2 py-1.5 rounded-lg flex-shrink-0 transition-all ${isEditing ? 'text-info bg-[rgba(37,99,235,0.10)]' : 'text-text-3 bg-bg-2'}`}>✎</button>
                      <button onClick={() => { if (isEditing) cancelEdit(); dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda!.cod, idx }); }}
                        className="border-none text-text-3 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] flex-shrink-0 bg-bg-2 active:text-red">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTiendasCount > 0 && (
            <button onClick={goToResumen}
              className="w-full py-3.5 bg-navy text-white border-none rounded-card font-barlow-condensed text-[17px] font-bold cursor-pointer active:bg-navy-dark mt-1 lg:hidden"
              style={{ boxShadow: '0 4px 14px rgba(26,37,80,0.22)' }}>
              Ver resumen ({activeTiendasCount} tiendas) →
            </button>
          )}
          <div className="h-4" />
        </div>
      </>
    );
  };

  /* ════════════════════════════════════
     ROOT RENDER
  ════════════════════════════════════ */
  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">

      {/* ─── LEFT PANEL ─── always visible on mobile; hidden only in resumen view */}
      <div className={`${view === 'resumen' ? 'hidden' : 'flex'} lg:flex flex-1 lg:flex-none flex-col w-full lg:w-[42%] lg:border-r-2 lg:border-border overflow-hidden lg:flex-shrink-0`}>

        <div className="px-3 pt-2 pb-2.5 bg-bg border-b border-border flex-shrink-0">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tienda…"
            className="w-full bg-white border border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[16px] outline-none focus:border-red placeholder:text-text-3 transition-all" />
          <div className="flex gap-2 mt-2">
            {([
              { id: 'rm'    as const, label: 'RM',    active_bg: 'bg-red border-red' },
              { id: 'costa' as const, label: 'COSTA', active_bg: 'bg-[#0369a1] border-[#0369a1]' },
            ]).map(({ id, label, active_bg }) => {
              const active = selectedGrps.has(id);
              return (
                <button key={id}
                  onClick={() => setSelectedGrps(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) { if (next.size > 1) next.delete(id); }
                    else next.add(id);
                    return next;
                  })}
                  className={`font-barlow-condensed text-[16px] font-extrabold px-5 py-2 rounded-full border-2 tracking-widest uppercase transition-all cursor-pointer select-none
                    ${active ? `${active_bg} text-white shadow-md` : 'bg-white text-text-3 border-border'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Subir guías PDF de Santiago ── */}
        <div className="flex-shrink-0 border-b border-border">
          <input
            ref={guideFileRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => e.target.files && handleGuideFiles(e.target.files)} />
          <div
            onClick={() => !guideUploading && guideFileRef.current?.click()}
            className="mx-3 mt-2 rounded-xl border-2 border-dashed flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all border-border hover:border-success/50 hover:bg-[rgba(22,163,74,0.02)]">
            {guideUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-border border-t-success rounded-full animate-spin flex-shrink-0" style={{ borderWidth: 2 }} />
                <span className="font-barlow-condensed text-[13px] font-bold text-text-2">Procesando guías…</span>
              </>
            ) : (
              <>
                <span className="text-xl opacity-30 flex-shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="font-barlow-condensed text-[13px] font-bold text-text leading-tight">Subir guías de despacho</p>
                  <p className="text-[10px] text-text-3 leading-tight mt-0.5">PDF por código · ej: 21NUC-guia.pdf</p>
                </div>
                <span className="text-[10px] text-text-3 font-bold border border-border rounded-lg px-2 py-1 flex-shrink-0 bg-white">PDF</span>
              </>
            )}
          </div>
          {/* Chips de guías cargadas (solo tiendas Santiago) */}
          {Object.keys(guides).filter(cod => cod in tiendaByCod).length > 0 && (
            <div className="px-3 py-2 flex gap-1.5 flex-wrap">
              {Object.entries(guides)
                .filter(([cod]) => cod in tiendaByCod)
                .map(([cod, g]) => (
                  <span key={cod} className="flex items-center gap-1.5 bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.25)] rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                    <span className="font-barlow-condensed text-[11px] font-bold text-success">{formatCod(cod)}</span>
                    <span className="text-[10px] text-text-3">{g.guias.length}g</span>
                  </span>
                ))}
            </div>
          )}
          {Object.keys(guides).filter(cod => cod in tiendaByCod).length === 0 && <div className="pb-2" />}
        </div>

        {renderStoreGrid()}
        {renderStatsBar()}
      </div>

      {/* ─── RIGHT PANEL ─── */}
      {/* Mobile: visible when view='form' or view='resumen' | Desktop: always visible */}
      <div className={`${view === 'list' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col overflow-hidden`}>

        {/* Mobile resumen view (hidden on desktop) */}
        {view === 'resumen' && (
          <div className="flex lg:hidden flex-1 flex-col overflow-hidden">
            {renderResumenPanel()}
          </div>
        )}

        {/* Form panel — desktop only (mobile uses bottom sheet below) */}
        <div className={`hidden lg:flex flex-1 flex-col overflow-hidden`}>
          {!currentTienda
            ? renderResumenPanel()
            : formRows.length > 0
              ? renderMultiForm()
              : renderSingleForm()
          }
        </div>
      </div>

      {/* ── MOBILE BOTTOM SHEET ── (lg:hidden) */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 lg:hidden"
        style={{
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(3px)',
          opacity: currentTienda ? 1 : 0,
          pointerEvents: currentTienda ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        onClick={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }}
      />
      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden flex flex-col rounded-t-[28px] bg-white overflow-hidden"
        style={{
          maxHeight: '92dvh',
          transform: currentTienda ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.22)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-pointer"
          onClick={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }}>
          <div className="w-12 h-1.5 rounded-full bg-gray-200" />
        </div>
        {/* Form content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {currentTienda && (
            formRows.length > 0 ? renderMultiForm() : renderSingleForm()
          )}
        </div>
      </div>

      {/* Calendar modals */}
      {confirmAdd && (
        <ConfirmCalendarModal name={confirmAdd} mode="add"
          onConfirm={() => { addToToday(confirmAdd); setConfirmAdd(null); }}
          onCancel={() => setConfirmAdd(null)} />
      )}
      {confirmRemove && (
        <ConfirmCalendarModal name={confirmRemove} mode="remove"
          onConfirm={() => { removeFromToday(confirmRemove); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)} />
      )}

      {combineModal && (() => {
        const activeCod = combineModal.cod ?? rDragCod ?? currentTienda?.cod;
        const allItems  = activeCod ? (items[activeCod] || []) : [];
        const src = allItems[combineModal.srcIdx];
        const tgt = allItems[combineModal.tgtIdx];
        if (!src || !tgt) return null;
        const srcLabel = `${src.orden || src.tipo} · ${src.peso}kg · ${src.contenido}`;
        const tgtLabel = `${tgt.orden || tgt.tipo} · ${tgt.peso}kg · ${tgt.contenido}`;
        return (
          <CombineItemsModal
            pkgLabel={src.tipo === 'Pallet' ? 'Pallets' : 'Bultos'}
            srcLabel={srcLabel}
            tgtLabel={tgtLabel}
            onConfirm={(peso, alto) => handleSantiagoCombineConfirm(peso, alto, activeCod)}
            onCancel={() => {
              setCombineModal(null);
              setDragIdx(null); setDropIdx(null);
              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
            }}
          />
        );
      })()}
    </div>
  );
}
