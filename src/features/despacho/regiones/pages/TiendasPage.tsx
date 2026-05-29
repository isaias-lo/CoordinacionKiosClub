'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation, GripVertical, ChevronLeft } from 'lucide-react';
import { useApp } from '../../../../context/AppContext';
import { processPdf } from '../utils/pdfUtils';
import { TIENDAS, getTodayCods, validarDimensiones } from '../data/tiendas';
import { formatCod } from '../../rutas/utils/helpers';
import { getTiendasDelDia, subscribeToCalendarChanges } from '../../utils/useCalendario';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';
import { ResumenPage } from './ResumenPage';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { supabase } from '../../../../lib/supabase';

/* ── Reverse lookup: tienda_cod → tienda name (for picking integration) ── */
const COD_TO_TIENDA_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(TIENDAS).map(([name, t]) => [t.cod, name])
);

/* ── Per-day calendar overrides ── */
const _today = new Date();
const _localDate = `${_today.getFullYear()}-${String(_today.getMonth()+1).padStart(2,'0')}-${String(_today.getDate()).padStart(2,'0')}`;
const todayDateKey   = `calendarExtra_${_localDate}`;
const todayRemoveKey = `calendarRemoved_${_localDate}`;
function loadExtraCods(): string[]  { try { return JSON.parse(localStorage.getItem(todayDateKey)   || '[]'); } catch { return []; } }
function saveExtraCods(cods: string[])  { localStorage.setItem(todayDateKey,   JSON.stringify(cods)); }
function loadRemovedCods(): string[] { try { return JSON.parse(localStorage.getItem(todayRemoveKey) || '[]'); } catch { return []; } }
function saveRemovedCods(cods: string[]) { localStorage.setItem(todayRemoveKey, JSON.stringify(cods)); }

/* ── Consumed picking slots (physical pallet merges) ── */
type ConsumedSlots = Record<string, { p: number; b: number; c: number; ch: number }>;
const CONSUMED_SLOTS_KEY = `consumedPickingSlots_${_localDate}`;
function loadConsumedSlots(): ConsumedSlots { try { return JSON.parse(localStorage.getItem(CONSUMED_SLOTS_KEY) || '{}'); } catch { return {}; } }
function saveConsumedSlots(v: ConsumedSlots) { try { localStorage.setItem(CONSUMED_SLOTS_KEY, JSON.stringify(v)); } catch {} }

/* ── Styles ── */
const TIPO_CLS: Record<TipoContenido, string> = {
  comida:        'bg-[rgba(217,119,6,0.08)] border-warn text-warn',
  hogar:         'bg-[rgba(124,58,237,0.08)] border-hogar text-hogar',
  'comida-hogar':'bg-[rgba(8,145,178,0.08)] border-mixto text-mixto',
};
const TAG_CLS: Record<string, string> = {
  comida:        'bg-[rgba(217,119,6,0.10)] text-warn',
  hogar:         'bg-[rgba(124,58,237,0.10)] text-hogar',
  'comida-hogar':'bg-[rgba(8,145,178,0.10)] text-mixto',
  pallet:        'bg-[rgba(37,99,235,0.10)] text-info',
  box:           'bg-[rgba(217,119,6,0.10)] text-warn',
};
const inputCls = "bg-white border-[1.5px] border-border rounded-btn px-2.5 py-2.5 text-text font-barlow text-[16px] outline-none transition-all focus:border-red focus:shadow-[0_0_0_3px_rgba(211,47,47,0.10)] [-webkit-appearance:none] w-full";

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-barlow-condensed text-[13px] font-bold uppercase tracking-[0.12em] text-text-3 mb-1.5 mt-3 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-text-3 font-semibold tracking-wide uppercase">{label}</label>
      {children}
    </div>
  );
}

/* ── FormRow for multi-form (preset) mode ── */
interface FormRow {
  id: string;
  pkg: TipoPaquete;
  tipo: TipoContenido;
  peso: string;
  alto: string;
  ancho: string;
  largo: string;
  guia: string;
  valor: string;
  saved?: boolean;
  savedItem?: DispatchItem;
}

/* ── Compact 3-column grid card ── */
interface GridCardProps {
  name: string;
  isActive: boolean;
  isToday: boolean;
  itemCount: number;
  palletCount: number;
  contenedorCount: number;
  chocolateCount: number;
  pickingP?: number;
  pickingB?: number;
  pickingC?: number;
  pickingCH?: number;
  preset?: { pallets: number; bultos: number };
  hasPdf?: boolean;
  onSelect: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}
