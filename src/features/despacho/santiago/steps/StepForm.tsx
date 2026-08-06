'use client';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Navigation, GripVertical, ClipboardList } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSantiago } from '../context/SantiagoContext';
import { useApp } from '../../../../context/AppContext';
import { getTiendasSantiagoHoy, TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import { formatCod, matchCodArchivo } from '../../rutas/utils/helpers';
import { getTiendasSantiagoHoyGrouped, getCalendarioSantiagoInicialHoy } from '../utils/calendarSantiago';
import { guideKey } from '../utils/guideKey';
import { subscribeToCalendarChanges } from '../../utils/useCalendario';
import { getTiendasAdelantoHoy } from '../../shared/tiendasAdelanto';
import { CalManualSheet, type ManualLine } from '../../shared/CalManualSheet';
import type { TiendaSantiago, TipoCargamento, ContenidoSantiago, EstadoItem, SantiagoItem } from '../types';
import { type PickingSlot } from '../components/PickingSlotCards';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { StoreProgressBar } from '../../shared/StoreProgressBar';
import { SectionCount } from '../../shared/SectionCount';
import { sectionProgress } from '../../shared/sectionProgress';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { sumPeso } from '../../shared/combineUtils';
import { unionRefs } from '../../shared/unifyPallets';
import { tipoBadge } from '../tipoTienda';
import { logActividad } from '@/lib/actividad';
import { ordenarCardsPorTipo } from '../../shared/ordenCards';
import { reconcileSavedRows, findItemForRow } from '../../shared/formRowsReconcile';
import { AgregarPalletDialog } from '@/features/despacho/shared/AgregarPalletDialog';
import { supabase } from '../../../../lib/supabase';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { fetchSessionState, subscribeToSessionState, pushSessionState } from '@/lib/userSessionState';
import { processPdf } from '../../regiones/utils/pdfUtils';
import { isRegionesCod } from '../../regiones/data/tiendas';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useDayRollover } from '@/hooks/useDayRollover';
import { MAX_ALTO_CM, excedeAltoMax } from '../../shared/palletLimits';

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

/* ── Consumed picking slots (physical pallet merges) ── */
type ConsumedSlotsS = Record<string, { p: number; b: number; c: number }>;
const CONSUMED_SLOTS_S_KEY = `consumedPickingSlotsS_${todayKey}`;
function loadConsumedSlotsS(): ConsumedSlotsS { try { return JSON.parse(localStorage.getItem(CONSUMED_SLOTS_S_KEY) || '{}'); } catch { return {}; } }
function saveConsumedSlotsS(v: ConsumedSlotsS) { try { localStorage.setItem(CONSUMED_SLOTS_S_KEY, JSON.stringify(v)); } catch {} }

/* ── Constants ── */
const CONTENIDO_PALLET:     ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto'];
const CONTENIDO_BULTO:      ContenidoSantiago[] = ['Hogar', 'Chocolate'];
const CONTENIDO_CONTENEDOR: ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto'];

// Flag de rollback: `false` = vista compacta siempre (estado vacío = botones +Pallet/+Bulto/…,
// al elegir el tipo aparece la card-formulario con su #). `true` = volver al formulario grande
// (renderSingleForm) como estado vacío. Se mantiene mientras se verifica el flujo nuevo en vivo.
const USAR_FORM_GRANDE: boolean = false;
const ESTADO_DEFAULT: EstadoItem = 'Listo para despachar';
const ESTADOS: EstadoItem[] = [
  'Listo para despachar', 'Despachado', 'Carga recibida', 'Carga No recibida por tienda',
];
const CHOCOLATE_BULTO_DIMS = { alto: 38, largo: 78, ancho: 52, peso: 5 }; // Bulto con contenido Chocolate (legado)
const CHOCOLATE_DIMS       = { alto: 42, largo: 80, ancho: 56, pesoMax: 25 }; // Tipo Chocolate CH (oficial)
const CHOCOLATE_DEFAULT_PESO = 20; // Peso por defecto al auto-agregar un chocolate (editable en línea, 1-25 kg)