function TiendaGridCard({ name, isActive, isToday, itemCount, palletCount, contenedorCount, chocolateCount, pickingP = 0, pickingB = 0, pickingC = 0, pickingCH = 0, preset, hasPdf, onSelect, onDragStart }: GridCardProps) {
  const t = TIENDAS[name];
  const boxCount = itemCount - palletCount - contenedorCount - chocolateCount;
  // Desconta los ya ingresados — ghost solo muestra los pendientes de picking
  const remP  = Math.max(0, pickingP  - palletCount);
  const remB  = Math.max(0, pickingB  - boxCount);
  const remC  = Math.max(0, pickingC  - contenedorCount);
  const remCH = Math.max(0, pickingCH - chocolateCount);
  const hasGhost = remP > 0 || remB > 0 || remC > 0 || remCH > 0;
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`flex flex-col items-center justify-between px-2 py-3 cursor-pointer rounded-xl transition-all select-none min-h-[80px] relative active:scale-[0.97]
        ${isActive
          ? 'bg-[rgba(211,47,47,0.12)] border-2 border-red shadow-sm'
          : hasPdf
          ? 'bg-[rgba(22,163,74,0.07)] border-2 border-success hover:bg-[rgba(22,163,74,0.12)]'
          : isToday
          ? 'bg-[rgba(211,47,47,0.04)] border border-[rgba(211,47,47,0.20)] hover:bg-[rgba(211,47,47,0.09)]'
          : 'bg-white border border-border hover:bg-bg'
        }`}>
      <div className={`font-barlow-condensed text-[15px] font-extrabold leading-none tracking-wide text-center ${isActive ? 'text-red' : hasPdf ? 'text-success' : 'text-navy'}`}>
        {formatCod(t.cod)}
      </div>
      <div className="text-[10px] font-semibold text-text-2 w-full text-center leading-tight truncate px-0.5 mt-1 uppercase tracking-wide">
        {t.name}
      </div>
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 min-h-[16px]">
        {/* Ghost badges: picking pendiente (desconta los ya ingresados) */}
        {remP  > 0 && <span className="text-[11px] font-bold text-info/40 bg-[rgba(37,99,235,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-info/25">{remP}P</span>}
        {remB  > 0 && <span className="text-[11px] font-bold text-warn/40 bg-[rgba(217,119,6,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-warn/25">{remB}B</span>}
        {remC  > 0 && <span className="text-[11px] font-bold text-[rgba(107,33,168,0.40)] bg-[rgba(107,33,168,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-[rgba(107,33,168,0.25)]">{remC}C</span>}
        {remCH > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none border border-dashed" style={{ color: 'rgba(146,64,14,0.40)', background: 'rgba(120,53,15,0.06)', borderColor: 'rgba(120,53,15,0.25)' }}>{remCH}CH</span>}
        {/* Solid badges: items ingresados en despacho */}
        {palletCount    > 0 && <span className="text-[11px] font-bold text-info bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 rounded-full leading-none">{palletCount}P</span>}
        {boxCount       > 0 && <span className="text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.12)] px-1.5 py-0.5 rounded-full leading-none">{boxCount}B</span>}
        {contenedorCount > 0 && <span className="text-[11px] font-bold text-[#6B21A8] bg-[rgba(107,33,168,0.10)] px-1.5 py-0.5 rounded-full leading-none">{contenedorCount}C</span>}
        {chocolateCount > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ color: '#92400E', background: 'rgba(120,53,15,0.10)' }}>{chocolateCount}CH</span>}
        {/* Preset fallback (solo cuando no hay picking ni items) */}
        {!hasGhost && preset && itemCount === 0 && (preset.pallets > 0 || preset.bultos > 0) && (
          <span className="text-[11px] text-text-3/50 leading-none">
            {[preset.pallets > 0 ? `${preset.pallets}P` : '', preset.bultos > 0 ? `${preset.bultos}B` : ''].filter(Boolean).join(' ')}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Calendar confirmation modal ── */
function ConfirmCalendarModal({ name, mode, onConfirm, onCancel }: {
  name: string; mode: 'add' | 'remove'; onConfirm: () => void; onCancel: () => void;
}) {
  const tiendaName = TIENDAS[name]?.name || name;
  const isAdd = mode === 'add';
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-navy/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl">
        <div className={`px-5 py-4 border-b text-center ${isAdd ? 'bg-[rgba(211,47,47,0.07)] border-[rgba(211,47,47,0.12)]' : 'bg-[rgba(217,119,6,0.07)] border-[rgba(217,119,6,0.12)]'}`}>
          <h3 className="font-barlow-condensed text-[21px] font-bold text-navy">Modificar calendario</h3>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-[14px] text-text-2 leading-relaxed">
            {isAdd ? '¿Agregar ' : '¿Retirar '}
            <span className="font-bold text-navy">{tiendaName}</span>
            {isAdd ? ' al despacho de hoy?' : ' del despacho de hoy?'}
          </p>
          <p className="text-[12px] text-text-3 mt-1.5">Este cambio aplica solo para hoy.</p>
        </div>
        <div className="flex border-t border-border">
          <button onClick={onCancel} className="flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-text-2 bg-bg-2 hover:bg-bg-3 transition-all cursor-pointer border-r border-border">Cancelar</button>
          <button onClick={onConfirm} className={`flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-white transition-all cursor-pointer ${isAdd ? 'bg-red' : 'bg-[#D97706]'}`}
            style={{ boxShadow: isAdd ? '0 4px 14px rgba(211,47,47,0.30)' : '0 4px 14px rgba(217,119,6,0.30)' }}>
            {isAdd ? 'Confirmar' : 'Retirar'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ── Main page ── */
export function TiendasPage() {
  const { state, dispatch, showToast } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [extraCods,         setExtraCods]         = useState<string[]>([]);
  const [removedCods,       setRemovedCods]        = useState<string[]>([]);
  const [confirmAddName,    setConfirmAddName]     = useState<string | null>(null);
  const [confirmRemoveName, setConfirmRemoveName]  = useState<string | null>(null);
  const [addDropActive,     setAddDropActive]      = useState(false);
  const [removeDropActive,  setRemoveDropActive]   = useState(false);
  const [multiDragOver,     setMultiDragOver]      = useState(false);
  const [presets,           setPresets]            = useState<Record<string, { pallets: number; bultos: number; contenedores: number; chocolates: number }>>({});
  const [pickingSlots,          setPickingSlots]          = useState<Record<string, { tipo: string; contenido: string }[]>>({});
  const [consumedPickingSlots, setConsumedPickingSlots] = useState<ConsumedSlots>(() => typeof window === 'undefined' ? {} : loadConsumedSlots());
  const [formRows,              setFormRows]              = useState<FormRow[]>([]);
  const [showMobileResumen, setShowMobileResumen]  = useState(false);
  const [showTodas,         setShowTodas]          = useState(false);

  /* Calendar from Calendario Central (Sheets + localStorage cross-tab sync) */
  const [sheetsTodayCods, setSheetsTodayCods] = useState<string[]>([]);
  useEffect(() => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const todayCode = DAY_CODES[new Date().getDay()];

    // Initial fetch (checks localStorage cache first, then Sheets)
    getTiendasDelDia('fal')
      .then(cods => { if (cods.length > 0) setSheetsTodayCods(cods); })
      .catch(() => {});

    // Real-time sync when CalendarioCentral saves from another tab
    return subscribeToCalendarChanges(cal => {
      const cods = cal[todayCode]?.fal || [];
      if (cods.length > 0) setSheetsTodayCods(cods);
    });
  }, []);


  const [peso,  setPeso]  = useState('');
  const [alto,  setAlto]  = useState('');
  const [ancho, setAncho] = useState('100');
  const [largo, setLargo] = useState('120');
  const [guia,  setGuia]  = useState('');
  const [valor, setValor] = useState('');
  const [pdfLoading,      setPdfLoading]      = useState(false);
  const [multiPdfLoading, setMultiPdfLoading] = useState(false);
  const [editingIdx,      setEditingIdx]      = useState<number | null>(null);

  const fileRef         = useRef<HTMLInputElement>(null);
  const multiFileRef    = useRef<HTMLInputElement>(null);
  const rightPanelRef   = useRef<HTMLDivElement>(null);
  const formScrollRef        = useRef<HTMLDivElement>(null);
  const formScrollDesktopRef = useRef<HTMLDivElement>(null);
  const pickingSlotsRef      = useRef(pickingSlots);

  /* Combine items (drag-to-merge) */
  const [dragIdx,      setDragIdx]      = useState<number | null>(null);
  const [dropIdx,      setDropIdx]      = useState<number | null>(null);
  const [combineModal, setCombineModal] = useState<{ srcIdx: number; tgtIdx: number } | null>(null);
  const [pickingMergeTarget, setPickingMergeTarget] = useState<{ rowId: string; type: 'p' | 'b' | 'c' | 'ch' } | null>(null);
  const itemDragRefs = useRef<(HTMLDivElement | null)[]>([]);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef     = useRef<HTMLDivElement>(null);
  const sheetDrag    = useRef({ start: 0, delta: 0 });

  const { dispatch: dispatchData, selectedTienda, currentTipo, currentPkg } = state;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const counts: Record<string, { p: number; b: number; c: number; ch: number }> = {};
    Object.entries(dispatchData).forEach(([name, items]) => {
      if (!items.length) return;
      const tienda = TIENDAS[name];
      if (!tienda) return;
      const p  = items.filter(i => i.pkg === 'pallet').length;
      const b  = items.filter(i => i.pkg === 'box').length;
      const c  = items.filter(i => i.pkg === 'contenedor').length;
      const ch = items.filter(i => i.pkg === 'chocolate').length;
      if (p > 0 || b > 0 || c > 0 || ch > 0) counts[tienda.cod] = { p, b, c, ch };
    });
    localStorage.setItem('regionesCounts', JSON.stringify({ date: todayKey, counts }));
    pushCounts('regiones', counts).catch(() => {});
  }, [dispatchData]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setExtraCods(loadExtraCods());
    setRemovedCods(loadRemovedCods());
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Resizable panels (left + right, center takes flex-1) ── */
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 280;
    return parseInt(localStorage.getItem('regiones_left_panel_width') || '280', 10);
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 300;
    return parseInt(localStorage.getItem('regiones_right_panel_width') || '300', 10);
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  const resizingPanelRef = useRef<'left' | 'right' | null>(null);
  const dragStartXRef    = useRef(0);
  const dragStartWRef    = useRef(0);
  useEffect(() => {
    const onMove = (x: number) => {
      if (!resizingPanelRef.current) return;
      const delta = x - dragStartXRef.current;
      if (resizingPanelRef.current === 'left') {
        setLeftWidth(Math.min(480, Math.max(180, dragStartWRef.current + delta)));
      } else {
        setRightWidth(Math.min(480, Math.max(180, dragStartWRef.current - delta)));
      }
    };
    const onUp = () => {
      if (!resizingPanelRef.current) return;
      const panel = resizingPanelRef.current;
      resizingPanelRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (panel === 'left')  setLeftWidth(w  => { localStorage.setItem('regiones_left_panel_width',  String(w)); return w; });
      if (panel === 'right') setRightWidth(w => { localStorage.setItem('regiones_right_panel_width', String(w)); return w; });
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => onMove(e.touches[0].clientX);
    const onResize    = () => setIsDesktop(window.innerWidth >= 1024);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend',  onUp);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend',  onUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  /* ── Load picking slots from picking_pallets (today) ── */
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
        const name = COD_TO_TIENDA_NAME[row.store_cod];
        if (!name) continue;
        if (!slots[name]) slots[name] = [];
        slots[name].push({ tipo: row.tipo || 'P', contenido: row.contenido || 'hogar' });
      }
      setPickingSlots(slots);
    };

    load();

    const channel = supabase
      .channel('picking-pallets-nacional')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_pallets' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* Keep ref in sync so form-init effect always reads latest picking without re-running */
  useEffect(() => { pickingSlotsRef.current = pickingSlots; }, [pickingSlots]);

  const baseTodayCods = mounted ? (sheetsTodayCods.length > 0 ? sheetsTodayCods : getTodayCods()) : [];
  const allTodayCods  = [...baseTodayCods, ...extraCods.filter(c => !baseTodayCods.includes(c))]
    .filter(c => !removedCods.includes(c));

  const todayNames = Object.values(TIENDAS)
    .filter(t => allTodayCods.includes(t.cod))
    .sort((a, b) => allTodayCods.indexOf(a.cod) - allTodayCods.indexOf(b.cod))
    .map(t => t.name);

  const items   = selectedTienda ? (dispatchData[selectedTienda] || []) : [];
  const pdfInfo = selectedTienda ? state.pdfData[selectedTienda] : undefined;
  const hasPdf  = !!pdfInfo;

  const nextGuiaAuto = pdfInfo ? (pdfInfo.guias[items.length]?.num || '') : '';
  const valorAuto    = pdfInfo ? Math.round(pdfInfo.totalSum / (items.length + 1)) : 0;

  const resetForm = (pkg: TipoPaquete = currentPkg) => {
    setPeso(''); setAlto('');
    setAncho(pkg === 'pallet' ? '100' : '');
    setLargo(pkg === 'pallet' ? '120' : '');
    setGuia(''); setValor('');
  };

  const PICKING_PKG: Record<string, TipoPaquete> = { P: 'pallet', C: 'contenedor', B: 'box', CH: 'chocolate' };
  const mapearContenido = (raw: string): TipoContenido => {
    const c = (raw ?? '').toLowerCase();
    if (c === 'mixto' || c === 'comida-hogar') return 'comida-hogar';
    const esComida = c.includes('comida') || c.includes('alimento');
    const esHogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
    if (esComida && esHogar) return 'comida-hogar';
    if (esComida) return 'comida';
    return 'hogar';
  };

  /* Initialize formRows only when the selected tienda changes.
     Uses pickingSlotsRef (always current) so picking real-time updates
     do NOT retrigger this effect and wipe the user's in-progress form. */
  useEffect(() => {
    resetForm();
    setEditingIdx(null);
    if (selectedTienda) {
      setTimeout(() => {
        formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        formScrollDesktopRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);

      const existingItems  = dispatchData[selectedTienda] || [];
      const slots          = pickingSlotsRef.current[selectedTienda] ?? [];
      const pickingP       = slots.filter(s => s.tipo === 'P').length;
      const pickingC       = slots.filter(s => s.tipo === 'C').length;
      const pickingB       = slots.filter(s => s.tipo === 'B').length;
      const pickingCH      = slots.filter(s => s.tipo === 'CH').length;
      const hasPickingData = pickingP > 0 || pickingC > 0 || pickingB > 0 || pickingCH > 0;

      // Auto-fill preset counters from picking (only if no manual preset and no existing items)
      const hasManualPreset = presets[selectedTienda] &&
        (presets[selectedTienda].pallets > 0 || presets[selectedTienda].bultos > 0 || (presets[selectedTienda].contenedores ?? 0) > 0 || (presets[selectedTienda].chocolates ?? 0) > 0);
      if (!hasManualPreset && existingItems.length === 0 && hasPickingData) {
        setPresets(prev => ({ ...prev, [selectedTienda]: { pallets: pickingP, bultos: pickingB, contenedores: pickingC, chocolates: pickingCH } }));
      }

      if (existingItems.length === 0 && hasPickingData) {
        // Build form rows from picking slots — one row per slot with its contenido
        const allRows: FormRow[] = slots.map((s, i) => {
          const pkg  = PICKING_PKG[s.tipo]  ?? 'pallet';
          const tipo = mapearContenido(s.contenido);
          return {
            id: `pick-${s.tipo}-${i}-${Date.now()}`, pkg, tipo, peso: '',
            alto:  pkg === 'pallet' ? '' : '',
            ancho: pkg === 'pallet' ? '100' : '',
            largo: pkg === 'pallet' ? '120' : '',
            guia: '', valor: '',
          };
        });
        const chocSlots = allRows.filter(r => r.pkg === 'chocolate');
        const nonChocRows = allRows.filter(r => r.pkg !== 'chocolate');
        if (chocSlots.length > 0) {
          dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: chocSlots.map((_, i) => ({
            orden: `CH${i + 1}`, tipo: 'hogar' as TipoContenido, pkg: 'chocolate' as TipoPaquete,
            peso: 25, alto: 42, ancho: 56, largo: 80, guia: '', valor: 0,
          })) });
        }
        setFormRows(nonChocRows);
      } else if (existingItems.length === 0) {
        // No picking data — fall back to manual preset if set
        const preset = presets[selectedTienda];
        if (preset) {
          const rows: FormRow[] = [];
          for (let i = 0; i < preset.pallets; i++)
            rows.push({ id: `p${i}-${Date.now()}`,  pkg: 'pallet',    tipo: 'hogar', peso: '', alto: '', ancho: '100', largo: '120', guia: '', valor: '' });
          for (let i = 0; i < preset.bultos; i++)
            rows.push({ id: `b${i}-${Date.now()}`,  pkg: 'box',       tipo: 'hogar', peso: '', alto: '', ancho: '',    largo: '',    guia: '', valor: '' });
          for (let i = 0; i < (preset.contenedores ?? 0); i++)
            rows.push({ id: `c${i}-${Date.now()}`,  pkg: 'contenedor',tipo: 'hogar', peso: '', alto: '', ancho: '',    largo: '',    guia: '', valor: '' });
          if ((preset.chocolates ?? 0) > 0) {
            dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: Array.from({ length: preset.chocolates ?? 0 }, (_, i) => ({
              orden: `CH${i + 1}`, tipo: 'hogar' as TipoContenido, pkg: 'chocolate' as TipoPaquete,
              peso: 25, alto: 42, ancho: 56, largo: 80, guia: '', valor: 0,
            })) });
          }
          setFormRows(rows);
        } else {
          setFormRows([]);
        }
      } else {
        // Returning to a store with existing items — show them as saved cards (multi-form)
        const savedRows: FormRow[] = existingItems
          .filter(item => item.pkg !== 'chocolate')
          .map((item, i) => ({
            id: `saved-${i}-${item.pkg}-${Date.now()}`,
            pkg: item.pkg,
            tipo: item.tipo,
            peso: String(item.peso ?? ''),
            alto: String(item.alto ?? ''),
            ancho: String(item.ancho ?? ''),
            largo: String(item.largo ?? ''),
            guia: item.guia || '',
            valor: item.valor ? String(item.valor) : '',
            saved: true,
            savedItem: item,
          }));
        setFormRows(savedRows);
      }
    } else {
      setFormRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTienda]);

  useEffect(() => {
    if (editingIdx !== null) return;
    if (currentPkg === 'pallet') { setAncho('100'); setLargo('120'); }
    else                         { setAncho('');    setLargo('');    }
  }, [currentPkg, editingIdx]);

  const all = Object.values(TIENDAS);
  const filtered = all.filter(t => {
    const q = search.toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.region?.toLowerCase().includes(q) || t.cod?.toLowerCase().includes(q);
  });
  const today  = filtered.filter(t =>  allTodayCods.includes(t.cod))
    .sort((a, b) => allTodayCods.indexOf(a.cod) - allTodayCods.indexOf(b.cod));
  const others = filtered.filter(t => !allTodayCods.includes(t.cod));

  const allDispatchItems = Object.values(dispatchData).flat();
  const statP = allDispatchItems.filter(i => i.pkg === 'pallet').length;
  const statB = allDispatchItems.filter(i => i.pkg === 'box').length;
  const activeTiendasCount = Object.entries(dispatchData).filter(([, its]) => its.length > 0).length;

  const select  = (name: string) => dispatch({ type: 'SET_TIENDA', payload: selectedTienda === name ? null : name });

  const onSheetDragStart = (e: React.TouchEvent) => {
    sheetDrag.current = { start: e.touches[0].clientY, delta: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onSheetDragMove = (e: React.TouchEvent) => {
    const dy = Math.max(0, e.touches[0].clientY - sheetDrag.current.start);
    sheetDrag.current.delta = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onSheetDragEnd = () => {
    if (!sheetRef.current) return;
    const delta = sheetDrag.current.delta;
    sheetDrag.current.delta = 0;
    sheetRef.current.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)';
    if (delta > 80) {
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => dispatch({ type: 'SET_TIENDA', payload: null }), 340);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
  };
  const setTipo = (t: TipoContenido) => { if (currentPkg === 'box') return; dispatch({ type: 'SET_TIPO', payload: t }); };
  const setPkg  = (p: TipoPaquete) => {
    dispatch({ type: 'SET_PKG', payload: p });
    if (p === 'box' || p === 'chocolate') dispatch({ type: 'SET_TIPO', payload: 'hogar' });
  };

  /* Calendar add/remove */
  const addToToday = (name: string) => {
    const t = TIENDAS[name]; if (!t) return;
    const next = [...extraCods, t.cod]; setExtraCods(next); saveExtraCods(next);
    showToast(`✓ ${t.name} agregada a hoy`, '#16A34A');
  };
  const removeFromToday = (name: string) => {
    const t = TIENDAS[name]; if (!t) return;
    const newExtra   = extraCods.filter(c => c !== t.cod);
    const newRemoved = [...removedCods, t.cod];
    setExtraCods(newExtra); saveExtraCods(newExtra);
    setRemovedCods(newRemoved); saveRemovedCods(newRemoved);
    showToast(`${t.name} retirada de hoy`, '#D97706');
  };

  /* Drag: Todas → HOY */
  const handleAddDragStart = (e: React.DragEvent, name: string) => { e.dataTransfer.setData('addName', name); e.dataTransfer.effectAllowed = 'move'; };
  const handleAddDragOver  = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('addname')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAddDropActive(true); } };
  const handleAddDragLeave = (e: React.DragEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAddDropActive(false); };
  const handleAddDrop      = (e: React.DragEvent) => { e.preventDefault(); setAddDropActive(false); const name = e.dataTransfer.getData('addName'); if (name && !allTodayCods.includes(TIENDAS[name]?.cod)) setConfirmAddName(name); };

  /* Drag: HOY → Todas */
  const handleRemoveDragStart = (e: React.DragEvent, name: string) => { e.dataTransfer.setData('removeName', name); e.dataTransfer.effectAllowed = 'move'; };
  const handleRemoveDragOver  = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('removename')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setRemoveDropActive(true); } };
  const handleRemoveDragLeave = (e: React.DragEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRemoveDropActive(false); };
  const handleRemoveDrop      = (e: React.DragEvent) => { e.preventDefault(); setRemoveDropActive(false); const name = e.dataTransfer.getData('removeName'); if (name) setConfirmRemoveName(name); };

  /* PDF handlers */
  const handlePdfFile = async (file: File) => {
    if (!selectedTienda) return;
    setPdfLoading(true);
    try {
      const data = await processPdf(file);
      /* Si el PDF no tiene guías internas, usa el nombre del archivo como referencia */
      if (!data.guias.length) {
        data.guias = [{ num: file.name.replace(/\.pdf$/i, ''), total: 0 }];
      }
      dispatch({ type: 'SET_PDF', tienda: selectedTienda, data });
      if (items.length > 0) {
        const perItem = data.totalSum > 0 ? Math.round(data.totalSum / items.length) : 0;
        dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: items.map((it, i) => ({ ...it, guia: data.guias[i]?.num || '', valor: perItem || it.valor })) });
      }
      showToast(`✓ ${data.guias.length} guía${data.guias.length > 1 ? 's' : ''}${data.totalSum > 0 ? ' · $' + data.totalSum.toLocaleString('es-CL') : ''}`, '#16A34A');
    } catch (e) { console.error('[PDF] Error al leer el PDF:', e); showToast('Error al leer el PDF', '#D32F2F'); }
    finally { setPdfLoading(false); }
  };

  const clearPdf = () => {
    if (!selectedTienda) return;
    if (fileRef.current) fileRef.current.value = '';
    dispatch({ type: 'CLEAR_PDF', tienda: selectedTienda });
  };

  const handleMultiplePdfs = async (files: FileList) => {
    if (!files.length) return;
    setMultiPdfLoading(true);
    /* Mapa código completo → nombre de tienda (todas las tiendas, no solo las de hoy) */
    const codToName: Record<string, string> = {};
    Object.values(TIENDAS).forEach(t => { codToName[t.cod] = t.name; });
    let assigned = 0, skipped = 0;
    for (const file of Array.from(files)) {
      /* Lee el código completo al inicio del nombre: ej. "53VAL" de "53VAL-14-04-2026_163720_ORIGINAL.pdf" */
      const cleanName = file.name.replace(/\.pdf$/i, '');
      const match = cleanName.match(/^(\d{2}[A-Z]{2,3}\d?)/);
      if (!match) { console.warn('[PDF Multi] Sin código reconocible:', file.name); skipped++; continue; }
      const COD_ALIASES: Record<string, string> = { '38PSP': '38SP2' };
      const cod = COD_ALIASES[match[1]] ?? match[1];
      const storeName = codToName[cod];
      if (!storeName) { console.warn('[PDF Multi] Código no encontrado:', match[1], 'en', file.name); skipped++; continue; }
      try {
        const data = await processPdf(file);
        /* Si el PDF no tiene guías internas, usa el nombre del archivo (código completo) como referencia */
        if (!data.guias.length) {
          data.guias = [{ num: cleanName, total: 0 }];
        }
        dispatch({ type: 'SET_PDF', tienda: storeName, data });
        const ex = dispatchData[storeName] || [];
        if (ex.length > 0) {
          const perItem = data.totalSum > 0 ? Math.round(data.totalSum / ex.length) : 0;
          dispatch({ type: 'UPDATE_ITEMS', tienda: storeName, items: ex.map((it, i) => ({ ...it, guia: data.guias[i]?.num || '', valor: perItem || it.valor })) });
        }
        assigned++;
      } catch (e) { console.error('[PDF] Error procesando', file.name, e); skipped++; }
    }
    if (multiFileRef.current) multiFileRef.current.value = '';
    setMultiPdfLoading(false);
    if (assigned > 0) showToast(`✓ ${assigned} PDF${assigned > 1 ? 's' : ''} asignado${assigned > 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitido${skipped > 1 ? 's' : ''}` : ''}`, '#16A34A');
    else showToast('No se pudo asignar ningún PDF. Verifica que el nombre inicie con el código (ej: 53VAL-...).', '#D97706');
  };

  /* Multi-form row helpers */
  const addFormRow = (pkg: TipoPaquete) => {
    setFormRows(prev => [...prev, {
      id: `row-${Date.now()}`, pkg, tipo: 'hogar', peso: '',
      alto:  pkg === 'chocolate' ? '42'  : '',
      ancho: pkg === 'pallet'   ? '100' : pkg === 'chocolate' ? '56' : '',
      largo: pkg === 'pallet'   ? '120' : pkg === 'chocolate' ? '80' : '',
      guia: '', valor: '',
    }]);
  };
  const updateRow = (id: string, field: keyof FormRow, value: string) => {
    setFormRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const saveRow = (row: FormRow) => {
    if (!selectedTienda) return;
    const p = parseFloat(row.peso);
    if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const isCont = row.pkg === 'contenedor';
    const isChoc = row.pkg === 'chocolate';
    if (isChoc && p > 25) { showToast('⚠ Chocolate máx 25 kg', '#D32F2F'); return; }
    const a  = isCont ? 150 : isChoc ? 42  : (parseFloat(row.alto)  || 0);
    const aw = row.pkg === 'pallet' ? 100 : isCont ? 80  : isChoc ? 56 : (parseFloat(row.ancho) || 0);
    const l  = row.pkg === 'pallet' ? 120 : isCont ? 110 : isChoc ? 80 : (parseFloat(row.largo) || 0);
    const errores = (isCont || isChoc) ? [] : validarDimensiones(row.pkg, p, a, aw, l);
    if (errores.length) { showToast('⚠ ' + errores[0], '#D32F2F'); return; }
    const currentItems = dispatchData[selectedTienda] || [];
    const pc  = currentItems.filter(i => i.pkg === 'pallet').length + 1;
    const bc  = currentItems.filter(i => i.pkg === 'box').length + 1;
    const cc  = currentItems.filter(i => i.pkg === 'contenedor').length + 1;
    const chc = currentItems.filter(i => i.pkg === 'chocolate').length + 1;
    const orden = row.pkg === 'pallet' ? `pallet${pc}` : isCont ? `contenedor${cc}` : isChoc ? `chocolate${chc}` : `bulto${bc}`;
    const itemGuia  = hasPdf ? (pdfInfo?.guias[currentItems.length]?.num || '') : row.guia.trim();
    const itemValor = hasPdf ? 0 : (parseFloat(row.valor) || 0);
    dispatch({ type: 'ADD_ITEM', tienda: selectedTienda, item: { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: itemValor } });
    if (hasPdf && pdfInfo) {
      const newItems = [...currentItems, { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: 0 }];
      const perItem = Math.round(pdfInfo.totalSum / newItems.length);
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: newItems.map((it, i) => ({ ...it, guia: pdfInfo.guias[i]?.num || '', valor: perItem })) });
    }
    const savedItem: DispatchItem = { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: itemValor };
    setFormRows(prev => prev.map(r => r.id === row.id ? { ...r, saved: true, savedItem } : r));
    showToast(`✓ ${orden} agregado`, '#16A34A');
  };

  const updateInlinePreset = (field: 'pallets' | 'bultos' | 'contenedores' | 'chocolates', value: string) => {
    if (!selectedTienda) return;
    const n = Math.max(0, parseInt(value) || 0);
    const current = presets[selectedTienda] || { pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 };
    setPresets(prev => ({ ...prev, [selectedTienda]: { ...current, [field]: n } }));
    if (field === 'chocolates') {
      const currentItems = dispatchData[selectedTienda] || [];
      const existingChocCount = currentItems.filter(i => i.pkg === 'chocolate').length;
      if (n > existingChocCount) {
        const newItems = [...currentItems, ...Array.from({ length: n - existingChocCount }, (_, i) => ({
          orden: `CH${existingChocCount + i + 1}`, tipo: 'hogar' as TipoContenido, pkg: 'chocolate' as TipoPaquete,
          peso: 25, alto: 42, ancho: 56, largo: 80, guia: '', valor: 0,
        }))];
        dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: newItems });
      } else if (n < existingChocCount) {
        let toRemove = existingChocCount - n;
        const newItems = [...currentItems];
        for (let i = newItems.length - 1; i >= 0 && toRemove > 0; i--)
          if (newItems[i].pkg === 'chocolate') { newItems.splice(i, 1); toRemove--; }
        dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: newItems });
      }
      setFormRows(prev => prev.filter(r => r.pkg !== 'chocolate'));
      return;
    }
    const pkg: TipoPaquete = field === 'pallets' ? 'pallet' : field === 'contenedores' ? 'contenedor' : 'box';
    const existing = (dispatchData[selectedTienda] || []).filter(i => i.pkg === pkg).length;
    const savedRowCount = formRows.filter(r => r.pkg === pkg && r.saved).length;
    const needed = Math.max(0, n - existing - savedRowCount);
    const unsavedForPkg = formRows.filter(r => r.pkg === pkg && !r.saved);
    const delta = needed - unsavedForPkg.length;
    if (delta > 0) {
      const newRows: FormRow[] = [];
      for (let i = 0; i < delta; i++)
        newRows.push({ id: `row-${Date.now()}-${i}`, pkg, tipo: 'hogar', peso: '',
          alto:  '',
          ancho: pkg === 'pallet' ? '100' : '',
          largo: pkg === 'pallet' ? '120' : '',
          guia: '', valor: '', saved: false });
      setFormRows(prev => [...prev, ...newRows]);
    } else if (delta < 0) {
      let toRemove = Math.abs(delta);
      setFormRows(prev => {
        const result = [...prev];
        for (let i = result.length - 1; i >= 0 && toRemove > 0; i--) {
          if (result[i].pkg === pkg && !result[i].saved) { result.splice(i, 1); toRemove--; }
        }
        return result;
      });
    }
  };

  const editSavedRow = (rowId: string) => {
    if (!selectedTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (!row?.savedItem) return;
    const currentItems = dispatchData[selectedTienda] || [];
    const idx = currentItems.findIndex(i =>
      i.pkg === row.savedItem!.pkg && i.orden === row.savedItem!.orden
    );
    if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tienda: selectedTienda, idx });
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: false, savedItem: undefined } : r));
  };

  const deleteSavedRow = (rowId: string) => {
    if (!selectedTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (row?.savedItem) {
      const currentItems = dispatchData[selectedTienda] || [];
      const idx = currentItems.findIndex(i =>
        i.pkg === row.savedItem!.pkg && i.orden === row.savedItem!.orden
      );
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tienda: selectedTienda, idx });
    }
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  const absorbPickingSlot = (tiendaName: string, type: 'p' | 'b' | 'c' | 'ch') => {
    setConsumedPickingSlots(prev => {
      const cur = prev[tiendaName] || { p: 0, b: 0, c: 0, ch: 0 };
      const next = { ...prev, [tiendaName]: { ...cur, [type]: cur[type] + 1 } };
      saveConsumedSlots(next);
      return next;
    });
  };

  /* Single-item form helpers */
  const startEdit = (idx: number) => {
    const item = items[idx]; setEditingIdx(idx);
    dispatch({ type: 'SET_PKG', payload: item.pkg }); dispatch({ type: 'SET_TIPO', payload: item.tipo });
    setPeso(String(item.peso)); setAlto(String(item.alto)); setAncho(String(item.ancho)); setLargo(String(item.largo));
    if (!hasPdf) { setGuia(item.guia); setValor(String(item.valor)); }
  };
  const cancelEdit = () => { setEditingIdx(null); resetForm(); };
  const renumberItems = (list: DispatchItem[]) => {
    let pc = 1, bc = 1, cc = 1, chc = 1;
    return list.map(it => {
      if (it.pkg === 'pallet')     return { ...it, orden: `pallet${pc++}` };
      if (it.pkg === 'contenedor') return { ...it, orden: `contenedor${cc++}` };
      if (it.pkg === 'chocolate')  return { ...it, orden: `chocolate${chc++}` };
      return { ...it, orden: `bulto${bc++}` };
    });
  };
  const saveItem = () => {
    if (!selectedTienda) return;
    const p = parseFloat(peso);
    if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const isCont  = currentPkg === 'contenedor';
    const isChoc  = currentPkg === 'chocolate';
    const a  = isCont ? 150 : isChoc ? 42  : (parseFloat(alto)  || 0);
    const aw = isCont ? 80  : isChoc ? 56  : (parseFloat(ancho) || 0);
    const l  = isCont ? 110 : isChoc ? 80  : (parseFloat(largo) || 0);
    const errores = (isCont || isChoc) ? [] : validarDimensiones(currentPkg, p, a, aw, l);
    if (errores.length) { showToast('⚠ ' + errores[0], '#D32F2F'); return; }
    if (isChoc && p > 25) { showToast('⚠ Chocolate máx 25 kg', '#D32F2F'); return; }
    // guia y valor son opcionales — se asignan retroactivamente al cargar el PDF
    if (editingIdx !== null) {
      const updated = items.map((it, i) => i !== editingIdx ? it : { ...it, tipo: currentTipo, pkg: currentPkg, peso: p, alto: a, ancho: aw, largo: l, guia: hasPdf ? it.guia : guia.trim(), valor: hasPdf ? it.valor : (parseFloat(valor) || 0) });
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: renumberItems(updated) });
      setEditingIdx(null); resetForm(); showToast('✓ Item actualizado', '#16A34A'); return;
    }
    let pc = 1, bc = 1, cc = 1, chc = 1;
    items.forEach(i => { if (i.pkg === 'pallet') pc++; else if (i.pkg === 'contenedor') cc++; else if (i.pkg === 'chocolate') chc++; else bc++; });
    const orden = currentPkg === 'pallet' ? `pallet${pc}` : currentPkg === 'contenedor' ? `contenedor${cc}` : currentPkg === 'chocolate' ? `chocolate${chc}` : `bulto${bc}`;
    const itemGuia  = hasPdf ? nextGuiaAuto : guia.trim();
    const itemValor = hasPdf ? 0 : (parseFloat(valor) || 0);
    dispatch({ type: 'ADD_ITEM', tienda: selectedTienda, item: { orden, tipo: currentTipo, pkg: currentPkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: itemValor } });
    if (hasPdf) {
      const newItems = [...items, { orden, tipo: currentTipo, pkg: currentPkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: 0 }];
      const perItem = Math.round(pdfInfo!.totalSum / newItems.length);
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: newItems.map((it, i) => ({ ...it, guia: pdfInfo!.guias[i]?.num || '', valor: perItem })) });
    } else { setGuia(''); setValor(''); }
    setPeso(''); setAlto('');
    showToast(`✓ ${orden} agregado`, '#16A34A');
  };
  const copyLast = () => {
    if (!items.length) return;
    const last = items[items.length - 1];
    setPkg(last.pkg);
    if (last.pkg !== 'box') setTipo(last.tipo);
    setPeso(String(last.peso)); setAlto(String(last.alto));
    if (last.pkg === 'pallet') { setAncho(String(last.ancho)); setLargo(String(last.largo)); }
    showToast('Dimensiones copiadas', '#7C3AED');
  };

  /* ── Combine items handler ── */
  const handleCombineConfirm = (peso: number, alto: number) => {
    if (!combineModal || !selectedTienda) return;
    const { srcIdx, tgtIdx } = combineModal;
    const src = items[srcIdx];
    const tgt = items[tgtIdx];
    const mergedGuia  = [src.guia, tgt.guia].filter(Boolean).join(', ');
    const mergedValor = (src.valor ?? 0) + (tgt.valor ?? 0);
    const mergedTipo: TipoContenido  = src.tipo === tgt.tipo ? src.tipo : 'comida-hogar';
    const survivors = items.filter((_, i) => i !== srcIdx && i !== tgtIdx);
    let pc = 0, bc = 0;
    const renumbered = survivors.map(it => ({ ...it, orden: it.pkg === 'pallet' ? `pallet${++pc}` : `bulto${++bc}` }));
    const newOrden = src.pkg === 'pallet' ? `pallet${++pc}` : `bulto${++bc}`;
    renumbered.push({ peso, alto, ancho: src.ancho, largo: src.largo, guia: mergedGuia, valor: mergedValor, tipo: mergedTipo, pkg: src.pkg, orden: newOrden });
    dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: renumbered });
    setCombineModal(null);
  };

  /* ── Right panel ── */
  const renderForm = (isMobile = false) => {
    if (!selectedTienda) return null;
    const tienda = TIENDAS[selectedTienda];

    /* Shared header */
    const header = (
      <div className={`bg-navy px-3 py-3 flex items-center justify-between flex-shrink-0 ${isMobile ? 'touch-none select-none' : ''}`}
        onTouchStart={isMobile ? onSheetDragStart : undefined}
        onTouchMove={isMobile ? onSheetDragMove : undefined}
        onTouchEnd={isMobile ? onSheetDragEnd : undefined}>
        <div className="flex-1 min-w-0">
          <div className="font-barlow-condensed text-[20px] font-bold text-white leading-tight truncate">{selectedTienda}</div>
          <div className="font-mono text-[11px] text-white/50 mt-0.5">{tienda?.cod ? formatCod(tienda.cod) : ''} · {tienda?.calle} {tienda?.numero}</div>
        </div>
        <div className="flex gap-2.5 ml-2 flex-shrink-0">
          <div className="text-center">
            <div className="font-barlow-condensed text-[26px] font-extrabold text-[#93C5FD] leading-none">{items.filter(i => i.pkg === 'pallet').length}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-widest">P</div>
          </div>
          <div className="text-center">
            <div className="font-barlow-condensed text-[26px] font-extrabold text-[#FCD34D] leading-none">{items.filter(i => i.pkg === 'box').length}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-widest">B</div>
          </div>
          {items.filter(i => i.pkg === 'chocolate').length > 0 && (
            <div className="text-center">
              <div className="font-barlow-condensed text-[26px] font-extrabold text-[#FBB6A0] leading-none">{items.filter(i => i.pkg === 'chocolate').length}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest">CH</div>
            </div>
          )}
        </div>
      </div>
    );

    const currentPreset  = presets[selectedTienda] || { pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 };
    const pkSlots        = pickingSlots[selectedTienda] ?? [];
    const pickingRef     = { p: pkSlots.filter(s => s.tipo === 'P').length, c: pkSlots.filter(s => s.tipo === 'C').length, b: pkSlots.filter(s => s.tipo === 'B').length, ch: pkSlots.filter(s => s.tipo === 'CH').length };
    const hasPickingRef  = pickingRef.p > 0 || pickingRef.c > 0 || pickingRef.b > 0 || pickingRef.ch > 0;

    /* Inline P/B/C quantity setter — shown in both modes */
    const presetBar = (
      <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-2 flex-wrap">
        <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3">Cant.</span>
        {hasPickingRef && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(26,37,80,0.07)', color: 'rgba(26,37,80,0.45)' }}>
            picking {pickingRef.p}P {pickingRef.c > 0 ? `${pickingRef.c}C ` : ''}{pickingRef.b > 0 ? `${pickingRef.b}B ` : ''}{pickingRef.ch > 0 ? `${pickingRef.ch}CH` : ''}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-barlow-condensed text-[12px] font-bold text-info">P</span>
          <input type="number" min="0" max="20"
            value={currentPreset.pallets || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('pallets', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none focus:border-info [-webkit-appearance:none]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-barlow-condensed text-[12px] font-bold" style={{ color: '#6B21A8' }}>C</span>
          <input type="number" min="0" max="20"
            value={currentPreset.contenedores || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('contenedores', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none [-webkit-appearance:none]"
            style={{ outlineColor: '#6B21A8' }} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-barlow-condensed text-[12px] font-bold text-warn">B</span>
          <input type="number" min="0" max="20"
            value={currentPreset.bultos || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('bultos', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none focus:border-warn [-webkit-appearance:none]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-barlow-condensed text-[12px] font-bold" style={{ color: '#92400E' }}>CH</span>
          <input type="number" min="0" max="20"
            value={currentPreset.chocolates || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('chocolates', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none [-webkit-appearance:none]"
            style={{ outlineColor: '#92400E' }} />
        </div>
      </div>
    );

    /* ── Multi-form (preset) mode ── */
    if (formRows.length > 0) {
      const pdfStrip = (
        <div className="px-3 py-1.5 bg-bg border-b border-border flex-shrink-0 hidden lg:flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => e.target.files?.[0] && handlePdfFile(e.target.files[0])} />
          {hasPdf ? (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-success font-semibold truncate block">
                  ✓ {pdfInfo!.guias.length} guía{pdfInfo!.guias.length > 1 ? 's' : ''} · ${pdfInfo!.totalSum.toLocaleString('es-CL')}
                </span>
                <span className="text-[10px] text-text-3 font-mono truncate block">{pdfInfo!.guias.map(g => g.num).join(', ')}</span>
              </div>
              <button onClick={clearPdf} className="text-text-3 hover:text-red cursor-pointer border-none bg-transparent px-1 flex-shrink-0 text-[13px]">✕</button>
            </>
          ) : (
            <>
              <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 flex-1">Guía PDF</span>
              {pdfLoading
                ? <span className="text-[11px] text-info flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 border border-bg-3 border-t-info rounded-full animate-spin flex-shrink-0" />Leyendo…</span>
                : <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-border-2 rounded-btn font-barlow-condensed text-[11px] font-bold text-text-3 hover:text-red hover:border-red cursor-pointer transition-all">
                    Subir PDF
                  </button>
              }
            </>
          )}
        </div>
      );

      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          {header}
          {presetBar}
          {pdfStrip}
          <div ref={isMobile ? formScrollRef : formScrollDesktopRef} className="flex-1 overflow-y-auto px-2 py-2">
            {(() => {
              const cns  = selectedTienda ? (consumedPickingSlots[selectedTienda] || { p: 0, b: 0, c: 0, ch: 0 }) : { p: 0, b: 0, c: 0, ch: 0 };
              const pkS  = selectedTienda ? (pickingSlots[selectedTienda] ?? []) : [];
              const gP   = Math.max(0, pkS.filter(s => s.tipo === 'P').length  - items.filter(i => i.pkg === 'pallet').length     - cns.p);
              const gB   = Math.max(0, pkS.filter(s => s.tipo === 'B').length  - items.filter(i => i.pkg === 'box').length        - cns.b);
              const gC   = Math.max(0, pkS.filter(s => s.tipo === 'C').length  - items.filter(i => i.pkg === 'contenedor').length  - cns.c);
              const gCH  = Math.max(0, pkS.filter(s => s.tipo === 'CH').length - items.filter(i => i.pkg === 'chocolate').length   - cns.ch);
              // Ghosts absorbed by unsaved form cards; remainder shown as standalone cards
              const unsavedPallet = formRows.filter(r => !r.saved && r.pkg === 'pallet').length;
              const unsavedBox    = formRows.filter(r => !r.saved && r.pkg === 'box').length;
              const unsavedCont   = formRows.filter(r => !r.saved && r.pkg === 'contenedor').length;
              const unsavedChoc   = formRows.filter(r => !r.saved && r.pkg === 'chocolate').length;
              type GC = { type: 'p'|'b'|'c'|'ch'; border: string; text: string; bg: string; label: string; key: string };
              const ghostCards: GC[] = [
                ...Array.from({ length: Math.max(0, gP  - unsavedPallet) }, (_, i) => ({ type: 'p'  as const, border: 'rgba(37,99,235,0.35)',   text: '#2563EB', bg: 'rgba(37,99,235,0.03)',   label: 'Pallet',  key: `gP${i}`  })),
                ...Array.from({ length: Math.max(0, gB  - unsavedBox)    }, (_, i) => ({ type: 'b'  as const, border: 'rgba(217,119,6,0.35)',  text: '#D97706', bg: 'rgba(217,119,6,0.03)',   label: 'Bulto',   key: `gB${i}`  })),
                ...Array.from({ length: Math.max(0, gC  - unsavedCont)   }, (_, i) => ({ type: 'c'  as const, border: 'rgba(107,33,168,0.35)', text: '#6B21A8', bg: 'rgba(107,33,168,0.03)', label: 'Cont.',   key: `gC${i}`  })),
                ...Array.from({ length: Math.max(0, gCH - unsavedChoc)   }, (_, i) => ({ type: 'ch' as const, border: 'rgba(120,53,15,0.35)',  text: '#92400E', bg: 'rgba(120,53,15,0.03)',   label: 'Choc.',   key: `gCH${i}` })),
              ];
              return (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {formRows.map((row, rowIdx) => {
                /* Locked / saved card */
                const rowColor = row.pkg === 'pallet' ? { border: 'rgba(37,99,235,0.40)', text: '#2563EB' } : row.pkg === 'contenedor' ? { border: 'rgba(107,33,168,0.40)', text: '#6B21A8' } : row.pkg === 'chocolate' ? { border: 'rgba(120,53,15,0.40)', text: '#92400E' } : { border: 'rgba(217,119,6,0.40)', text: '#D97706' };
                const pkgIdx   = formRows.slice(0, rowIdx + 1).filter(r => r.pkg === row.pkg).length;
                const rowLabel = row.pkg === 'pallet' ? `P${pkgIdx}` : row.pkg === 'chocolate' ? `CH${pkgIdx}` : row.pkg === 'contenedor' ? `C${pkgIdx}` : `B${pkgIdx}`;
                if (row.saved && row.savedItem) {
                  return (
                    <div key={row.id} className="bg-white rounded-lg border-2 p-2" style={{ borderColor: rowColor.border }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-barlow-condensed text-[14px] font-extrabold" style={{ color: rowColor.text }}>
                          {rowLabel}
                        </span>
                        <div className="flex gap-0.5">
                          <button onClick={() => editSavedRow(row.id)} title="Editar"
                            className="text-[11px] text-text-3 hover:text-info cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✎</button>
                          <button onClick={() => deleteSavedRow(row.id)} title="Eliminar"
                            className="text-[11px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✕</button>
                        </div>
                      </div>
                      <div className="text-[11px] text-text-2 space-y-0.5 mb-1.5">
                        <div className="font-semibold">{row.savedItem.peso}kg{row.savedItem.pkg !== 'contenedor' && ` · ${row.savedItem.alto}cm`}</div>
                        {row.savedItem.pkg === 'box' && <div className="text-text-3">{row.savedItem.ancho}×{row.savedItem.largo}cm</div>}
                        {row.savedItem.pkg === 'contenedor' && <div className="text-text-3">80×110cm · alto 150cm — fijo</div>}
                        {row.savedItem.pkg === 'chocolate' && <div className="text-text-3">56×80cm · máx 25kg</div>}
                        {row.savedItem.pkg === 'pallet' && <div className="text-text-3">{row.savedItem.tipo === 'comida-hogar' ? 'Mixto' : row.savedItem.tipo === 'comida' ? 'Comida' : 'Hogar'}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                        <span className="text-[10px] text-success font-bold">Agregado</span>
                      </div>
                    </div>
                  );
                }
                /* Active / unsaved card */
                const isChocRow = row.pkg === 'chocolate';
                const isContRow = row.pkg === 'contenedor';
                const canSave = parseFloat(row.peso) > 0 && (isChocRow || isContRow || (parseFloat(row.alto) > 0 &&
                  (row.pkg === 'pallet' || (parseFloat(row.ancho) > 0 && parseFloat(row.largo) > 0))));
                return (
                  <div key={row.id} className="bg-white rounded-lg border px-2 py-2" style={{ borderColor: row.pkg === 'pallet' ? 'rgba(37,99,235,0.25)' : isContRow ? 'rgba(107,33,168,0.25)' : isChocRow ? 'rgba(120,53,15,0.25)' : 'rgba(217,119,6,0.25)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-barlow-condensed text-[13px] font-bold" style={{ color: rowColor.text }}>
                        {rowLabel}
                      </span>
                      <button onClick={() => setFormRows(prev => prev.filter(r => r.id !== row.id))}
                        className="text-text-3 hover:text-red cursor-pointer border-none bg-transparent text-[12px] px-0.5">✕</button>
                    </div>
                    {row.pkg === 'pallet' && (
                      <div className="flex gap-0.5 mb-1.5">
                        {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(t => (
                          <button key={t} onClick={() => updateRow(row.id, 'tipo', t)}
                            className={`flex-1 py-0.5 rounded border text-[9px] font-bold cursor-pointer transition-all ${row.tipo === t ? TIPO_CLS[t] : 'border-border bg-bg-2 text-text-3'}`}>
                            {t === 'comida' ? 'Com' : t === 'hogar' ? 'Hog' : 'Mix'}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      <div>
                        <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Peso{isChocRow ? ' (máx 25kg)' : ''}</label>
                        <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)} placeholder="kg" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                      {!isChocRow && !isContRow && (
                        <div>
                          <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Alto</label>
                          <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)} placeholder="cm" inputMode="decimal"
                            className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                      )}
                    </div>
                    {row.pkg === 'box' ? (
                      <div className="grid grid-cols-2 gap-1 mb-1.5">
                        <div>
                          <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Ancho</label>
                          <input type="number" value={row.ancho} onChange={e => updateRow(row.id, 'ancho', e.target.value)} placeholder="cm" inputMode="decimal"
                            className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                        <div>
                          <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Largo</label>
                          <input type="number" value={row.largo} onChange={e => updateRow(row.id, 'largo', e.target.value)} placeholder="cm" inputMode="decimal"
                            className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                      </div>
                    ) : isContRow ? (
                      <div className="mb-1.5 text-[9px] rounded px-1.5 py-1" style={{ color: '#6B21A8', background: 'rgba(107,33,168,0.06)', border: '1px solid rgba(107,33,168,0.15)' }}>
                        80 × 110 cm · alto 150 cm — fijo
                      </div>
                    ) : isChocRow ? (
                      <div className="mb-1.5 text-[9px] rounded px-1.5 py-1" style={{ color: '#92400E', background: 'rgba(120,53,15,0.06)', border: '1px solid rgba(120,53,15,0.15)' }}>
                        56 × 80 cm · alto 42 cm — fijo
                      </div>
                    ) : (
                      <div className="mb-1.5 text-[9px] text-info bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded px-1.5 py-1">
                        120 × 100 cm fijos
                      </div>
                    )}
                    {!hasPdf && (
                      <div className="grid grid-cols-2 gap-1 mb-1.5">
                        <div>
                          <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Guía</label>
                          <input type="text" value={row.guia} onChange={e => updateRow(row.id, 'guia', e.target.value)}
                            className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red" />
                        </div>
                        <div>
                          <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">$ Total</label>
                          <input type="number" value={row.valor} onChange={e => updateRow(row.id, 'valor', e.target.value)}
                            className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                      </div>
                    )}
                    {hasPdf && (
                      <div className="mb-1.5 text-[10px] text-success bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.25)] rounded px-1.5 py-1">
                        PDF · ${Math.round((pdfInfo?.totalSum || 0) / (items.length + 1)).toLocaleString('es-CL')}
                      </div>
                    )}
                    <button onClick={() => saveRow(row)} disabled={!canSave}
                      className="w-full py-1.5 text-white border-none rounded font-barlow-condensed text-[12px] font-bold cursor-pointer disabled:opacity-30 transition-all"
                      style={{ background: row.pkg === 'pallet' ? '#2563EB' : isContRow ? '#6B21A8' : isChocRow ? '#92400E' : '#D97706' }}>
                      + Agregar
                    </button>
                    {(() => {
                      const rowTypeKey = row.pkg === 'pallet' ? 'p' : row.pkg === 'box' ? 'b' : row.pkg === 'contenedor' ? 'c' : null;
                      const numGhosts = rowTypeKey === 'p' ? gP : rowTypeKey === 'b' ? gB : rowTypeKey === 'c' ? gC : 0;
                      const sameTypeBefore = formRows.slice(0, rowIdx).filter(r => !r.saved && r.pkg === row.pkg).length;
                      if (!rowTypeKey || sameTypeBefore >= numGhosts) return null;
                      const gcStyle = rowTypeKey === 'p'
                        ? { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' }
                        : rowTypeKey === 'b'
                        ? { border: 'rgba(217,119,6,0.30)', color: '#D97706', bg: 'rgba(217,119,6,0.06)' }
                        : { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)' };
                      return (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed" style={{ borderColor: gcStyle.border }}>
                          <button
                            onClick={() => setPickingMergeTarget({ rowId: row.id, type: rowTypeKey })}
                            className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                            style={{ border: `1.5px dashed ${gcStyle.border}`, color: gcStyle.color, background: gcStyle.bg }}>
                            🔗 Fue unificado con picking
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
                  })}
                  {ghostCards.map(gc => {
                    const pkgMap: Record<string, string> = { p: 'pallet', b: 'box', c: 'contenedor', ch: 'chocolate' };
                    const prefixMap: Record<string, string> = { p: 'P', b: 'B', c: 'C', ch: 'CH' };
                    const regCount = items.filter(i => i.pkg === pkgMap[gc.type]).length;
                    const prefix = prefixMap[gc.type];
                    const opts = Array.from({ length: regCount }, (_, i) => `${prefix}${i + 1}`);
                    return (
                      <div key={gc.key} className="rounded-lg border-2 border-dashed p-2 flex flex-col gap-1.5" style={{ borderColor: gc.border, background: gc.bg }}>
                        <div className="flex items-center justify-between">
                          <span className="font-barlow-condensed text-[13px] font-extrabold" style={{ color: gc.text }}>{gc.label}</span>
                          <span className="text-[9px] text-text-3 font-bold uppercase tracking-widest">picking</span>
                        </div>
                        <div className="text-[10px] text-text-3 leading-snug">¿Con cuál fue unificado?</div>
                        {opts.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {opts.map(opt => (
                              <button
                                key={opt}
                                onClick={() => selectedTienda && absorbPickingSlot(selectedTienda, gc.type)}
                                className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97] border-2"
                                style={{ borderColor: gc.border, color: gc.text, background: 'white' }}>
                                ✓ {opt}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => selectedTienda && absorbPickingSlot(selectedTienda, gc.type)}
                            className="w-full py-1.5 rounded border-2 border-dashed font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                            style={{ borderColor: gc.border, color: gc.text, background: 'white' }}>
                            ✓ Confirmar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <div className="grid grid-cols-4 gap-1.5 pb-1">
              <button onClick={() => addFormRow('pallet')}
                className="py-2 border border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer hover:bg-[rgba(37,99,235,0.05)] transition-all">
                + Pallet
              </button>
              <button onClick={() => addFormRow('box')}
                className="py-2 border border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer hover:bg-[rgba(217,119,6,0.05)] transition-all">
                + Bulto
              </button>
              <button onClick={() => addFormRow('contenedor')}
                className="py-2 border border-dashed rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all"
                style={{ borderColor: 'rgba(107,33,168,0.4)', color: '#6B21A8', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,33,168,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                + Cont.
              </button>
              <button onClick={() => addFormRow('chocolate')}
                className="py-2 border border-dashed rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all"
                style={{ borderColor: 'rgba(120,53,15,0.4)', color: '#92400E', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(120,53,15,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                + Choc. CH
              </button>
            </div>
          </div>
        </div>
      );
    }

    /* ── Normal single-item form ── */
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {header}
        {presetBar}
        {/* PDF compact strip — outside scroll */}
        <div className="flex-shrink-0 px-2.5 py-1.5 border-b border-border hidden lg:flex items-center gap-2 bg-bg"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') handlePdfFile(f); }}>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && handlePdfFile(e.target.files[0])} />
          {pdfLoading
            ? <span className="text-[11px] text-info flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 border border-bg-3 border-t-info rounded-full animate-spin flex-shrink-0" />Leyendo…</span>
            : hasPdf
              ? <>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-success font-semibold truncate block">✓ {pdfInfo!.guias.length} guías · ${pdfInfo!.totalSum.toLocaleString('es-CL')} · {items.length + 1} items: ${Math.round(pdfInfo!.totalSum / (items.length + 1)).toLocaleString('es-CL')} c/u</span>
                    <span className="text-[10px] text-success/60 font-mono truncate block">{pdfInfo!.guias.map(g => g.num).join(', ')}</span>
                  </div>
                  <button onClick={clearPdf} className="text-[11px] text-text-3 hover:text-red cursor-pointer border border-border rounded px-1.5 py-0.5 flex-shrink-0 bg-white">✕ Quitar</button>
                </>
              : <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-border-2 rounded-btn font-barlow-condensed text-[11px] font-bold text-text-3 hover:text-red hover:border-red cursor-pointer transition-all">
                  Subir PDF guías
                </button>
          }
        </div>
        <div ref={isMobile ? formScrollRef : formScrollDesktopRef} className="flex-1 overflow-y-auto px-2.5 pb-4">
          {editingIdx !== null && (
            <div className="mt-2 bg-[rgba(37,99,235,0.07)] border border-[rgba(37,99,235,0.25)] rounded-card px-2.5 py-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-info">Editando #{editingIdx + 1}</span>
              <button onClick={cancelEdit} className="text-[12px] text-text-3 cursor-pointer border-none bg-none hover:text-red">✕ Cancelar</button>
            </div>
          )}
          <SLabel>Tipo</SLabel>
          <div className="flex gap-1.5 flex-wrap">
            {(['pallet', 'box', 'contenedor', 'chocolate'] as TipoPaquete[]).map(p => (
              <button key={p} onClick={() => setPkg(p)}
                className={`flex-1 py-2.5 rounded-btn border-[1.5px] font-barlow text-[13px] font-medium cursor-pointer transition-all min-w-[60px] ${
                  currentPkg === p
                    ? p === 'pallet'     ? 'bg-[rgba(37,99,235,0.08)] border-info text-info'
                    : p === 'contenedor' ? 'bg-[rgba(107,33,168,0.08)] border-[#6B21A8] text-[#6B21A8]'
                    : p === 'chocolate'  ? 'bg-[rgba(120,53,15,0.08)] border-[#92400E] text-[#92400E]'
                    : 'bg-[rgba(217,119,6,0.08)] border-warn text-warn'
                    : 'border-border bg-white text-text-2'
                }`}>
                {p === 'pallet' ? 'Pallet' : p === 'contenedor' ? 'Contened.' : p === 'chocolate' ? 'Choc. CH' : 'Bulto'}
              </button>
            ))}
          </div>
          <SLabel>Contenido</SLabel>
          <div className="flex gap-1.5">
            {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(t => (
              <button key={t} onClick={() => setTipo(t)} disabled={currentPkg === 'box' && t !== 'hogar'}
                className={`flex-1 py-2.5 rounded-btn border-[1.5px] font-barlow text-[14px] font-medium cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed ${currentTipo === t ? TIPO_CLS[t] : 'border-border bg-white text-text-2'}`}>
                {t === 'comida' ? 'Comida' : t === 'hogar' ? 'Hogar' : 'Mixto'}
              </button>
            ))}
          </div>
          {(currentPkg === 'box' || currentPkg === 'chocolate') && <div className="mt-1 bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.25)] rounded-btn px-2.5 py-1 text-[12px] text-hogar">{currentPkg === 'chocolate' ? 'Chocolate siempre es Hogar' : 'Bulto siempre es Hogar'}</div>}
          <SLabel>Peso y dimensiones</SLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Peso kg"><input type="number" value={peso} onChange={e => setPeso(e.target.value)} placeholder={currentPkg === 'chocolate' ? 'máx 25' : '500'} inputMode="decimal" className={inputCls} /></Field>
            {currentPkg !== 'contenedor' && currentPkg !== 'chocolate' && (
              <Field label="Alto cm"><input type="number" value={alto} onChange={e => setAlto(e.target.value)} placeholder="160" inputMode="decimal" className={inputCls} /></Field>
            )}
            {currentPkg === 'pallet' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[12px] text-text-3 font-semibold tracking-wide uppercase">Ancho × Largo</label>
                <div className="bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.20)] rounded-btn px-2.5 py-2.5 text-[14px] font-mono text-info text-center">
                  100 × 120 cm — fijo
                </div>
              </div>
            ) : currentPkg === 'contenedor' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[12px] text-text-3 font-semibold tracking-wide uppercase">Dimensiones</label>
                <div className="bg-[rgba(107,33,168,0.06)] border border-[rgba(107,33,168,0.20)] rounded-btn px-2.5 py-2.5 text-[14px] font-mono text-[#6B21A8] text-center">
                  80 × 110 cm · alto 150 cm — fijo
                </div>
              </div>
            ) : currentPkg === 'chocolate' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[12px] text-text-3 font-semibold tracking-wide uppercase">Dimensiones</label>
                <div className="rounded-btn px-2.5 py-2.5 text-[14px] font-mono text-center"
                  style={{ background: 'rgba(120,53,15,0.06)', border: '1px solid rgba(120,53,15,0.20)', color: '#92400E' }}>
                  56 × 80 cm · alto 42 cm — fijo · máx 25 kg
                </div>
              </div>
            ) : (
              <>
                <Field label="Ancho cm"><input type="number" value={ancho} onChange={e => setAncho(e.target.value)} placeholder="" inputMode="decimal" className={inputCls} /></Field>
                <Field label="Largo cm"><input type="number" value={largo} onChange={e => setLargo(e.target.value)} placeholder="" inputMode="decimal" className={inputCls} /></Field>
              </>
            )}
          </div>
          <div className="sticky bottom-0 z-10 mt-3 pb-4 pt-2"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 28%)' }}>
            <button onClick={saveItem}
              className="w-full py-4 bg-red text-white border-none rounded-card font-barlow-condensed text-[20px] font-bold tracking-wide cursor-pointer flex items-center justify-center gap-1.5 transition-all active:bg-red-dark active:scale-[0.99]"
              style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.28)' }}>
              {editingIdx !== null ? 'Guardar' : '+ Agregar'}
            </button>
            {items.length > 0 && editingIdx === null && (
              <button onClick={copyLast} className="w-full py-2.5 mt-1.5 bg-white text-text-2 border border-dashed border-border-2 rounded-btn text-[13px] cursor-pointer font-barlow hover:border-text-3">
                ↻ Copiar último
              </button>
            )}
          </div>
          {!hasPdf ? (
            <><SLabel>Guía y valor <span className="text-[10px] font-normal normal-case tracking-normal text-text-3/70 ml-1">(opcional)</span></SLabel>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                <Field label="N° Guía"><input type="text" value={guia} onChange={e => setGuia(e.target.value)} placeholder="Manual" inputMode="numeric" className={inputCls} /></Field>
                <Field label="Total $"><input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0" inputMode="decimal" className={inputCls} /></Field>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <Field label="N° Guía">
                <input type="text" value={editingIdx !== null ? (items[editingIdx]?.guia || '—') : (nextGuiaAuto || '—')} readOnly className="bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.35)] rounded-btn px-2.5 py-2.5 text-success font-barlow text-[16px] outline-none w-full" />
                <div className="text-[11px] text-success mt-0.5">{editingIdx !== null ? 'Del PDF' : (nextGuiaAuto ? `${items.length + 1}/${pdfInfo!.guias.length}` : 'Sin guía')}</div>
              </Field>
              <Field label="Valor $">
                <input type="number" value={editingIdx !== null ? (items[editingIdx]?.valor || 0) : valorAuto} readOnly className="bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.35)] rounded-btn px-2.5 py-2.5 text-success font-barlow text-[16px] outline-none w-full" />
                <div className="text-[11px] text-success mt-0.5">Total ÷ items</div>
              </Field>
            </div>
          )}
          {items.length > 0 && (
            <div className="mt-3">
              <SLabel>Items ({items.length})</SLabel>
              {items.map((item, i) => {
                const dims = [item.alto, item.ancho, item.largo].filter(Boolean);
                const isEditing = editingIdx === i;
                return (
                  <div
                    key={i}
                    data-item-idx={i}
                    ref={el => { itemDragRefs.current[i] = el; }}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }}
                    onDragOver={(e) => { if (dragIdx !== null && dragIdx !== i && items[dragIdx]?.pkg === item.pkg) { e.preventDefault(); setDropIdx(i); } }}
                    onDragLeave={() => setDropIdx(prev => prev === i ? null : prev)}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i && items[dragIdx]?.pkg === item.pkg) setCombineModal({ srcIdx: dragIdx, tgtIdx: i }); setDragIdx(null); setDropIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      (e.currentTarget as HTMLElement).dataset.txS = String(t.clientX);
                      (e.currentTarget as HTMLElement).dataset.tyS = String(t.clientY);
                      longPressRef.current = setTimeout(() => { setDragIdx(i); navigator.vibrate?.(25); }, 220);
                    }}
                    onTouchMove={(e) => {
                      const t = e.touches[0];
                      const el = e.currentTarget as HTMLElement;
                      if (longPressRef.current && (Math.abs(t.clientX - parseFloat(el.dataset.txS ?? '0')) > 8 || Math.abs(t.clientY - parseFloat(el.dataset.tyS ?? '0')) > 8))
                        { clearTimeout(longPressRef.current); longPressRef.current = null; }
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
                      if (tgt !== -1 && tgt !== dragIdx && items[dragIdx]?.pkg === items[tgt]?.pkg)
                        setCombineModal({ srcIdx: dragIdx, tgtIdx: tgt });
                      setDragIdx(null); setDropIdx(null);
                    }}
                    className={[
                      'bg-white border rounded-card px-2.5 py-2 mb-1.5 flex items-center gap-2 shadow-card transition-all select-none',
                      dropIdx === i ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : isEditing ? 'border-info bg-[rgba(37,99,235,0.04)]' : 'border-border',
                      dragIdx === i ? 'opacity-40' : '',
                      dragIdx !== null ? 'cursor-grabbing' : 'cursor-grab',
                    ].join(' ')}
                  >
                    <GripVertical size={13} color="#CBD5E1" className="flex-shrink-0" />
                    <div className="font-mono text-[11px] text-text-3 w-4 text-center flex-shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed uppercase ${TAG_CLS[item.pkg]}`}>{item.orden}</span>
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed uppercase ${TAG_CLS[item.tipo]}`}>{item.tipo === 'comida' ? 'Comida' : item.tipo === 'hogar' ? 'Hogar' : 'Mixto'}</span>
                        <span className="text-[13px] font-semibold text-text-2">{item.peso}kg</span>
                      </div>
                      <div className="font-mono text-[11px] text-text-3 mt-0.5 truncate">
                        {dims.length ? dims.join('×') + 'cm' : ''}
                        {item.guia ? (dims.length ? ' · ' : '') + '#' + item.guia : ''}
                        {item.valor ? ' · $' + item.valor.toLocaleString('es-CL') : ''}
                      </div>
                    </div>
                    <button onClick={() => startEdit(i)} className={`border-none text-[13px] cursor-pointer px-1.5 py-1 rounded transition-all flex-shrink-0 ${isEditing ? 'bg-[rgba(37,99,235,0.12)] text-info' : 'bg-none text-text-3 hover:text-info'}`}>✎</button>
                    <button onClick={() => { if (isEditing) cancelEdit(); dispatch({ type: 'DELETE_ITEM', tienda: selectedTienda!, idx: i }); }} className="bg-none border-none text-text-3 cursor-pointer px-1.5 py-1 rounded text-sm hover:text-red flex-shrink-0">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── RENDER ── */
  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

      {/* Wrapper: on mobile = top/bottom stack, on desktop = transparent via contents */}
      <div className="flex flex-col lg:contents flex-1 min-h-0 overflow-hidden">

      {/* LEFT PANEL — lista de tiendas (full height on mobile) */}
      <div className="w-full flex-1 lg:flex-none flex flex-col overflow-hidden flex-shrink-0"
           style={isDesktop ? { width: leftWidth } : undefined}>

        {/* Search */}
        <div className="px-2 py-2 bg-bg border-b border-border flex-shrink-0">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-white border border-border rounded-btn px-2.5 py-2 text-text font-barlow text-[15px] outline-none transition-all focus:border-red placeholder:text-text-3" />
        </div>

        {/* HOY chips — desktop only; on mobile the grid below already shows status */}
        {todayNames.length > 0 && (
          <div className="hidden lg:block px-2 py-2.5 border-b flex-shrink-0 bg-[rgba(211,47,47,0.08)] border-[rgba(211,47,47,0.20)]">
            <div className="font-barlow-condensed text-[20px] font-extrabold uppercase tracking-widest text-red mb-2 text-center" style={{ letterSpacing: '0.18em' }}>HOY</div>
            <div className="flex flex-wrap gap-1 justify-center">
              {todayNames.map(name => (
                <span key={name} onClick={() => select(name)}
                  className={`px-2.5 py-1 rounded-full text-[14px] font-bold font-barlow-condensed cursor-pointer border transition-all ${selectedTienda === name ? 'bg-red text-white border-red' : 'bg-[rgba(211,47,47,0.12)] text-red border-[rgba(211,47,47,0.30)]'}`}>
                  {TIENDAS[name]?.cod ? formatCod(TIENDAS[name].cod) : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar: Multi-PDF — desktop only */}
        <div className="hidden lg:flex px-2 py-1.5 bg-bg border-b border-border flex-shrink-0 gap-1.5">
          <input ref={multiFileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleMultiplePdfs(e.target.files)} />
          <button
            onClick={() => multiFileRef.current?.click()}
            disabled={multiPdfLoading}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setMultiDragOver(true); } }}
            onDragLeave={e => { e.stopPropagation(); setMultiDragOver(false); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setMultiDragOver(false); if (!multiPdfLoading && e.dataTransfer.files.length) handleMultiplePdfs(e.dataTransfer.files); }}
            className={`flex-1 py-3 border-2 rounded-btn font-barlow-condensed text-[16px] font-extrabold uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${multiDragOver ? 'border-red bg-[rgba(211,47,47,0.18)] text-red scale-[1.02]' : 'border-red bg-[rgba(211,47,47,0.06)] text-red active:bg-[rgba(211,47,47,0.12)]'}`}>
            {multiPdfLoading
              ? <><div className="w-3 h-3 border-2 border-red/30 border-t-red rounded-full animate-spin" />PROCESANDO…</>
              : multiDragOver ? '↓ SUELTA PDFs' : 'SUBIR GUÍAS'}
          </button>
        </div>

        {/* Store list — 3-column grid sections */}
        <div className="flex-1 overflow-y-auto">

          {/* HOY section — drop zone for adding */}
          {today.length > 0 && (
            <div
              onDragOver={handleAddDragOver}
              onDragLeave={handleAddDragLeave}
              onDrop={handleAddDrop}
              className={`transition-colors ${addDropActive ? 'bg-[rgba(211,47,47,0.07)]' : ''}`}>
              <div className={`px-2.5 py-2 border-b sticky top-0 z-10 transition-all ${addDropActive ? 'bg-[rgba(211,47,47,0.18)] border-red/60' : 'bg-[rgba(211,47,47,0.10)] border-[rgba(211,47,47,0.20)]'}`}>
                <span className="font-barlow-condensed text-[15px] font-extrabold uppercase tracking-widest text-red">
                  {addDropActive ? '↓ Suelta aquí' : 'HOY'}
                </span>
                {!addDropActive && <span className="font-barlow-condensed text-[11px] text-red/50 ml-2 uppercase tracking-wide">arrastra aquí</span>}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
                {today.map(t => {
                  const cardItems = dispatchData[t.name] || [];
                  const pkSlots   = pickingSlots[t.name] ?? [];
                  const consumed  = consumedPickingSlots[t.name] || { p: 0, b: 0, c: 0, ch: 0 };
                  return (
                    <TiendaGridCard key={t.name} name={t.name}
                      isActive={selectedTienda === t.name} isToday
                      itemCount={cardItems.length}
                      palletCount={cardItems.filter(i => i.pkg === 'pallet').length}
                      contenedorCount={cardItems.filter(i => i.pkg === 'contenedor').length}
                      chocolateCount={cardItems.filter(i => i.pkg === 'chocolate').length}
                      pickingP={Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - consumed.p)}
                      pickingB={Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - consumed.b)}
                      pickingC={Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - consumed.c)}
                      pickingCH={Math.max(0, pkSlots.filter(s => s.tipo === 'CH').length - consumed.ch)}
                      preset={presets[t.name]}
                      hasPdf={!!state.pdfData[t.name]}
                      onSelect={() => select(t.name)}
                      onDragStart={e => handleRemoveDragStart(e, t.name)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Todas section — drop zone for removing from HOY */}
          {others.length > 0 && (
            <div
              onDragOver={handleRemoveDragOver}
              onDragLeave={handleRemoveDragLeave}
              onDrop={handleRemoveDrop}
              className={`transition-colors ${removeDropActive ? 'bg-[rgba(217,119,6,0.07)]' : ''}`}>
              {today.length > 0 && (
                <div
                  onClick={() => !removeDropActive && setShowTodas(prev => !prev)}
                  className={`px-2.5 py-2 border-b border-t sticky top-0 z-10 transition-all flex items-center ${removeDropActive ? 'cursor-default bg-[rgba(217,119,6,0.18)] border-warn/60' : 'cursor-pointer bg-bg border-border'}`}>
                  <span className="font-barlow-condensed text-[13px] font-bold uppercase tracking-widest text-text-3 flex-1">
                    {removeDropActive ? '↓ Suelta para retirar de hoy' : 'Todas'}
                  </span>
                  {!removeDropActive && (
                    <span className="font-barlow-condensed text-[12px] text-text-3/50 select-none">
                      {showTodas ? '▲' : '▼'}
                    </span>
                  )}
                </div>
              )}
              {(showTodas || today.length === 0) && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
                  {others.map(t => {
                    const cardItems = dispatchData[t.name] || [];
                    const pkSlots   = pickingSlots[t.name] ?? [];
                    const consumed  = consumedPickingSlots[t.name] || { p: 0, b: 0, c: 0, ch: 0 };
                    return (
                      <TiendaGridCard key={t.name} name={t.name}
                        isActive={selectedTienda === t.name} isToday={false}
                        itemCount={cardItems.length}
                        palletCount={cardItems.filter(i => i.pkg === 'pallet').length}
                        contenedorCount={cardItems.filter(i => i.pkg === 'contenedor').length}
                        chocolateCount={cardItems.filter(i => i.pkg === 'chocolate').length}
                        pickingP={Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - consumed.p)}
                        pickingB={Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - consumed.b)}
                        pickingC={Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - consumed.c)}
                        pickingCH={Math.max(0, pkSlots.filter(s => s.tipo === 'CH').length - consumed.ch)}
                        hasPdf={!!state.pdfData[t.name]}
                        onSelect={() => select(t.name)}
                        onDragStart={e => handleAddDragStart(e, t.name)} />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="py-10 text-center text-text-3">
              <p className="text-[13px] opacity-60">Sin resultados</p>
            </div>
          )}
        </div>

        {/* Stats bar + actions */}
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
            <button
              onClick={() => { dispatch({ type: 'SET_TIENDA', payload: null }); setShowMobileResumen(true); }}
              className="flex-1 py-2.5 bg-red text-white rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer active:bg-red-dark lg:hidden"
              style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.30)' }}>
              RESUMEN ({activeTiendasCount})
            </button>
            <button
              onClick={() => { sessionStorage.setItem('despacho_from', '/despacho/regiones'); router.push('/despacho'); }}
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
      </div>

      {/* Divider: Left ↔ Center — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={e => { resizingPanelRef.current = 'left'; dragStartXRef.current = e.clientX; dragStartWRef.current = leftWidth; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); }}
          onTouchStart={e => { resizingPanelRef.current = 'left'; dragStartXRef.current = e.touches[0].clientX; dragStartWRef.current = leftWidth; }}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* CENTER PANEL — formulario (desktop only) */}
      <div ref={rightPanelRef} className="hidden lg:flex flex-1 flex-col overflow-hidden relative">
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTienda
            ? renderForm(false)
            : (
              <div className="flex-1 flex flex-col items-center justify-center bg-navy" style={{ minHeight: 0 }}>
                <p className="font-barlow-condensed text-[22px] font-bold text-white/70 uppercase tracking-widest">Selecciona una tienda</p>
                <p className="text-[13px] text-white/35 mt-1">o arrastra desde "Todas" a Hoy</p>
              </div>
            )
          }
        </div>
      </div>

      </div>{/* end top-row wrapper */}

      {/* ── MOBILE BOTTOM SHEET ── (lg:hidden) */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 lg:hidden"
        style={{
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(3px)',
          opacity: selectedTienda ? 1 : 0,
          pointerEvents: selectedTienda ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        onClick={() => select(selectedTienda!)}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden flex flex-col rounded-t-[28px] bg-white overflow-hidden"
        style={{
          minHeight: '82vh',
          maxHeight: '92vh',
          transform: selectedTienda ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.22)',
        }}
      >
        {/* Form content (reuses renderForm logic) */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {selectedTienda && renderForm(true)}
        </div>
      </div>

      {/* Calendar modals — top level so they work from both desktop form and mobile sheet */}
      {confirmAddName && (
        <ConfirmCalendarModal name={confirmAddName} mode="add"
          onConfirm={() => { addToToday(confirmAddName); setConfirmAddName(null); }}
          onCancel={() => setConfirmAddName(null)} />
      )}
      {confirmRemoveName && (
        <ConfirmCalendarModal name={confirmRemoveName} mode="remove"
          onConfirm={() => { removeFromToday(confirmRemoveName); setConfirmRemoveName(null); }}
          onCancel={() => setConfirmRemoveName(null)} />
      )}

      {/* Divider: Center ↔ Right — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={e => { resizingPanelRef.current = 'right'; dragStartXRef.current = e.clientX; dragStartWRef.current = rightWidth; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); }}
          onTouchStart={e => { resizingPanelRef.current = 'right'; dragStartXRef.current = e.touches[0].clientX; dragStartWRef.current = rightWidth; }}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* RIGHT PANEL — resumen (right column on desktop only) */}
      <div className="hidden lg:flex lg:flex-col overflow-hidden flex-shrink-0"
           style={isDesktop ? { width: rightWidth } : undefined}>
        <ResumenPage panel />
      </div>

      {/* Mobile Resumen Overlay */}
      {showMobileResumen && (
        <div className="fixed inset-0 z-50 flex flex-col lg:hidden bg-bg">
          <div className="bg-navy px-3 py-3 flex items-center gap-3 flex-shrink-0"
               style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
            <button
              onClick={() => setShowMobileResumen(false)}
              className="flex items-center justify-center rounded-full flex-shrink-0 cursor-pointer transition-all active:scale-95"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <span className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-widest uppercase flex-1">Resumen</span>
            <button
              onClick={() => { sessionStorage.setItem('despacho_from', '/despacho/regiones'); router.push('/despacho'); }}
              className="flex items-center gap-2 py-2 px-3 rounded-full cursor-pointer transition-all active:opacity-70"
              style={{ background: 'rgba(211,47,47,0.18)', border: '1px solid rgba(211,47,47,0.50)' }}>
              <Navigation size={13} color="#EF4444" strokeWidth={2} />
              <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase" style={{ color: '#EF4444' }}>Enrutador</span>
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <ResumenPage panel />
          </div>
        </div>
      )}

      {combineModal && (() => {
        const src = items[combineModal.srcIdx];
        const tgt = items[combineModal.tgtIdx];
        const srcLabel = `${src.orden} · ${src.peso}kg${src.guia ? ` · #${src.guia}` : ''}${src.valor ? ` · $${src.valor.toLocaleString('es-CL')}` : ''}`;
        const tgtLabel = `${tgt.orden} · ${tgt.peso}kg${tgt.guia ? ` · #${tgt.guia}` : ''}${tgt.valor ? ` · $${tgt.valor.toLocaleString('es-CL')}` : ''}`;
        const mergedGuia  = [src.guia, tgt.guia].filter(Boolean).join(', ');
        const mergedValor = (src.valor ?? 0) + (tgt.valor ?? 0);
        return (
          <CombineItemsModal
            pkgLabel={src.pkg === 'pallet' ? 'Pallets' : 'Bultos'}
            srcLabel={srcLabel}
            tgtLabel={tgtLabel}
            mergedGuia={mergedGuia || undefined}
            mergedValor={mergedValor || undefined}
            onConfirm={handleCombineConfirm}
            onCancel={() => { setCombineModal(null); setDragIdx(null); setDropIdx(null); }}
          />
        );
      })()}

      {pickingMergeTarget && selectedTienda && (() => {
        const targetRow = formRows.find(r => r.id === pickingMergeTarget.rowId);
        if (!targetRow) return null;
        const targetIdx = formRows.findIndex(r => r.id === pickingMergeTarget.rowId);
        const pkgIdx = formRows.slice(0, targetIdx + 1).filter(r => r.pkg === targetRow.pkg).length;
        const rowLabel = targetRow.pkg === 'pallet' ? `P${pkgIdx}` : targetRow.pkg === 'contenedor' ? `C${pkgIdx}` : targetRow.pkg === 'chocolate' ? `CH${pkgIdx}` : `B${pkgIdx}`;
        return (
          <CombineItemsModal
            pkgLabel={targetRow.pkg === 'pallet' ? 'Pallets' : targetRow.pkg === 'box' ? 'Bultos' : 'Contenedores'}
            srcLabel={`${rowLabel} — despacho`}
            tgtLabel="Pallet de picking (físico)"
            onConfirm={(peso, alto) => {
              updateRow(pickingMergeTarget.rowId, 'peso', String(peso));
              updateRow(pickingMergeTarget.rowId, 'alto', String(alto));
              absorbPickingSlot(selectedTienda, pickingMergeTarget.type);
              setPickingMergeTarget(null);
            }}
            onCancel={() => setPickingMergeTarget(null)}
          />
        );
      })()}

    </div>
  );
}