// Alias de códigos que llegan distintos en las guías PDF (campo "SEÑOR (ES)") vs el código real.
// Ej.: BUENAVENTURA 2 es 35BN2, pero en la guía aparece como 35BNT.
const GUIDE_COD_ALIAS: Record<string, string> = { '35BNT': '35BN2' };
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
  pickingSlotId?: number;  // FK a picking_pallets.id
  // [Unificar inline] La fila TARGET (P1) recién unificada: el source ya se sumó y se borró; P1
  // quedó reabierta con el peso sumado para ingresar la altura y "Agregar" (guardado normal).
  // Sólo flag visual (banner + ocultar chooser); el merge ya está persistido.
  mergeReopened?: boolean;
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
  despachoP, despachoB, despachoC, despachoCH, hasGuide, storeDoneOps = 0, storeTotalOps = 0,
  tipoCat,
  onSelect, onAddToday, onRemoveFromToday,
}: {
  t: TiendaSantiago; isActive: boolean; isToday: boolean;
  tipoCat?: string;
  itemCount: number; palletCount: number; contenedorCount: number; chocolateCount: number;
  despachoP?: number; despachoB?: number; despachoC?: number; despachoCH?: number;
  hasGuide?: boolean; storeStatus?: 'none' | 'partial' | 'complete'; storeDoneOps?: number; storeTotalOps?: number;
  onSelect: () => void;
  onAddToday?: () => void;
  onRemoveFromToday?: () => void;
}) {
  const boxCount = itemCount - palletCount - contenedorCount - chocolateCount;
  const expP     = despachoP ?? 0;
  const expB     = despachoB ?? 0;
  const expC     = despachoC ?? 0;
  const expCH    = despachoCH ?? 0;
  // Desconta los ya ingresados — ghost solo muestra los pendientes de picking
  const remP = Math.max(0, expP - palletCount);
  const remB = Math.max(0, expB - boxCount);
  const remC = Math.max(0, expC - contenedorCount);
  const remCH = Math.max(0, expCH - chocolateCount);
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
      {(() => {
        const tb = tipoBadge(tipoCat);
        return tb ? (
          <span style={{ marginTop: 2, fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 99, background: tb.bg, color: tb.color, lineHeight: 1.4, textTransform: 'uppercase' }}>
            {tb.label}
          </span>
        ) : null;
      })()}
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 min-h-[16px]">
        {/* Ghost badges: picking pendiente (desconta los ya ingresados) */}
        {remP > 0 && <span className="text-[11px] font-bold text-info/40 bg-[rgba(37,99,235,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-info/25">{remP}P</span>}
        {remB > 0 && <span className="text-[11px] font-bold text-warn/40 bg-[rgba(217,119,6,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-warn/25">{remB}B</span>}
        {remC > 0 && <span className="text-[11px] font-bold text-[rgba(107,33,168,0.40)] bg-[rgba(107,33,168,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-[rgba(107,33,168,0.25)]">{remC}C</span>}
        {remCH > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none border border-dashed" style={{ color: 'rgba(146,64,14,0.45)', background: 'rgba(146,64,14,0.05)', borderColor: 'rgba(146,64,14,0.25)' }}>{remCH}CH</span>}
        {/* Solid badges: items ingresados en despacho */}
        {palletCount     > 0 && <span className="text-[11px] font-bold text-info bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 rounded-full leading-none">{palletCount}P</span>}
        {boxCount        > 0 && <span className="text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.12)] px-1.5 py-0.5 rounded-full leading-none">{boxCount}B</span>}
        {contenedorCount > 0 && <span className="text-[11px] font-bold text-[#6B21A8] bg-[rgba(107,33,168,0.10)] px-1.5 py-0.5 rounded-full leading-none">{contenedorCount}C</span>}
        {chocolateCount  > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ color: '#92400E', background: 'rgba(146,64,14,0.10)' }}>{chocolateCount}CH</span>}
      </div>
      <StoreProgressBar total={storeTotalOps} done={storeDoneOps} variant="grid" showCount />
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
function TiendaFormHeader({ tienda, pallets, bultos, chocolates = 0, contenedores = 0, onBack, swipe }: {
  tienda: TiendaSantiago; pallets: number; bultos: number; chocolates?: number; contenedores?: number; onBack: () => void;
  swipe?: { start: (e: React.TouchEvent) => void; move: (e: React.TouchEvent) => void; end: () => void };
}) {
  return (
    <div className="bg-navy px-3 py-3 flex items-center gap-2 flex-shrink-0 touch-none select-none"
      onTouchStart={swipe?.start}
      onTouchMove={swipe?.move}
      onTouchEnd={swipe?.end}>
      <button onClick={onBack}
        className="flex items-center justify-center w-8 h-8 text-white/70 text-[20px] cursor-pointer border-none bg-white/10 rounded-full flex-shrink-0 active:bg-white/20 touch-auto">
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
        <div className="text-center">
          <div className="font-barlow-condensed text-[22px] font-extrabold text-[#E9A178] leading-none">{chocolates}</div>
          <div className="text-[9px] text-white/50 uppercase tracking-widest">CH</div>
        </div>
        {contenedores > 0 && (
          <div className="text-center">
            <div className="font-barlow-condensed text-[22px] font-extrabold text-[#C4A3E8] leading-none">{contenedores}</div>
            <div className="text-[9px] text-white/50 uppercase tracking-widest">C</div>
          </div>
        )}
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
  const odooProgress = useOdooProgress();  // tiendas con picking terminado hoy
  useDayRollover();  // recarga al cruzar medianoche → evita guías/estado fantasma del día anterior

  /* Mobile view */
  const [view, setView] = useState<'list' | 'form' | 'resumen'>('list');

  /* Calendar */
  const [extraCods,    setExtraCods]    = useState<string[]>(loadExtra);
  const [removedCods,  setRemovedCods]  = useState<string[]>(loadRemoved);
  // Tiendas de adelanto de hoy con destino Santiago/Costa (zona rm | costa).
  // Entran al flujo de la bodega sin tocar el calendario central.
  const [adelantoCods, setAdelantoCods] = useState<string[]>([]);
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
  const [showCalManual,   setShowCalManual]   = useState(false);
  const [combineModal,    setCombineModal]     = useState<{ srcIdx: number; tgtIdx: number; cod?: string } | null>(null);
  const [formMergeState, setFormMergeState] = useState<{ sourceId: string; targetId: string | null } | null>(null);
  const itemDragRefs  = useRef<(HTMLDivElement | null)[]>([]);
  const longPressRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Combine items — resumen view */
  const [rDragIdx, setRDragIdx] = useState<number | null>(null);
  const [rDropIdx, setRDropIdx] = useState<number | null>(null);
  const [rDragCod, setRDragCod] = useState<string | null>(null);
  const rLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Preset / multi-form */
  const [presets,       setPresets]      = useState<Record<string, { pallets: number; bultos: number; contenedores: number; chocolates: number }>>({});
  const [formRows,             setFormRows]             = useState<FormRow[]>([]);
  const [pickingSlots,         setPickingSlots]          = useState<Record<string, { tipo: string; contenido: string }[]>>({});
  const [pickingSlotsFull,     setPickingSlotsFull]      = useState<Record<string, PickingSlot[]>>({});
  const [consumedSlotsSant,    setConsumedSlotsSant]     = useState<ConsumedSlotsS>(() => typeof window === 'undefined' ? {} : loadConsumedSlotsS());

  const [showTodas, setShowTodas] = useState(false);

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
  const [guideDragOver,  setGuideDragOver]  = useState(false);
  const guideFileRef = useRef<HTMLInputElement>(null);

  /* ── Resizable panels (left + right, center takes flex-1) ── */
  const { width: leftWidth, isDesktop, handleMouseDown: handleLeftMouseDown, handleTouchStart: handleLeftTouchStart } =
    useResizablePanel({ storageKey: 'santiago_left_panel_width',  defaultWidth: 320, min: 200, max: 520 });
  const { width: rightWidth, handleMouseDown: handleRightMouseDown, handleTouchStart: handleRightTouchStart } =
    useResizablePanel({ storageKey: 'santiago_right_panel_width', defaultWidth: 300, min: 200, max: 520, inverted: true });

  /* Calendar from Sheets */
  const [sheetsTodayGrouped, setSheetsTodayGrouped] = useState<{ rm: string[]; costa: string[] }>(getCalendarioSantiagoInicialHoy);
  const [selectedGrps, setSelectedGrps] = useState<Set<'rm' | 'costa'>>(new Set(['rm']));

  /* Dynamic tiendas from Supabase (merged with static at runtime) */
  const [supabaseTiendasMap, setSupabaseTiendasMap] = useState<Record<string, TiendaSantiago>>({});
  const [tipoCatByCod, setTipoCatByCod] = useState<Record<string, string>>({}); // tipo real del catálogo para el badge

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
    // [P9] Catch-up de guías: re-consulta al reconectar Realtime y al volver a la pestaña/app.
    const refetchGuides = () => { void fetchSessionState('guides').then(applyRemoteGuides).catch(() => {}); };
    let realtimeConnected = false;
    const unsub = subscribeToSessionState('guides', '', applyRemoteGuides, (connected) => {
      const reconnected = connected && !realtimeConnected;
      realtimeConnected = connected;
      if (reconnected) refetchGuides();
    });
    const onVis = () => { if (document.visibilityState === 'visible') refetchGuides(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
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
      // Código de tienda CONOCIDO más largo con el que empieza el nombre (número inicial + letras +
      // dígito final). Evita que "38SP2" se lea como "38SP" o se confunda con "24SPP".
      // Fallback (alias, ej. 35BNT → 35BN2) resuelto dentro del helper.
      const storeCod = matchCodArchivo(file.name, Object.keys(codMap), GUIDE_COD_ALIAS);
      if (!storeCod) { skipped++; continue; }
      try {
        const data = await processPdf(file);
        if (!data.guias.length) data.guias = [{ num: clean, total: 0 }];
        // Indexar por clave canónica (guideKey) para que la card refleje la guía sin importar la
        // variante Unicode del código con Ñ (37VIÑ/23PEÑ pueden venir en NFC, NFD o sin tilde).
        newGuides[guideKey(storeCod)] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum };

        // Subir el PDF (con timbres) al storage y registrar la guía para que el
        // manifiesto la muestre/descargue. En bodega suele subirse antes de existir
        // el manifiesto: la guía queda persistida y el manifiesto la jala al crearse.
        try {
          const fd = new FormData();
          fd.append('file', file);
          const driveRes = await fetch('/api/drive-upload', { method: 'POST', body: fd });
          const driveUrl = driveRes.ok ? (await driveRes.json()).fileId as string : undefined;
          void fetch('/api/ruta-guias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_cod: storeCod, folios: data.guias.map(g => g.num), drive_url: driveUrl }),
          });
        } catch { /* no bloquear la asignación local si falla la subida */ }

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

    // Tiendas de adelanto de hoy (solo zona Santiago/Costa)
    getTiendasAdelantoHoy()
      .then(list => setAdelantoCods(list.filter(a => a.zona === 'rm' || a.zona === 'costa').map(a => a.store_cod)))
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
        // Tipo REAL del catálogo (Mall/StripCenter/Tienda) para el badge de las cards. Se guarda
        // aparte porque `TiendaSantiago.tipo` colapsa todo a MALL/STRIPCENTER (pierde TIENDA).
        const tcat: Record<string, string> = {};
        for (const t of data) {
          const cod = String(t.codigo ?? '');
          if (!cod || t.activo === false) continue;
          const corredor = String(t.corredor ?? '').toLowerCase();
          const region   = String(t.region   ?? '').toLowerCase();
          const isVR     = corredor.includes('costa') || region.includes('valparaíso') || region === 'vr';
          const raw      = String(t.frecuencia ?? '');
          const dias     = raw ? raw.split(/[,;\s]+/).map(d => d.trim().toUpperCase()).filter(Boolean) : [];
          const tipoVal  = String(t.tipo ?? '');
          if (tipoVal) tcat[cod] = tipoVal;
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
        setTipoCatByCod(tcat);
      })
      .catch(() => {});
  }, []);

  /* Despacho ↔ Santiago bidirectional sync */
  const [despachoCounts, setDespachoCounts] = useState<Record<string, { p: number; b: number; c: number }>>({});

  // Write santiagoCounts whenever items change → Despacho reads this
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const counts: Record<string, { p: number; b: number; c: number; ch: number }> = {};
    Object.entries(items).forEach(([cod, list]) => {
      const p  = list.filter(i => i.tipo === 'Pallet').length;
      const b  = list.filter(i => i.tipo === 'Bulto').length;
      const c  = list.filter(i => i.tipo === 'Contenedor').length;
      const ch = list.filter(i => i.tipo === 'Chocolate').length;
      if (p > 0 || b > 0 || c > 0 || ch > 0) counts[cod] = { p, b, c, ch };
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
        .select('id,store_cod,tipo,contenido,seq,canonical_id,peso_kg,alto,largo,ancho,peso_v,is_active')
        .eq('date', dateStr)
        .eq('is_active', true)
        .order('id', { ascending: true });
      if (!data) return;
      const slots: Record<string, { tipo: string; contenido: string }[]> = {};
      const full:  Record<string, PickingSlot[]> = {};
      for (const row of data) {
        const cod = row.store_cod as string;
        if (!slots[cod]) { slots[cod] = []; full[cod] = []; }
        slots[cod].push({ tipo: (row.tipo as string) || 'P', contenido: (row.contenido as string) || 'hogar' });
        full[cod].push({
          id:           row.id as number,
          tipo:         (row.tipo as string) || 'P',
          contenido:    (row.contenido as string) || 'hogar',
          seq:          row.seq as number | null,
          canonical_id: row.canonical_id as string | null,
          peso_kg:      row.peso_kg as number | null,
          alto:         row.alto as number | null,
          largo:        row.largo as number | null,
          ancho:        row.ancho as number | null,
          peso_v:       row.peso_v as number | null,
        });
      }
      setPickingSlots(slots);
      setPickingSlotsFull(full);
    };

    void load();

    // Debounce: bursts of events (e.g. combine op touching many rows) collapse into one reload
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const unsub = subscribeToPickingPallets(debounced, load);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);

  const prevContenidoRef     = useRef<ContenidoSantiago>('Hogar');
  const formScrollRef        = useRef<HTMLDivElement>(null);
  const formScrollDesktopRef = useRef<HTMLDivElement>(null);
  const pickingSlotsRef      = useRef(pickingSlots);
  const pickingSlotsFullRef  = useRef(pickingSlotsFull);
  const sheetRef             = useRef<HTMLDivElement>(null);
  const sheetDrag            = useRef({ start: 0, delta: 0 });

  /* Keep ref in sync so form-init effect always reads latest picking without re-running */
  useEffect(() => { pickingSlotsRef.current     = pickingSlots;     }, [pickingSlots]);
  useEffect(() => { pickingSlotsFullRef.current = pickingSlotsFull; }, [pickingSlotsFull]);

  /* ── Derived ── */
  const localTodayCods  = getTiendasSantiagoHoy().map(t => t.cod);
  const sheetsAllCods   = [...sheetsTodayGrouped.rm, ...sheetsTodayGrouped.costa];
  const baseTodayCods   = sheetsAllCods.length > 0 ? sheetsAllCods : localTodayCods;
  const baseConAdelanto = [...baseTodayCods, ...adelantoCods.filter(c => !baseTodayCods.includes(c))];
  const allTodayCods    = [...baseConAdelanto, ...extraCods.filter(c => !baseConAdelanto.includes(c))]
    .filter(c => !removedCods.includes(c));
  // Static takes priority over Supabase (more carefully maintained)
  const tiendaByCod     = { ...supabaseTiendasMap, ...Object.fromEntries(TIENDAS_SANTIAGO.map(t => [t.cod, t])) };
  const todayTiendas    = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t);
  const filtered        = Object.values(tiendaByCod).filter(t => {
    // La bodega Santiago solo maneja Santiago (RM) + Costa (VR). Las tiendas de
    // Regiones llegan vía /api/tiendas y NO deben aparecer aquí (van en su propia bodega).
    if (isRegionesCod(t.cod)) return false;
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
  const statCH             = allItems.filter(i => i.tipo === 'Chocolate').length;
  const activeTiendasCount = Object.keys(items).filter(k => items[k].length > 0).length;
  // Contador "terminadas/total del día" por sección (desde todayTiendas = todas las del día,
  // sin importar el filtro RM/Costa activo). Costa = region 'VR'. Terminada = tienda con carga.
  // "Terminada" = movimientos de Odoo completos (semáforo verde, done === total), la MISMA señal
  // que la barra "X/Y movimientos" de la card. No cuenta carga registrada (items) ni guía subida.
  const isTiendaTerminada = (cod: string) => odooProgress.get(cod)?.status === 'complete';
  const rmProg    = sectionProgress(todayTiendas.filter(t => t.region !== 'VR'), t => isTiendaTerminada(t.cod));
  const costaProg = sectionProgress(todayTiendas.filter(t => t.region === 'VR'), t => isTiendaTerminada(t.cod));
  const activeTiendas      = [
    ...allTodayCods.filter(c => (items[c] || []).length > 0).map(c => [c, items[c]] as [string, typeof items[string]]),
    ...Object.entries(items).filter(([c, it]) => it.length > 0 && !allTodayCods.includes(c)),
  ];
  const tiendaItems        = currentTienda ? (items[currentTienda.cod] || []) : [];
  const tiendaPallets      = tiendaItems.filter(i => i.tipo === 'Pallet').length;
  const tiendaBultos       = tiendaItems.filter(i => i.tipo === 'Bulto').length;
  const tiendaChocolates   = tiendaItems.filter(i => i.tipo === 'Chocolate').length;
  const tiendaContenedores = tiendaItems.filter(i => i.tipo === 'Contenedor').length;

  // #6 — líneas del "Manual" (lo cargado en esta pantalla). El calendario del sheet es
  // el general de Picking (CalendarioColumnas), no una lista por zona.
  const calManualLines: ManualLine[] = activeTiendas.map(([cod, it]) => ({
    cod,
    nombre: getTiendaSantiagoByCod(cod)?.tienda,
    g: (getTiendaSantiagoByCod(cod)?.region === 'VR' ? 'costa' : 'rm') as 'costa' | 'rm',
    p:  it.filter(i => i.tipo === 'Pallet').length,
    b:  it.filter(i => i.tipo === 'Bulto').length,
    c:  it.filter(i => i.tipo === 'Contenedor').length,
    ch: it.filter(i => i.tipo === 'Chocolate').length,
  }));

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

  const enrutar = () => {
    const rutasInput = activeTiendas.map(([cod, it]) => ({
      c: cod,
      p: it.filter(i => i.tipo === 'Pallet').length,
      b: it.filter(i => i.tipo === 'Bulto').length,
      ch: it.filter(i => i.tipo === 'Chocolate').length,  // chocolates → detalle; suman al total de bultos
    })).filter(t => t.p > 0 || t.b > 0 || t.ch > 0);
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
    if (existing.length > 0) {
      // Bug A fix: when re-opening a store with existing items, initialise the preset bar
      // to reflect the counts already saved so the inputs show the correct numbers.
      const existP  = existing.filter(i => i.tipo === 'Pallet').length;
      const existB  = existing.filter(i => i.tipo === 'Bulto').length;
      const existC  = existing.filter(i => i.tipo === 'Contenedor').length;
      const existCH = existing.filter(i => i.tipo === 'Chocolate').length;
      setPresets(prev => ({
        ...prev,
        [t.cod]: { pallets: existP, bultos: existB, contenedores: existC, chocolates: existCH },
      }));
    } else if (!hasManualPreset) {
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
     so picking real-time updates do NOT retrigger this and wipe the user's in-progress form.
     useLayoutEffect (no useEffect) → corre antes del paint: nunca se pinta un frame con el
     form de la tienda anterior bajo el header de la nueva. */
  useLayoutEffect(() => {
    setTipo('Pallet'); setContenido('Hogar');
    setPeso(''); setAlto(''); setLargo(''); setAncho('');
    setEditingIdx(null);
    prevContenidoRef.current = 'Hogar';
    if (currentTienda) {
      setTimeout(() => {
        formScrollRef.current?.scrollTo({ top: 0 });
        formScrollDesktopRef.current?.scrollTo({ top: 0 });
      }, 60);
      const existing = items[currentTienda.cod] || [];
      const slots    = pickingSlotsRef.current[currentTienda.cod] ?? [];

      const SANT_TIPO: Record<string, TipoCargamento> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate' };
      const mapearCont = (raw: string): ContenidoSantiago => {
        const c = (raw ?? '').toLowerCase();
        if (c.includes('chocolate')) return 'Chocolate';   // [Req 1] pallet/bulto de chocolate → CH
        if (c === 'mixto' || c === 'comida-hogar') return 'Mixto';
        const esComida = c.includes('comida') || c.includes('alimento');
        const esHogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
        if (esComida && esHogar) return 'Mixto';
        if (esComida) return 'Comida';
        return 'Hogar';
      };

      const fullSlots = pickingSlotsFullRef.current[currentTienda.cod] ?? [];
      const baseSlots = fullSlots.length > 0
        ? fullSlots
        : slots.map(s => ({ id: 0, tipo: s.tipo, contenido: s.contenido,
            seq: null, canonical_id: null, peso_kg: null, alto: null, largo: null, ancho: null, peso_v: null }));
      const hasPicking = baseSlots.length > 0;

      if (hasPicking) {
        // ── Reconstrucción determinista: un row por slot de picking (incluye CH) ──
        // Indexar items guardados: por slot (pickingSlotId) y un pool por tipo de respaldo.
        const savedBySlot = new Map<number, SantiagoItem>();
        const leftoverByTipo = new Map<string, SantiagoItem[]>();
        for (const it of existing) {
          if (it.pickingSlotId) savedBySlot.set(it.pickingSlotId, it);
          else {
            const arr = leftoverByTipo.get(it.tipo) ?? [];
            arr.push(it); leftoverByTipo.set(it.tipo, arr);
          }
        }
        // Toma un item guardado del pool por tipo (fallback cuando se perdió el vínculo al slot)
        const takeLeftover = (t: TipoCargamento): SantiagoItem | undefined => {
          const pool = leftoverByTipo.get(t);
          return pool && pool.length ? pool.shift() : undefined;
        };

        // Punto 2: chocolates de picking sin item guardado → auto-agregar como AGREGADOS (20 kg)
        const chocToCreate: SantiagoItem[] = [];
        let chCount = existing.filter(i => i.tipo === 'Chocolate').length;

        const rows: FormRow[] = [];
        // Un row por cada slot P/B/C/CH: tarjeta guardada si ya se llenó, si no formulario vacío
        baseSlots.forEach((s, i) => {
          const sid  = (s as { id?: number }).id || 0;
          const tipo = SANT_TIPO[s.tipo] ?? 'Pallet';
          // 1) match por slot  2) fallback: item guardado del mismo tipo sin vínculo
          let saved = sid ? savedBySlot.get(sid) : undefined;
          if (saved) savedBySlot.delete(sid);
          else saved = takeLeftover(tipo);

          // 3) Chocolate sin guardar → materializar agregado con peso por defecto
          if (!saved && tipo === 'Chocolate' && regimen) {
            const newCh: SantiagoItem = {
              id: `${currentTienda.cod}-chauto-${sid || i}-${Date.now()}`, tiendaCod: currentTienda.cod,
              tipo: 'Chocolate', contenido: mapearCont(s.contenido),
              peso: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
              pesoVolumetrico: 0, regimen, orden: `CH${++chCount}`, estado: ESTADO_DEFAULT,
              pickingSlotId: sid || undefined,
            };
            chocToCreate.push(newCh);
            saved = newCh;
          }

          if (saved) {
            // Un ítem guardado SIEMPRE se muestra como tarjeta (nunca vuelve a formulario)
            rows.push({
              id: `saved-${sid || i}-${Date.now()}`, tipo: saved.tipo, contenido: saved.contenido,
              peso: String(saved.peso ?? ''), alto: String(saved.alto ?? ''),
              largo: String(saved.largo ?? ''), ancho: String(saved.ancho ?? ''),
              saved: true, savedItem: saved, pickingSlotId: sid || saved.pickingSlotId,
            });
          } else {
            rows.push({
              id: `pick-${sid || i}-${Date.now()}`, tipo,
              contenido: mapearCont(s.contenido),
              peso:  s.peso_kg != null ? String(s.peso_kg) : '',
              alto:  s.alto    != null ? String(s.alto)    : '',
              largo: s.largo   != null ? String(s.largo)   : '',
              ancho: s.ancho   != null ? String(s.ancho)   : '',
              pickingSlotId: sid || undefined,
            });
          }
        });
        // Items guardados sin slot vigente (manuales o slot eliminado) → al final, siempre como tarjeta
        const remaining: SantiagoItem[] = [...savedBySlot.values()];
        for (const pool of leftoverByTipo.values()) remaining.push(...pool);
        for (const it of remaining) {
          rows.push({
            id: `savedm-${it.id}`, tipo: it.tipo, contenido: it.contenido,
            peso: String(it.peso ?? ''), alto: String(it.alto ?? ''),
            largo: String(it.largo ?? ''), ancho: String(it.ancho ?? ''),
            saved: true, savedItem: it, pickingSlotId: it.pickingSlotId,
          });
        }
        setFormRows(rows);

        // Persistir en el estado los chocolates auto-agregados (una sola vez por visita)
        if (chocToCreate.length > 0) {
          dispatch({ type: 'SET_ITEMS', tiendaCod: currentTienda.cod, items: [...existing, ...chocToCreate] });
          // Reflejar el peso por defecto en picking_pallets (Seguimiento/Enrutador)
          for (const ch of chocToCreate) {
            if (!ch.pickingSlotId) continue;
            supabase.from('picking_pallets').update({
              peso_kg: ch.peso, alto: ch.alto, ancho: ch.ancho, largo: ch.largo,
            }).eq('id', ch.pickingSlotId).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
          }
        }
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
          const chocPresetCount = Math.max(0, (preset.chocolates ?? 0) - existing.filter(x => x.tipo === 'Chocolate').length);
          if (chocPresetCount > 0 && state.regimen) {
            const regimen = state.regimen;
            const chocItems: SantiagoItem[] = Array.from({ length: chocPresetCount }, (_, i) => ({
              id: `ch-pre-${Date.now()}-${i}`, tiendaCod: currentTienda.cod,
              tipo: 'Chocolate' as TipoCargamento, contenido: 'Hogar' as ContenidoSantiago,
              peso: 25, alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
              pesoVolumetrico: 0, regimen, orden: `CH${i + 1}`, estado: ESTADO_DEFAULT,
            }));
            dispatch({ type: 'SET_ITEMS', tiendaCod: currentTienda.cod, items: chocItems });
          }
          setFormRows(rows);
        } else {
          // Sin picking, sin items, sin preset: sin filas. La vista compacta (renderMultiForm)
          // mostrará solo los botones + Pallet / + Bulto / + Cont. / + Choc.; al elegir el tipo se
          // agrega la card-formulario (addFormRow crea el slot → # al Agregar).
          setFormRows([]);
        }
      } else {
        // Sin picking pero con items guardados → tarjetas guardadas (recuperan #id)
        const savedRows: FormRow[] = existing
          .map((item, i) => ({
            id: `saved-${i}-${item.tipo}-${Date.now()}`,
            tipo: item.tipo, contenido: item.contenido,
            peso: String(item.peso ?? ''), alto: String(item.alto ?? ''),
            largo: String(item.largo ?? ''), ancho: String(item.ancho ?? ''),
            saved: true, savedItem: item, pickingSlotId: item.pickingSlotId,
          }));
        setFormRows(savedRows);
      }
    } else {
      setFormRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTienda?.cod]);

  /* Reconciliar formRows tras un merge remoto (eco de shared_session_state → LOAD_STATE):
     el array de items de la tienda se reemplaza y se renumera `orden`, pero el
     useLayoutEffect (deps [currentTienda?.cod]) NO se re-dispara → el `savedItem` de cada
     fila queda obsoleto y "SUMAR A PALLET" puede fallar (UI congelada). Aquí sólo
     refrescamos la referencia `savedItem` de las filas guardadas; las filas en progreso
     (no guardadas) se preservan intactas. Deps: identidad del array de la tienda actual. */
  const currentItems = currentTienda ? items[currentTienda.cod] : undefined;
  useEffect(() => {
    if (!currentTienda || !currentItems) return;
    setFormRows(prev => {
      const next = reconcileSavedRows(prev, currentItems);
      return next === prev ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItems, currentTienda?.cod]);

  /* [Backfill de slots que llegan tarde] El fetch de picking_pallets es asíncrono; si al
     recargar la página la tienda ya está seleccionada, el rebuild (useLayoutEffect [cod]) corre
     ANTES de que lleguen los slots y no se re-dispara → faltan tarjetas (p. ej. el P2 no aparece
     hasta navegar y volver). Aquí agregamos UNA fila por cada slot activo que aún no tenga
     tarjeta, SIN tocar las filas existentes (no pisa lo que el usuario está escribiendo). */
  useEffect(() => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const fullSlots = pickingSlotsFull[cod] ?? [];
    if (fullSlots.length === 0) return;
    const SANT_TIPO: Record<string, TipoCargamento> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate' };
    const mapC = (raw: string): ContenidoSantiago => {
      const c = (raw ?? '').toLowerCase();
      if (c.includes('chocolate')) return 'Chocolate';
      if (c === 'mixto' || c === 'comida-hogar') return 'Mixto';
      const comida = c.includes('comida') || c.includes('alimento');
      const hogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
      if (comida && hogar) return 'Mixto';
      if (comida) return 'Comida';
      return 'Hogar';
    };
    const cur = items[cod] || [];
    setFormRows(prev => {
      const repIds = new Set(prev.map(r => r.pickingSlotId).filter((x): x is number => x != null));
      // CH lo maneja el rebuild (auto-agregado); aquí sólo P/B/C que llegaron tarde.
      const missing = fullSlots.filter(s => !repIds.has(s.id) && s.tipo !== 'CH');
      if (missing.length === 0) return prev;
      const add: FormRow[] = missing.map(s => {
        const saved = cur.find(it => it.pickingSlotId === s.id);
        if (saved) return {
          id: `bk-saved-${s.id}`, tipo: saved.tipo, contenido: saved.contenido,
          peso: String(saved.peso ?? ''), alto: String(saved.alto ?? ''),
          largo: String(saved.largo ?? ''), ancho: String(saved.ancho ?? ''),
          saved: true, savedItem: saved, pickingSlotId: s.id,
        };
        return {
          id: `bk-pick-${s.id}`, tipo: SANT_TIPO[s.tipo] ?? 'Pallet', contenido: mapC(s.contenido),
          peso: s.peso_kg != null ? String(s.peso_kg) : '', alto: s.alto != null ? String(s.alto) : '',
          largo: s.largo != null ? String(s.largo) : '', ancho: s.ancho != null ? String(s.ancho) : '',
          pickingSlotId: s.id,
        };
      });
      return [...prev, ...add];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingSlotsFull, currentTienda?.cod, items]);

  /* [Limpiar contador obsoleto] `consumedSlotsSant` era el mecanismo viejo para "consumir" un
     slot unificado (el fantasma "¿Con cuál fue unificado?"). Ahora la unificación BORRA el slot,
     así que ese contador quedó obsoleto y, si arrastra un valor viejo (localStorage), hace que el
     badge del tile muestre de menos. Se resetea al montar. */
  useEffect(() => { setConsumedSlotsSant({}); saveConsumedSlotsS({}); }, []);

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
  const saveItem = async () => {
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

    // Crear el slot de bodega (id + canonical) para que el pallet SIEMPRE tenga código, aun antes de
    // que Picking reporte. Antes saveItem NO creaba slot → el pallet quedaba sin # (aun tras Agregar).
    const TIPO_CODE: Record<TipoCargamento, string> = { Pallet: 'P', Bulto: 'B', Contenedor: 'C', Chocolate: 'CH' };
    let slot: PickingSlot | undefined;
    try {
      const res = await fetch('/api/picking-pallets/create-bodega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), store_cod: cod, tipo: TIPO_CODE[tipo], contenido: (contenido || 'hogar').toLowerCase() }),
      });
      slot = (await res.json() as { data?: PickingSlot }).data;
    } catch { /* sin slot: el pallet queda sin # (fallback), no bloquea el guardado */ }
    if (slot) setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot!] }));

    dispatch({
      type: 'ADD_ITEM',
      item: {
        id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo, contenido,
        peso: parseFloat(peso), alto: pA, largo: pL, ancho: pW,
        pesoVolumetrico: Math.round(pesoV * 100) / 100, regimen,
        orden,
        estado: ESTADO_DEFAULT,
        pickingSlotId: slot?.id,
      },
    });
    if (slot?.id) {
      supabase.from('picking_pallets').update({
        peso_kg: parseFloat(peso), alto: pA, ancho: pW, largo: pL,
      }).eq('id', slot.id).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
    }
    setPeso(''); setAlto(''); setLargo(''); setAncho('');
    showToast(`✓ ${orden} agregado`, '#16A34A');
  };

  const startEdit = (idx: number) => {
    const item = tiendaItems[idx];
    setEditingIdx(idx); setTipo(item.tipo); setContenido(item.contenido);
    setPeso(String(item.peso)); setAlto(String(item.alto));
    if (item.tipo === 'Bulto') { setLargo(String(item.largo)); setAncho(String(item.ancho)); }
    formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    formScrollDesktopRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
      setTimeout(() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }, 340);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
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

  const saveRow = async (row: FormRow) => {
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

    // Si el row no tiene slot (p. ej. el P1 sembrado al abrir la tienda), crear uno de bodega para
    // que el pallet SIEMPRE tenga # aun antes de que Picking reporte (igual que "+ Pallet"/saveItem).
    let slotId = row.pickingSlotId;
    let nuevoSlot: PickingSlot | undefined;
    if (!slotId) {
      const TIPO_CODE: Record<TipoCargamento, string> = { Pallet: 'P', Bulto: 'B', Contenedor: 'C', Chocolate: 'CH' };
      try {
        const resSlot = await fetch('/api/picking-pallets/create-bodega', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), store_cod: cod, tipo: TIPO_CODE[row.tipo], contenido: (row.contenido || 'hogar').toLowerCase() }),
        });
        nuevoSlot = (await resSlot.json() as { data?: PickingSlot }).data;
        if (nuevoSlot) { slotId = nuevoSlot.id; setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), nuevoSlot!] })); }
      } catch { /* sin slot: queda sin # (fallback), no bloquea el guardado */ }
    }

    const existing = items[cod] || [];
    const pc  = existing.filter(i => i.tipo === 'Pallet').length + 1;
    const bc  = existing.filter(i => i.tipo === 'Bulto').length + 1;
    const cc  = existing.filter(i => i.tipo === 'Contenedor').length + 1;
    const chc = existing.filter(i => i.tipo === 'Chocolate').length + 1;
    const pickingSlot = nuevoSlot ?? (slotId
      ? (pickingSlotsFull[cod] ?? []).find(s => s.id === slotId)
      : undefined);
    const savedItem: SantiagoItem = {
      id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo: row.tipo, contenido: row.contenido,
      peso: p, alto: a, largo: fL, ancho: fA,
      pesoVolumetrico: Math.round((a * fL * fA) / 6000 * 100) / 100, regimen,
      orden: row.tipo === 'Pallet' ? `P${pc}` : row.tipo === 'Contenedor' ? `C${cc}` : row.tipo === 'Chocolate' ? `CH${chc}` : `${bc}B`,
      estado: ESTADO_DEFAULT,
      pickingSlotId: slotId,
      canonical_id: pickingSlot?.canonical_id ?? undefined,
    };
    dispatch({ type: 'ADD_ITEM', item: savedItem });
    setFormRows(prev => prev.map(r => r.id === row.id ? { ...r, saved: true, savedItem, pickingSlotId: slotId } : r));
    showToast(`✓ ${savedItem.orden} agregado`, '#16A34A');
    logActividad({ accion: 'registrar_item', fuente: 'rmcosta', tiendaCod: currentTienda.cod,
      tiendaNombre: currentTienda.tienda, label: savedItem.orden, peso: p, alto: a,
      contenido: savedItem.contenido, slotId });

    // Sincronizar dimensiones en picking_pallets si el row tiene slot vinculado
    if (slotId) {
      supabase.from('picking_pallets').update({
        peso_kg: p, alto: a, ancho: fA, largo: fL,
        peso_v: Math.round((a * fL * fA) / 6000 * 10) / 10 || null,
      }).eq('id', slotId).then(({ error }) => {
        if (error) console.error('[picking_pallets update]', error.message);
      });
    }
  };

  const editSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (!row?.savedItem) return;
    const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === row.savedItem!.id);
    if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: false, savedItem: undefined } : r));
  };

  // Borra el slot de picking_pallets vinculado y lo quita de pickingSlotsFull
  const deletePickingSlot = (slotId?: number) => {
    if (!slotId || !currentTienda) return;
    const cod = currentTienda.cod;
    supabase.from('picking_pallets').delete().eq('id', slotId).then(({ error }) => {
      if (error) console.error('[picking_pallets delete]', error.message);
    });
    setPickingSlotsFull(prev => {
      const next = { ...prev };
      if (next[cod]) next[cod] = next[cod].filter(s => s.id !== slotId);
      return next;
    });
  };

  const deleteSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (row?.savedItem) {
      const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === row.savedItem!.id);
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
      logActividad({ accion: 'eliminar_item', fuente: 'rmcosta', tiendaCod: currentTienda.cod,
        tiendaNombre: currentTienda.tienda, label: row.savedItem.orden, slotId: row.savedItem.pickingSlotId });
    }
    deletePickingSlot(row?.pickingSlotId ?? row?.savedItem?.pickingSlotId);
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  // Quitar un form row sin guardar (✕) — también borra su slot.
  const removeUnsavedRow = (rowId: string) => {
    const row = formRows.find(r => r.id === rowId);
    deletePickingSlot(row?.pickingSlotId);
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  // [Unificar inline] La unificación P3→P1 se hace ahora inline y automática (iniciarUnionInline
  // suma+borra el source en el acto y reabre el target para la altura), conservando el código de
  // P1. Ya no se usa el modal ni /api/picking-pallets/combine para este flujo.

  // Sumar un Bulto/Chocolate a un Pallet/Contenedor: el bulto se elimina (item + slot) y su
  // peso se SUMA al destino (P3 #4). El destino conserva su altura. Sin modal ni altura.
  const sumarBultoAPallet = (bultoRowId: string, palletLabel: string, palletRowId: string) => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const bultoRow  = formRows.find(r => r.id === bultoRowId);
    const palletRow = formRows.find(r => r.id === palletRowId);
    if (!bultoRow || !palletRow) {
      // No debería pasar; si pasa, avisar en vez de quedarse en silencio (evita "freeze").
      showToast('No se pudo sumar: recarga la tienda e inténtalo otra vez', '#D97706');
      return;
    }
    const bultoPeso  = bultoRow.savedItem?.peso  ?? (parseFloat(bultoRow.peso)  || 0);
    const pesoActual = palletRow.savedItem?.peso ?? (parseFloat(palletRow.peso) || 0);
    const nuevoPeso  = sumPeso(pesoActual, bultoPeso);

    deletePickingSlot(bultoRow.pickingSlotId ?? bultoRow.savedItem?.pickingSlotId);

    // Contexto: un solo SET_ITEMS — quita el bulto guardado y suma el peso al pallet guardado,
    // luego renumera. El match es por id ESTABLE (id propio / pickingSlotId), que sobrevive al
    // renumerado tras un eco remoto (causa del "freeze"). Se reconfirma contra el contexto vivo.
    if (bultoRow.savedItem || palletRow.savedItem) {
      const cur = items[cod] || [];
      const targetInCtx = palletRow.savedItem
        ? findItemForRow(cur, { pickingSlotId: palletRow.pickingSlotId, savedItem: palletRow.savedItem })
        : undefined;
      if (palletRow.savedItem && !targetInCtx) {
        showToast('El pallet destino cambió — recarga la tienda e inténtalo otra vez', '#D97706');
        return;
      }
      const filtered = cur
        .filter(i => !(bultoRow.savedItem && i.id === bultoRow.savedItem.id))
        .map(i => (palletRow.savedItem && i.id === palletRow.savedItem.id) ? { ...i, peso: nuevoPeso } : i);
      let pc = 0, bc = 0, cc = 0, chc = 0;
      const renumbered = filtered.map(i => ({
        ...i,
        orden: i.tipo === 'Pallet' ? `P${++pc}` : i.tipo === 'Contenedor' ? `C${++cc}` : i.tipo === 'Chocolate' ? `CH${++chc}` : `${++bc}B`,
      }));
      dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: renumbered });
    }

    // Form: quitar el bulto y reflejar el nuevo peso en el pallet (card + savedItem)
    setFormRows(prev => prev
      .filter(r => r.id !== bultoRowId)
      .map(r => r.id === palletRowId
        ? { ...r, peso: String(nuevoPeso), savedItem: r.savedItem ? { ...r.savedItem, peso: nuevoPeso } : r.savedItem }
        : r));

    // BD: actualizar el peso del slot del destino (si tiene slot de picking)
    const targetSlotId = palletRow.pickingSlotId ?? palletRow.savedItem?.pickingSlotId;
    if (targetSlotId) {
      supabase.from('picking_pallets').update({ peso_kg: nuevoPeso }).eq('id', targetSlotId)
        .then(({ error }) => { if (error) console.error('[sumarBultoAPallet peso]', error.message); });
    }

    setFormMergeState(null);
    showToast(`Sumado a ${palletLabel} (+${bultoPeso}kg)`, '#2563EB');
    logActividad({ accion: 'sumar', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda.tienda,
      sourceLabel: bultoRow.tipo === 'Chocolate' ? 'CH' : 'bulto', label: palletLabel, peso: bultoPeso, slotId: targetSlotId });
  };

  /* ── Unificar pallets/contenedores INLINE (P3 → P1) ───────────────────────────────────
     Igual de automático que sumar un CH a un pallet: SIN modal ni confirmación. El peso de P3
     se suma a P1; P1 conserva su slot/código; P3 se borra (slot + item) en el acto. Luego P1
     se reabre como card editable con el peso ya sumado para ingresar/ajustar la altura y
     "Agregar" (guardado normal). Se actualizan AMBOS cachés de slots (light + full) para que
     NO aparezca el fantasma "¿Con cuál fue unificado?" (gP usa el light). Navegación-safe:
     el slot de P1 guarda el peso sumado, así el rebuild lo pre-rellena. */
  const iniciarUnionInline = (sourceRow: FormRow, targetRow: FormRow, srcLabel?: string, tgtLabel?: string) => {
    if (!currentTienda) return;
    const cod       = currentTienda.cod;
    const srcPeso   = sourceRow.savedItem?.peso ?? (parseFloat(sourceRow.peso) || 0);
    const tgtPeso   = targetRow.savedItem?.peso ?? (parseFloat(targetRow.peso) || 0);
    const nuevoPeso = sumPeso(tgtPeso, srcPeso);
    const prevAlto  = targetRow.savedItem?.alto ?? (parseFloat(targetRow.alto) || 0);
    const srcSlot   = sourceRow.pickingSlotId ?? sourceRow.savedItem?.pickingSlotId;
    const tgtSlot   = targetRow.pickingSlotId ?? targetRow.savedItem?.pickingSlotId;
    const srcCode   = sourceRow.tipo === 'Contenedor' ? 'C' : sourceRow.tipo === 'Chocolate' ? 'CH' : sourceRow.tipo === 'Bulto' ? 'B' : 'P';

    // 1) Items: quitar el item del source y el del target (el target se re-agrega al "Agregar").
    const cur = items[cod] || [];
    const filtered = cur.filter(i =>
      !(sourceRow.savedItem && i.id === sourceRow.savedItem.id) &&
      !(targetRow.savedItem && i.id === targetRow.savedItem.id));
    if (filtered.length !== cur.length) {
      let pc = 0, bc = 0, cc = 0, chc = 0;
      const renumbered = filtered.map(i => ({
        ...i,
        orden: i.tipo === 'Pallet' ? `P${++pc}` : i.tipo === 'Contenedor' ? `C${++cc}` : i.tipo === 'Chocolate' ? `CH${++chc}` : `${++bc}B`,
      }));
      dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: renumbered });
    }

    // 2) BD: sumar el peso al slot del target; fusionar guías y borrar el slot del source.
    if (tgtSlot) {
      supabase.from('picking_pallets').update({ peso_kg: nuevoPeso }).eq('id', tgtSlot)
        .then(({ error }) => { if (error) console.error('[union peso]', error.message); });
    }
    if (tgtSlot && srcSlot) finalizarSlotUnion(tgtSlot, srcSlot);
    else if (srcSlot) supabase.from('picking_pallets').delete().eq('id', srcSlot)
      .then(({ error }) => { if (error) console.error('[union delete]', error.message); });

    // 3) Cachés de slots: quitar el del source de AMBOS (full para el rebuild; light para gP/badge,
    //    así no aparece el fantasma), y reflejar el peso sumado en el slot del target (full).
    setPickingSlotsFull(prev => {
      const next = { ...prev };
      next[cod] = (next[cod] ?? [])
        .filter(s => s.id !== srcSlot)
        .map(s => s.id === tgtSlot ? { ...s, peso_kg: nuevoPeso } : s);
      return next;
    });
    setPickingSlots(prev => {
      const arr = [...(prev[cod] ?? [])];
      const idx = arr.findIndex(s => s.tipo === srcCode);
      if (idx >= 0) arr.splice(idx, 1);
      return { ...prev, [cod]: arr };
    });

    // 4) Form: quitar la card source; reabrir el target como card editable con el peso ya sumado
    //    y la altura previa pre-rellenada, para ingresar/ajustar la altura y "Agregar".
    setFormRows(prev => prev
      .filter(r => r.id !== sourceRow.id)
      .map(r => r.id === targetRow.id
        ? { ...r, saved: false, savedItem: undefined, peso: String(nuevoPeso),
            alto: prevAlto ? String(prevAlto) : '', mergeReopened: true }
        : r));
    setFormMergeState(null);
    showToast(`Unificado (+${srcPeso}kg) — ingresa la altura y Agregar`, '#2563EB');
    logActividad({ accion: 'unificar', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda.tienda,
      sourceLabel: srcLabel, label: tgtLabel, peso: nuevoPeso, slotId: tgtSlot });
  };

  // Fusiona las guías del source en el target (lee refs ANTES de borrar) y borra el slot del
  // source en la BD. Fire-and-forget: en el peor caso queda igual que hoy (sin fusión). El caché
  // local ya quitó el slot del source en iniciarUnionInline.
  const finalizarSlotUnion = async (targetId: number, sourceId: number) => {
    try {
      const { data } = await supabase.from('picking_pallets').select('id, refs').in('id', [targetId, sourceId]);
      const tRefs  = (data ?? []).find(d => d.id === targetId)?.refs as string | undefined;
      const sRefs  = (data ?? []).find(d => d.id === sourceId)?.refs as string | undefined;
      const merged = unionRefs(tRefs, sRefs);
      if (merged && merged !== (tRefs ?? '')) {
        await supabase.from('picking_pallets').update({ refs: merged }).eq('id', targetId);
      }
      await supabase.from('picking_pallets').delete().eq('id', sourceId);
    } catch (e) { console.error('[finalizarSlotUnion]', e); }
  };

  const absorbPickingSlotSant = (cod: string, type: 'p' | 'b' | 'c') => {
    setConsumedSlotsSant(prev => {
      const cur = prev[cod] || { p: 0, b: 0, c: 0 };
      const next = { ...prev, [cod]: { ...cur, [type]: cur[type] + 1 } };
      saveConsumedSlotsS(next);
      return next;
    });
  };

  // `existingSlot` viene del flujo "Preexistente" (pallet adelantado ya reclamado a hoy):
  // en ese caso NO se crea un slot nuevo, se usa el reclamado.
  const addFormRow = async (t: TipoCargamento, existingSlot?: PickingSlot) => {
    const cod = currentTienda?.cod;
    const TIPO_CODE: Record<TipoCargamento, string> = { Pallet: 'P', Bulto: 'B', Contenedor: 'C', Chocolate: 'CH' };
    const date = new Date().toISOString().slice(0, 10);

    // Chocolate: se agrega AGREGADO al instante con peso por defecto (sin formulario)
    if (t === 'Chocolate') {
      if (!cod || !regimen) { showToast('Selecciona régimen', '#D97706'); return; }
      // Crear el ID de bodega (canonical_id + seq) y vincularlo — o usar el preexistente
      let slot: PickingSlot | undefined = existingSlot;
      if (!slot) try {
        const res = await fetch('/api/picking-pallets/create-bodega', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, store_cod: cod, tipo: 'CH', contenido: 'hogar' }),
        });
        slot = (await res.json() as { data?: PickingSlot }).data;
      } catch { /* sin slot: queda como chocolate sin ID */ }
      if (slot) {
        setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot!] }));
      }
      const existing = items[cod] || [];
      const chc = existing.filter(i => i.tipo === 'Chocolate').length + 1;
      const stamp = Date.now();
      const item: SantiagoItem = {
        id: `${cod}-chadd-${stamp}`, tiendaCod: cod, tipo: 'Chocolate', contenido: 'Hogar',
        peso: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
        pesoVolumetrico: 0, regimen, orden: `CH${chc}`, estado: ESTADO_DEFAULT,
        pickingSlotId: slot?.id,
      };
      dispatch({ type: 'ADD_ITEM', item });
      setFormRows(prev => [...prev, {
        id: `saved-chadd-${stamp}`, tipo: 'Chocolate', contenido: 'Hogar',
        peso: String(CHOCOLATE_DEFAULT_PESO), alto: String(CHOCOLATE_DIMS.alto),
        largo: String(CHOCOLATE_DIMS.largo), ancho: String(CHOCOLATE_DIMS.ancho),
        saved: true, savedItem: item, pickingSlotId: slot?.id,
      }]);
      if (slot?.id) {
        supabase.from('picking_pallets').update({
          peso_kg: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS.alto, ancho: CHOCOLATE_DIMS.ancho, largo: CHOCOLATE_DIMS.largo,
        }).eq('id', slot.id).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
      }
      showToast(`✓ ${item.orden} agregado`, '#16A34A');
      return;
    }

    const rowId = `row-${Date.now()}`;
    // Agregar el form row de inmediato (respuesta visual), luego vincular el slot
    setFormRows(prev => [...prev, { id: rowId, tipo: t, contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' }]);
    if (!cod) return;

    // Preexistente: usar el slot ya reclamado (no se crea uno nuevo)
    if (existingSlot) {
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), existingSlot] }));
      setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, pickingSlotId: existingSlot.id } : r));
      return;
    }

    try {
      const res  = await fetch('/api/picking-pallets/create-bodega', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date, store_cod: cod, tipo: TIPO_CODE[t], contenido: 'hogar' }),
      });
      const json = await res.json() as { data?: PickingSlot };
      const slot = json.data;
      if (!slot) return;
      // Reflejar el slot nuevo en pickingSlotsFull (consistencia al re-renderizar)
      setPickingSlotsFull(prev => {
        const next = { ...prev };
        next[cod] = [...(next[cod] ?? []), slot];
        return next;
      });
      // Vincular el slot al form row recién creado
      setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, pickingSlotId: slot.id } : r));
    } catch { /* fallback: el row queda sin slot */ }
  };

  // Mapea el tipo del slot (P/B/C/CH) al TipoCargamento del formulario
  const SLOT_TIPO_TO_CARGAMENTO: Record<string, TipoCargamento> = { P: 'Pallet', B: 'Bulto', C: 'Contenedor', CH: 'Chocolate' };
  // Estado del diálogo "Nuevo / Preexistente"
  const [dialogTipo, setDialogTipo] = useState<TipoCargamento | null>(null);

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
          <div className="px-3 py-2 bg-[rgba(211,47,47,0.10)] border-b border-[rgba(211,47,47,0.20)] sticky top-0 z-10 flex items-center gap-2">
            <span className="font-barlow-condensed text-[15px] font-extrabold uppercase tracking-widest text-red">HOY</span>
            <span className="font-barlow-condensed text-[10px] text-red/50 uppercase tracking-wide hidden sm:inline">toca × para retirar</span>
            <span className="ml-auto flex items-center gap-2.5">
              {rmProg.total > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="font-barlow-condensed text-[10px] font-bold uppercase tracking-wider text-text-3">RM</span>
                  <SectionCount done={rmProg.done} total={rmProg.total} />
                </span>
              )}
              {costaProg.total > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="font-barlow-condensed text-[10px] font-bold uppercase tracking-wider text-text-3">Costa</span>
                  <SectionCount done={costaProg.done} total={costaProg.total} />
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {todayList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlots[t.cod] ?? [];
              const cnsS = consumedSlotsSant[t.cod] || { p: 0, b: 0, c: 0 };
              const pk = pkSlots.length > 0 ? { p: Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - cnsS.p), c: Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - cnsS.c), b: Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - cnsS.b) } : undefined;
              return (
                <TiendaGridCard key={t.cod} t={t} tipoCat={tipoCatByCod[t.cod]}
                  isActive={currentTienda?.cod === t.cod} isToday
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  contenedorCount={tI.filter(i => i.tipo === 'Contenedor').length}
                  chocolateCount={tI.filter(i => i.tipo === 'Chocolate').length}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  despachoCH={pkSlots.filter(s => s.tipo === 'CH').length}
                  hasGuide={!!guides[guideKey(t.cod)]} storeStatus={odooProgress.get(t.cod)?.status ?? 'none'} storeDoneOps={odooProgress.get(t.cod)?.done ?? 0} storeTotalOps={odooProgress.get(t.cod)?.total ?? 0}
                  onSelect={() => selectTienda(t)}
                  onRemoveFromToday={() => setConfirmRemove(t.tienda)} />
              );
            })}
          </div>
        </div>
      )}
      {othersList.length > 0 && (
        <div>
          <div
            onClick={() => todayList.length > 0 && setShowTodas(prev => !prev)}
            className={`px-3 py-2 bg-bg border-b border-border sticky top-0 z-10 flex items-center gap-2 ${todayList.length > 0 ? 'cursor-pointer' : ''}`}>
            <span className="font-barlow-condensed text-[13px] font-bold uppercase tracking-widest text-text-3 flex-1">Todas</span>
            <span className="font-barlow-condensed text-[10px] text-text-3/50 uppercase tracking-wide hidden sm:inline">toca + para agregar a hoy</span>
            {todayList.length > 0 && (
              <span className="font-barlow-condensed text-[12px] text-text-3/50 select-none ml-1">
                {showTodas ? '▲' : '▼'}
              </span>
            )}
          </div>
          {(showTodas || todayList.length === 0) && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
            {othersList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlots[t.cod] ?? [];
              const cnsS = consumedSlotsSant[t.cod] || { p: 0, b: 0, c: 0 };
              const pk = pkSlots.length > 0 ? { p: Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - cnsS.p), c: Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - cnsS.c), b: Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - cnsS.b) } : undefined;
              return (
                <TiendaGridCard key={t.cod} t={t} tipoCat={tipoCatByCod[t.cod]}
                  isActive={currentTienda?.cod === t.cod} isToday={false}
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  contenedorCount={tI.filter(i => i.tipo === 'Contenedor').length}
                  chocolateCount={tI.filter(i => i.tipo === 'Chocolate').length}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  despachoCH={pkSlots.filter(s => s.tipo === 'CH').length}
                  hasGuide={!!guides[guideKey(t.cod)]} storeStatus="none" storeDoneOps={0} storeTotalOps={0}
                  onSelect={() => selectTienda(t)}
                  onAddToday={() => setConfirmAdd(t.tienda)} />
              );
            })}
          </div>
          )}
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
      {/* Conteo: en desktop el conteo vive en la columna derecha (resumen), así que
          aquí solo se muestra en mobile para no restar espacio a la lista de tiendas. */}
      <div className="flex lg:hidden">
        {(() => {
          const stats = [
            { v: statP, l: 'Pallets', color: '#93C5FD' },
            { v: statB, l: 'Bultos',  color: '#FCD34D' },
            ...(statCH > 0 ? [{ v: statCH, l: 'Choc.', color: '#FBB6A0' }] : []),
            { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' },
          ];
          return stats.map(({ v, l, color }, i) => (
            <div key={l} className={`flex-1 py-2.5 text-center ${i < stats.length - 1 ? 'border-r border-white/10' : ''}`}>
              <div className="font-barlow-condensed text-[26px] font-bold leading-none" style={{ color }}>{v}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
            </div>
          ));
        })()}
      </div>
      <div className="px-3 pb-3 pt-1 flex gap-2">
        <button onClick={goToResumen}
          className="flex-1 py-2.5 bg-red text-white rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer active:bg-red-dark lg:hidden"
          style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.30)' }}>
          RESUMEN ({activeTiendasCount})
        </button>
        <button onClick={() => setShowCalManual(true)}
          className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95 bg-bg-2 text-text-2 border border-border"
          title="Manual para copiar / Calendario del día">
          <ClipboardList size={16} />
          <span className="hidden lg:inline font-barlow-condensed text-[14px] font-bold tracking-wide uppercase">Manual / Cal</span>
        </button>
        <button onClick={enrutar}
          className="flex-shrink-0 lg:flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95 bg-bg-2 text-text-2 border border-border"
          title="Ir al Enrutador">
          <Navigation size={16} />
          <span className="hidden lg:inline font-barlow-condensed text-[14px] font-bold tracking-wide uppercase">Enrutador</span>
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
              {todayTiendas.length > 0 && pendingTiendas.length === 0 && (
                <span className="font-barlow-condensed text-[12px] font-bold text-[#86EFAC] bg-[rgba(134,239,172,0.15)] px-2 py-0.5 rounded-full">✓ Hoy completo</span>
              )}
            </div>
          </div>
          <div className="flex gap-5 mb-2">
            {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, ...(statCH > 0 ? [{ v: statCH, l: 'Choc.', color: '#FBB6A0' }] : []), { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }) => (
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
        <div className="lg:hidden bg-navy flex-shrink-0">
          <div className="flex items-center">
            {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, ...(statCH > 0 ? [{ v: statCH, l: 'Choc.', color: '#FBB6A0' }] : []), { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }, i, arr) => (
              <div key={l} className={`flex-1 py-3 text-center ${i < arr.length - 1 ? 'border-r border-white/10' : ''}`}>
                <div className="font-barlow-condensed text-[26px] font-bold leading-none" style={{ color }}>{v}</div>
                <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>


        {/* Ver todo / Colapsar — always visible on all screen sizes */}
        {activeTiendasCount > 1 && (
          <div className="flex justify-end px-3 py-1.5 bg-bg border-b border-border flex-shrink-0">
            <button
              onClick={() => {
                const allCods = activeTiendas.map(([c]) => c);
                setResumenExpanded(resumenExpanded.size === allCods.length ? new Set() : new Set(allCods));
              }}
              className="font-barlow-condensed text-[12px] font-bold text-text-3 hover:text-navy active:text-navy cursor-pointer transition-colors border-none bg-transparent">
              {resumenExpanded.size === activeTiendasCount ? '▲ Colapsar' : '▼ Ver todo'}
            </button>
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
                                      <input type="number" value={re.alto} max={MAX_ALTO_CM}
                                        onChange={e => setResumenEditing(prev => prev ? { ...prev, alto: e.target.value } : prev)}
                                        className={INPUT_CLS} />
                                      {excedeAltoMax(parseFloat(re.alto) || 0) && (
                                        <div className="text-[10px] text-warn mt-0.5">⚠ máx {MAX_ALTO_CM} cm</div>
                                      )}
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
                                <span className="text-[12px] font-semibold text-text-2">{item.contenido === 'Chocolate' ? 'CH' : item.contenido}</span>
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
  const renderMultiForm = (isMobile = false) => {
    if (!currentTienda) return null;
    const pkSlots = pickingSlots[currentTienda.cod] ?? [];
    const swipeHandlers = isMobile ? { start: onSheetDragStart, move: onSheetDragMove, end: onSheetDragEnd } : undefined;
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} chocolates={tiendaChocolates} contenedores={tiendaContenedores} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} swipe={swipeHandlers} />

        <div ref={isMobile ? formScrollRef : formScrollDesktopRef} className="flex-1 overflow-y-auto px-2 py-2">
          {(() => {
            const cod = currentTienda.cod;
            const cns = consumedSlotsSant[cod] || { p: 0, b: 0, c: 0 };
            const tiendaItemsList = items[cod] || [];
            const gP  = Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - tiendaItemsList.filter(i => i.tipo === 'Pallet').length     - cns.p);
            const gB  = Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - tiendaItemsList.filter(i => i.tipo === 'Bulto').length      - cns.b);
            const gC  = Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - tiendaItemsList.filter(i => i.tipo === 'Contenedor').length  - cns.c);
            // Ghosts absorbed by unsaved form cards; remainder shown as standalone cards
            const unsavedP = formRows.filter(r => !r.saved && r.tipo === 'Pallet').length;
            const unsavedB = formRows.filter(r => !r.saved && r.tipo === 'Bulto').length;
            const unsavedC = formRows.filter(r => !r.saved && r.tipo === 'Contenedor').length;
            type GC = { type: 'p' | 'b' | 'c'; border: string; text: string; bg: string; label: string; key: string };
            const ghostCards: GC[] = [
              ...Array.from({ length: Math.max(0, gP - unsavedP) }, (_, i) => ({ type: 'p'  as const, border: 'rgba(37,99,235,0.35)',   text: '#2563EB', bg: 'rgba(37,99,235,0.03)',   label: 'Pallet', key: `gP${i}`  })),
              ...Array.from({ length: Math.max(0, gB - unsavedB) }, (_, i) => ({ type: 'b'  as const, border: 'rgba(217,119,6,0.35)',  text: '#D97706', bg: 'rgba(217,119,6,0.03)',   label: 'Bulto',  key: `gB${i}`  })),
              ...Array.from({ length: Math.max(0, gC - unsavedC) }, (_, i) => ({ type: 'c'  as const, border: 'rgba(107,33,168,0.35)', text: '#6B21A8', bg: 'rgba(107,33,168,0.03)', label: 'Cont.',  key: `gC${i}`  })),
            ];
            // [Req 3] Orden visual: Pallet → Contenedor → Bulto → Chocolate (estable). El estado
            // formRows queda igual; solo se ordena la VISTA. Los handlers operan por row.id.
            const orderedRows = ordenarCardsPorTipo(formRows, r => r.tipo);
            return (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {orderedRows.map((row, rowIdx) => {
              const tipoIdx  = orderedRows.slice(0, rowIdx + 1).filter(r => r.tipo === row.tipo).length;
              const rowLabel = row.tipo === 'Pallet' ? `P${tipoIdx}` : row.tipo === 'Contenedor' ? `C${tipoIdx}` : row.tipo === 'Chocolate' ? `CH${tipoIdx}` : `B${tipoIdx}`;
              if (row.saved && row.savedItem) {
                return (
                  <div key={row.id} className={`bg-white rounded-xl border-2 p-2.5 ${row.tipo === 'Pallet' ? 'border-[rgba(37,99,235,0.40)]' : row.tipo === 'Contenedor' ? 'border-[rgba(107,33,168,0.40)]' : row.tipo === 'Chocolate' ? 'border-[rgba(146,64,14,0.40)]' : 'border-[rgba(217,119,6,0.40)]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-barlow-condensed text-[17px] font-extrabold ${row.tipo === 'Pallet' ? 'text-info' : row.tipo === 'Contenedor' ? 'text-[#6B21A8]' : row.tipo === 'Chocolate' ? 'text-[#92400E]' : 'text-warn'}`}>
                        {rowLabel}{row.pickingSlotId ? <span className="ml-1.5 text-[15px] font-mono text-navy font-bold">#{row.pickingSlotId}</span> : null}
                      </span>
                      <div className="flex gap-1">
                        <button onClick={() => editSavedRow(row.id)} className="text-[15px] text-text-3 active:text-info cursor-pointer border-none bg-transparent p-1">✎</button>
                        <button onClick={() => deleteSavedRow(row.id)} className="text-[15px] text-text-3 active:text-red cursor-pointer border-none bg-transparent p-1">✕</button>
                      </div>
                    </div>
                    <div className="text-[14px] text-text-2 space-y-0.5 mb-2">
                      <div className="font-semibold">{row.savedItem.peso}kg · {row.savedItem.alto}cm</div>
                      <div className="text-text-3">{row.savedItem.contenido === 'Chocolate' ? 'CH' : row.savedItem.contenido}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-[11px] text-success font-bold">Agregado</span>
                    </div>
                    {/* P1: Sumar a Pallet directo en la card guardada (B/CH) sin abrir ✎ */}
                    {(row.tipo === 'Bulto' || row.tipo === 'Chocolate') && (() => {
                      const palletTargets = formRows.filter(r => r.id !== row.id && r.tipo === 'Pallet');
                      if (palletTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.tipo === r.tipo).length;
                        return r.tipo === 'Pallet' ? `P${idx}` : r.tipo === 'Contenedor' ? `C${idx}` : r.tipo === 'Chocolate' ? `CH${idx}` : `B${idx}`;
                      };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: 'rgba(37,99,235,0.30)' }}>
                          {isExpanded ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">Sumar a Pallet…</div>
                              <div className="flex flex-wrap gap-1">
                                {palletTargets.map(pl => (
                                  <button key={`sum-${pl.id}`}
                                    onClick={() => sumarBultoAPallet(row.id, getRowLabel(pl), pl.id)}
                                    className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                    style={{ borderColor: 'rgba(37,99,235,0.45)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                                    → {getRowLabel(pl)}
                                  </button>
                                ))}
                                <button onClick={() => setFormMergeState(null)}
                                  className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                              className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                              style={{ border: '1.5px dashed rgba(37,99,235,0.30)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                              SUMAR A PALLET
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {/* P3 #1: Unificar directo en la card guardada (Pallet/Contenedor) sin abrir ✎ */}
                    {(row.tipo === 'Pallet' || row.tipo === 'Contenedor') && (() => {
                      const combineTargets = formRows.filter(r => r.id !== row.id && r.tipo === row.tipo);
                      if (combineTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.tipo === r.tipo).length;
                        return r.tipo === 'Pallet' ? `P${idx}` : r.tipo === 'Contenedor' ? `C${idx}` : r.tipo === 'Chocolate' ? `CH${idx}` : `B${idx}`;
                      };
                      const col = row.tipo === 'Contenedor'
                        ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)', solid: 'rgba(107,33,168,0.45)' }
                        : { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)', solid: 'rgba(37,99,235,0.45)' };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: col.border }}>
                          {isExpanded ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">Unificar con…</div>
                              <div className="flex flex-wrap gap-1">
                                {combineTargets.map(other => (
                                  <button key={`uni-${other.id}`}
                                    onClick={() => iniciarUnionInline(row, other, getRowLabel(row), getRowLabel(other))}
                                    className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                    style={{ borderColor: col.solid, color: col.color, background: col.bg }}>
                                    {getRowLabel(other)}
                                  </button>
                                ))}
                                <button onClick={() => setFormMergeState(null)}
                                  className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                              className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                              style={{ border: `1.5px dashed ${col.border}`, color: col.color, background: col.bg }}>
                              UNIFICAR
                            </button>
                          )}
                        </div>
                      );
                    })()}
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
                    <span className={`font-barlow-condensed text-[16px] font-bold ${row.tipo === 'Pallet' ? 'text-info' : isContRow ? 'text-[#6B21A8]' : isChocTipo ? 'text-[#92400E]' : 'text-warn'}`}>
                      {rowLabel}{row.pickingSlotId ? <span className="ml-1.5 text-[14px] font-mono text-navy font-bold">#{row.pickingSlotId}</span> : null}
                    </span>
                    <button onClick={() => removeUnsavedRow(row.id)} className="text-text-3 active:text-red cursor-pointer border-none bg-transparent text-[13px]">✕</button>
                  </div>
                  {row.mergeReopened && (
                    <div className="mb-2 flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-bold"
                      style={{ border: '1.5px solid rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                      ⬦ Unificado · peso ya sumado — ingresa la altura y Agregar
                    </div>
                  )}
                  {!isContRow && !isChocTipo && (
                  <div className="flex gap-0.5 mb-2">
                    {(row.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                      <button key={c} onClick={() => updateRow(row.id, 'contenido', c)}
                        className={`flex-1 py-1.5 rounded border text-[12px] font-bold cursor-pointer transition-all ${row.contenido === c ? 'bg-[rgba(37,99,235,0.10)] border-info text-info' : 'border-border bg-bg-2 text-text-3'}`}>
                        {c.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  )}
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    <div>
                      <label className="text-[11px] text-text-3 uppercase block mb-0.5">peso</label>
                      <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)}
                        placeholder="kg" inputMode="decimal"
                        className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[16px] outline-none focus:border-red [-webkit-appearance:none]" />
                    </div>
                    {!isChocRow && !isContRow && !isChocTipo && (
                      <div>
                        <label className="text-[11px] text-text-3 uppercase block mb-0.5">alto</label>
                        <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)}
                          placeholder="cm" inputMode="decimal" max={MAX_ALTO_CM}
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[16px] outline-none focus:border-red [-webkit-appearance:none]" />
                        {excedeAltoMax(parseFloat(row.alto) || 0) && (
                          <div className="text-[10px] text-warn mt-0.5">⚠ máx {MAX_ALTO_CM} cm</div>
                        )}
                      </div>
                    )}
                  </div>
                  {row.tipo === 'Bulto' && !isChocRow && (
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      {(['largo', 'ancho'] as const).map(f => (
                        <div key={f}>
                          <label className="text-[11px] text-text-3 uppercase block mb-0.5">{f}</label>
                          <input type="number" value={row[f]} onChange={e => updateRow(row.id, f, e.target.value)}
                            placeholder="cm" inputMode="decimal"
                            className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[16px] outline-none focus:border-red [-webkit-appearance:none]" />
                        </div>
                      ))}
                    </div>
                  )}
                  {row.tipo === 'Pallet' && (
                    <div className="mb-1.5 text-[11px] text-info bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded px-1.5 py-1">120×100 cm</div>
                  )}
                  {isChocRow && (
                    <div className="mb-1.5 text-[11px] text-navy/60 bg-bg border border-border rounded px-1.5 py-1">
                      {CHOCOLATE_DIMS.alto}×{CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho} cm · fijas
                    </div>
                  )}
                  {isContRow && (
                    <div className="mb-1.5 text-[11px] text-[#6B21A8] bg-[rgba(107,33,168,0.06)] border border-[rgba(107,33,168,0.15)] rounded px-1.5 py-1">
                      110×80×150 cm · fijas
                    </div>
                  )}
                  {isChocTipo && (
                    <div className="mb-1.5 text-[11px] bg-[rgba(146,64,14,0.06)] border border-[rgba(146,64,14,0.15)] rounded px-1.5 py-1" style={{ color: '#92400E' }}>
                      {CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho}×{CHOCOLATE_DIMS.alto} cm · fijas · máx {CHOCOLATE_DIMS.pesoMax} kg
                    </div>
                  )}
                  <button onClick={() => saveRow(row)} disabled={!canSaveRow}
                    className={`w-full py-2.5 text-white border-none rounded font-barlow-condensed text-[15px] font-bold cursor-pointer disabled:opacity-30 ${row.tipo === 'Pallet' ? 'bg-info' : isContRow ? 'bg-[#6B21A8]' : isChocTipo ? 'bg-[#92400E]' : 'bg-warn'}`}>
                    {row.mergeReopened ? '+ Agregar (unificado)' : '+ Agregar'}
                  </button>
                  {!row.mergeReopened && (() => {
                    const esBultoOChoc = row.tipo === 'Bulto' || row.tipo === 'Chocolate';
                    // Combinar: mismo tipo, sin guardar (combine dimensional)
                    const combineTargets = (row.tipo === 'Pallet' || row.tipo === 'Bulto' || row.tipo === 'Contenedor')
                      ? formRows.filter(r => !r.saved && r.id !== row.id && r.tipo === row.tipo)
                      : [];
                    // Sumar a Pallet: solo para Bulto/Chocolate → cualquier Pallet (guardado o no)
                    const palletTargets = esBultoOChoc
                      ? formRows.filter(r => r.id !== row.id && r.tipo === 'Pallet')
                      : [];
                    if (combineTargets.length === 0 && palletTargets.length === 0) return null;
                    const gcStyle = row.tipo === 'Pallet'
                      ? { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' }
                      : row.tipo === 'Contenedor'
                      ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)' }
                      : { border: 'rgba(217,119,6,0.30)', color: '#D97706', bg: 'rgba(217,119,6,0.06)' };
                    const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                    const getRowLabel = (r: typeof row) => {
                      const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.tipo === r.tipo).length;
                      return r.tipo === 'Pallet' ? `P${idx}` : r.tipo === 'Contenedor' ? `C${idx}` : r.tipo === 'Chocolate' ? `CH${idx}` : `B${idx}`;
                    };
                    return (
                      <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: gcStyle.border }}>
                        {isExpanded ? (
                          <div className="flex flex-col gap-1">
                            <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">
                              {palletTargets.length > 0 ? 'Sumar a Pallet / combinar…' : '¿Combinar con…?'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {palletTargets.map(pl => (
                                <button key={`sum-${pl.id}`}
                                  onClick={() => sumarBultoAPallet(row.id, getRowLabel(pl), pl.id)}
                                  className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                  style={{ borderColor: 'rgba(37,99,235,0.45)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                                  → {getRowLabel(pl)}
                                </button>
                              ))}
                              {combineTargets.map(other => (
                                <button key={other.id}
                                  onClick={() => iniciarUnionInline(row, other, getRowLabel(row), getRowLabel(other))}
                                  className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                  style={{ borderColor: gcStyle.border, color: gcStyle.color, background: 'white' }}>
                                  {getRowLabel(other)}
                                </button>
                              ))}
                              <button onClick={() => setFormMergeState(null)}
                                className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                            className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                            style={{ border: `1.5px dashed ${gcStyle.border}`, color: gcStyle.color, background: gcStyle.bg }}>
                            {palletTargets.length > 0 ? 'SUMAR / UNIFICAR' : 'UNIFICAR'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {ghostCards.map(gc => {
              const tipoMap: Record<string, string> = { p: 'Pallet', b: 'Bulto', c: 'Contenedor' };
              const prefixMap: Record<string, string> = { p: 'P', b: 'B', c: 'C' };
              const regCount = tiendaItemsList.filter(i => i.tipo === tipoMap[gc.type]).length;
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
                          onClick={() => absorbPickingSlotSant(cod, gc.type)}
                          className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97] border-2"
                          style={{ borderColor: gc.border, color: gc.text, background: 'white' }}>
                          ✓ {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => absorbPickingSlotSant(cod, gc.type)}
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
          <div className="flex gap-2 pb-2">
            <button onClick={() => setDialogTipo('Pallet')}     className="flex-1 py-2.5 border-2 border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Pallet</button>
            <button onClick={() => setDialogTipo('Bulto')}      className="flex-1 py-2.5 border-2 border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Bulto</button>
            <button onClick={() => setDialogTipo('Contenedor')} className="flex-1 py-2.5 border-2 border-dashed border-[#6B21A8]/50 text-[#6B21A8] rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Cont.</button>
            <button onClick={() => setDialogTipo('Chocolate')}  className="flex-1 py-2.5 border-2 border-dashed rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer" style={{ borderColor: 'rgba(146,64,14,0.50)', color: '#92400E' }}>+ Choc.</button>
          </div>
          {dialogTipo && currentTienda && (
            <AgregarPalletDialog
              tipoLabel={dialogTipo}
              storeCod={currentTienda.cod}
              date={new Date().toISOString().slice(0, 10)}
              onClose={() => setDialogTipo(null)}
              onNuevo={() => { const t = dialogTipo; setDialogTipo(null); void addFormRow(t); }}
              onExistente={(slot) => {
                setDialogTipo(null);
                const t = SLOT_TIPO_TO_CARGAMENTO[slot.tipo] ?? 'Bulto';
                void addFormRow(t, slot);
                showToast(`✓ Pallet #${slot.id} agregado`, '#16A34A');
              }}
            />
          )}
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
     RIGHT PANEL — SINGLE ITEM FORM (formulario grande, LEGACY)
     Ya NO se usa como estado vacío: ahora la vista compacta (renderMultiForm) se usa siempre y su
     estado vacío son los botones +Pallet/+Bulto/+Cont/+Choc (al elegir el tipo aparece la
     card-formulario con su #). Se conserva referenciado tras el flag USAR_FORM_GRANDE por si hay
     que revertir rápido; se eliminará en un follow-up cuando el flujo nuevo esté verificado en vivo.
  ════════════════════════════════════ */
  const renderSingleForm = (isMobile = false) => {
    if (!currentTienda) return null;
    const swipeHandlers = isMobile ? { start: onSheetDragStart, move: onSheetDragMove, end: onSheetDragEnd } : undefined;
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} chocolates={tiendaChocolates} contenedores={tiendaContenedores} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} swipe={swipeHandlers} />

        <div ref={isMobile ? formScrollRef : formScrollDesktopRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {editingIdx !== null && (
            <div className="bg-[rgba(37,99,235,0.07)] border border-[rgba(37,99,235,0.25)] rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-info">Editando item #{editingIdx + 1}</span>
              <button onClick={cancelEdit} className="text-[13px] text-text-3 cursor-pointer border-none bg-none active:text-red">✕ Cancelar</button>
            </div>
          )}

          {/* Tipo */}
          <div className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 mt-1 mb-1 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">Tipo</div>
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
          <div className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 mt-2 mb-1 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">Contenido</div>
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

          {/* Peso y dimensiones */}
          <div className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 mt-2 mb-1 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">Peso y dimensiones</div>
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
                <input type="number" inputMode="decimal" value={alto} onChange={e => setAlto(e.target.value)} placeholder="0" max={MAX_ALTO_CM}
                  className="w-full bg-white border-2 border-border rounded-btn px-3 py-3 lg:py-2.5 text-text font-barlow text-[17px] lg:text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                {excedeAltoMax(parseFloat(alto) || 0) && (
                  <div className="text-[12px] text-warn mt-1">⚠ Supera el máximo de bodega ({MAX_ALTO_CM} cm)</div>
                )}
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
                    max={l === 'Alto (cm)' ? MAX_ALTO_CM : undefined}
                    className="w-full bg-white border-2 border-border rounded-btn px-3 py-3 lg:py-2.5 text-text font-barlow text-[17px] lg:text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                  {l === 'Alto (cm)' && excedeAltoMax(parseFloat(v) || 0) && (
                    <div className="text-[12px] text-warn mt-1">⚠ Supera el máximo de bodega ({MAX_ALTO_CM} cm)</div>
                  )}
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
  // Fecha de armado/despacho (se muestra dentro de la columna izquierda, como Regiones)
  const santiagoTodayLabel = new Date(todayKey + 'T12:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const santiagoFechaDespacho = state.fechaDespacho ?? (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">

      {/* ─── LEFT PANEL ─── always visible on mobile; hidden only in resumen view */}
      <div
        className={`${view === 'resumen' ? 'hidden' : 'flex'} lg:flex flex-1 lg:flex-none flex-col w-full overflow-hidden flex-shrink-0`}
        style={isDesktop ? { width: leftWidth } : undefined}
      >

        {/* Fecha de armado / despacho — dentro de la columna izquierda (igual que Regiones) */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border, #E2E5EC)',
          background: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>Armado</span>
            <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>{santiagoTodayLabel}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>Fecha de despacho</span>
            <input
              type="date"
              value={santiagoFechaDespacho}
              min={todayKey}
              onChange={e => dispatch({ type: 'SET_FECHA_DESPACHO', payload: e.target.value })}
              style={{ border: '1.5px solid #dde3f0', borderRadius: 7, padding: '2px 8px', fontSize: 12, fontWeight: 700, color: '#1a2550', background: '#fff' }}
            />
          </div>
          {state.registrado && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#16A34A', fontWeight: 700, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 20, padding: '2px 8px' }}>
              ✓ Registrado
            </span>
          )}
        </div>

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
        <div className="hidden lg:flex px-2 py-1.5 bg-bg border-b border-border flex-shrink-0">
          <input
            ref={guideFileRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => e.target.files && handleGuideFiles(e.target.files)} />
          <button
            onClick={() => !guideUploading && guideFileRef.current?.click()}
            disabled={guideUploading}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setGuideDragOver(true); } }}
            onDragLeave={e => { e.stopPropagation(); setGuideDragOver(false); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setGuideDragOver(false); if (!guideUploading && e.dataTransfer.files.length) handleGuideFiles(e.dataTransfer.files); }}
            className={`flex-1 py-3 border-2 rounded-btn font-barlow-condensed text-[16px] font-extrabold uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${guideDragOver ? 'border-red bg-[rgba(211,47,47,0.18)] text-red scale-[1.02]' : 'border-red bg-[rgba(211,47,47,0.06)] text-red active:bg-[rgba(211,47,47,0.12)]'}`}>
            {guideUploading
              ? <><div className="w-3 h-3 border-2 border-red/30 border-t-red rounded-full animate-spin" />PROCESANDO…</>
              : guideDragOver ? '↓ SUELTA PDFs' : 'SUBIR GUÍAS'}
          </button>
        </div>

        {renderStoreGrid()}
        {renderStatsBar()}
      </div>

      {/* Divider: Left ↔ Center — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={handleLeftMouseDown}
          onTouchStart={handleLeftTouchStart}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* ─── CENTER PANEL — form (desktop only) ─── */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden">
        {!currentTienda
          ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-navy" style={{ minHeight: 0 }}>
              <p className="font-barlow-condensed text-[22px] font-bold text-white/70 uppercase tracking-widest">Selecciona una tienda</p>
            </div>
          )
          : (USAR_FORM_GRANDE && formRows.length === 0 ? renderSingleForm(false) : renderMultiForm(false))
        }
      </div>

      {/* Divider: Center ↔ Right — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={handleRightMouseDown}
          onTouchStart={handleRightTouchStart}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* ─── RIGHT PANEL — resumen (desktop only) ─── */}
      <div className="hidden lg:flex flex-col overflow-hidden flex-shrink-0"
           style={isDesktop ? { width: rightWidth } : undefined}>
        {renderResumenPanel()}
      </div>

      {/* ─── MOBILE: resumen view ─── */}
      {view === 'resumen' && (
        <div className="flex lg:hidden flex-1 flex-col overflow-hidden">
          {renderResumenPanel()}
        </div>
      )}

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
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden flex flex-col rounded-t-[28px] bg-white overflow-hidden"
        style={{
          minHeight: '82vh',
          maxHeight: '92vh',
          transform: currentTienda ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.22)',
        }}
      >
        {/* Form content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {currentTienda && (USAR_FORM_GRANDE && formRows.length === 0 ? renderSingleForm(true) : renderMultiForm(true))}
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

      {/* [Unificar inline] La unificación P3→P1 ya no usa modal flotante: es automática
          (iniciarUnionInline) y el target se reabre como card editable para la altura. */}

      <CalManualSheet
        open={showCalManual}
        onClose={() => setShowCalManual(false)}
        title="METROPOLITANA / COSTA"
        lines={calManualLines}
      />
    </div>
  );
}
