'use client';

import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation, ChevronLeft, ClipboardList } from 'lucide-react';
import { useApp } from '../../../../context/AppContext';
import { processPdf } from '../utils/pdfUtils';
import { TIENDAS, getTodayCods, validarDimensiones } from '../data/tiendas';
import { formatCod, matchCodArchivo } from '../../rutas/utils/helpers';
import { getTiendasDelDia, subscribeToCalendarChanges } from '../../utils/useCalendario';
import { getTiendasAdelantoHoy } from '../../shared/tiendasAdelanto';
import { tipoBadge } from '../../santiago/tipoTienda';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { StoreProgressBar } from '../../shared/StoreProgressBar';
import { SectionCount } from '../../shared/SectionCount';
import { sectionProgress } from '../../shared/sectionProgress';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';
import { ResumenPage } from './ResumenPage';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { sumPeso } from '../../shared/combineUtils';
import { unionRefs } from '../../shared/unifyPallets';
import { logActividad, ordenToLabel } from '@/lib/actividad';
import { useUndoDelete } from '../../shared/useUndoDelete';
import { UndoBar } from '../../shared/UndoBar';
import { pkgCodeNacional } from '../../shared/tipoCode';
import { ordenarCardsPorTipo } from '../../shared/ordenCards';
import { reconcileSavedRows, findItemForRow, sameStableItem } from '../../shared/formRowsReconcile';
import { supabase } from '../../../../lib/supabase';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useDayRollover } from '@/hooks/useDayRollover';
import { AgregarPalletDialog } from '@/features/despacho/shared/AgregarPalletDialog';
import { CalManualSheet, type ManualLine } from '../../shared/CalManualSheet';
import type { PickingSlot } from '@/features/despacho/santiago/components/PickingSlotCards';
import { MAX_ALTO_CM, excedeAltoMax } from '../../shared/palletLimits';

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
const CHOCOLATE_DIMS_R = { alto: 42, ancho: 56, largo: 80 };  // Dimensiones fijas del Chocolate
const CHOCOLATE_DEFAULT_PESO = 20;                            // Peso por defecto al auto-agregar (editable, 1-25 kg)
function loadConsumedSlots(): ConsumedSlots { try { return JSON.parse(localStorage.getItem(CONSUMED_SLOTS_KEY) || '{}'); } catch { return {}; } }
function saveConsumedSlots(v: ConsumedSlots) { try { localStorage.setItem(CONSUMED_SLOTS_KEY, JSON.stringify(v)); } catch {} }

/* ── Styles ── */
const TIPO_CLS: Record<TipoContenido, string> = {
  comida:        'bg-[rgba(217,119,6,0.08)] border-warn text-warn',
  hogar:         'bg-[rgba(124,58,237,0.08)] border-hogar text-hogar',
  'comida-hogar':'bg-[rgba(8,145,178,0.08)] border-mixto text-mixto',
  chocolate:     'bg-[rgba(120,53,15,0.08)] border-[#92400E] text-[#92400E]',
};


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
  pickingSlotId?: number;  // FK a picking_pallets.id para guardar dimensiones
  // [Unificar inline] La fila TARGET (P1) recién unificada: el source ya se sumó y se borró; P1
  // quedó reabierta con el peso sumado para ingresar la altura y "Agregar" (guardado normal).
  mergeReopened?: boolean;
}

/* ── Compact 3-column grid card ── */
// Flag de rollback (paridad con RM/Costa): `false` = vista compacta siempre (estado vacío = botones
// +Pallet/+Bulto/…, al elegir el tipo aparece la card-formulario con su #). `true` = formulario
// grande como estado vacío. Se mantiene mientras se verifica el flujo nuevo en vivo.

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
  storeStatus?: 'none' | 'partial' | 'complete';
  storeDoneOps?: number;
  storeTotalOps?: number;
  tipoCat?: string;
  onSelect: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}
function TiendaGridCard({ name, isActive, isToday, itemCount, palletCount, contenedorCount, chocolateCount, pickingP = 0, pickingB = 0, pickingC = 0, pickingCH = 0, preset, hasPdf, storeDoneOps = 0, storeTotalOps = 0, tipoCat, onSelect, onDragStart }: GridCardProps) {
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
      <StoreProgressBar total={storeTotalOps} done={storeDoneOps} variant="grid" showCount />
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
  const { pending: undoPending, armar: armarUndo, revertir: revertirUndo, descartar: descartarUndo } = useUndoDelete();
  const router = useRouter();
  const odooProgress = useOdooProgress();  // progreso de Odoo (punto gris/naranja/verde) — igual que Santiago
  useDayRollover();  // recarga al cruzar medianoche → evita guías/estado fantasma del día anterior
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
  const [pickingSlotsFull,      setPickingSlotsFull]      = useState<Record<string, import('../../../despacho/santiago/components/PickingSlotCards').PickingSlot[]>>({});
  const [consumedPickingSlots, setConsumedPickingSlots] = useState<ConsumedSlots>(() => typeof window === 'undefined' ? {} : loadConsumedSlots());
  const [formRows,              setFormRows]              = useState<FormRow[]>([]);
  const [tipoCatByCod,          setTipoCatByCod]          = useState<Record<string, string>>({}); // tipo del catálogo para el badge
  const [showMobileResumen, setShowMobileResumen]  = useState(false);
  const [showCalManual,     setShowCalManual]      = useState(false);
  const [showTodas,         setShowTodas]          = useState(false);

  // Tipo de tienda (Mall/StripCenter/Tienda) del catálogo Supabase para el badge de las cards
  // (paridad con RM/Costa). El catálogo estático de Regiones no trae el tipo, así que se consulta.
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then(({ tiendas: data }: { tiendas?: Array<Record<string, unknown>> }) => {
        if (!Array.isArray(data)) return;
        const tcat: Record<string, string> = {};
        for (const t of data) {
          const cod = String(t.codigo ?? ''); const tipoVal = String(t.tipo ?? '');
          if (cod && tipoVal) tcat[cod] = tipoVal;
        }
        setTipoCatByCod(tcat);
      })
      .catch(() => {});
  }, []);

  /* Calendar from Calendario Central (Sheets + localStorage cross-tab sync) */
  const [sheetsTodayCods, setSheetsTodayCods] = useState<string[]>([]);
  // Tiendas de adelanto de hoy con destino Regiones (zona 'fal'), sin tocar el calendario central.
  const [adelantoCods, setAdelantoCods] = useState<string[]>([]);
  useEffect(() => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const todayCode = DAY_CODES[new Date().getDay()];

    // Initial fetch (checks localStorage cache first, then Sheets)
    getTiendasDelDia('fal')
      .then(cods => { if (cods.length > 0) setSheetsTodayCods(cods); })
      .catch(() => {});

    // Tiendas de adelanto de hoy (solo zona Regiones / 'fal')
    getTiendasAdelantoHoy()
      .then(list => setAdelantoCods(list.filter(a => a.zona === 'fal').map(a => a.store_cod)))
      .catch(() => {});

    // Real-time sync when CalendarioCentral saves from another tab
    return subscribeToCalendarChanges(cal => {
      const cods = cal[todayCode]?.fal || [];
      if (cods.length > 0) setSheetsTodayCods(cods);
    });
  }, []);


  const [pdfLoading,      setPdfLoading]      = useState(false);
  const [multiPdfLoading, setMultiPdfLoading] = useState(false);

  const fileRef         = useRef<HTMLInputElement>(null);
  const multiFileRef    = useRef<HTMLInputElement>(null);
  const rightPanelRef   = useRef<HTMLDivElement>(null);
  const formScrollRef        = useRef<HTMLDivElement>(null);
  const formScrollDesktopRef = useRef<HTMLDivElement>(null);
  const pickingSlotsRef      = useRef(pickingSlots);
  const pickingSlotsFullRef  = useRef(pickingSlotsFull);

  /* Combine items (drag-to-merge) */
  const [combineModal, setCombineModal] = useState<{ srcIdx: number; tgtIdx: number } | null>(null);
  const [formMergeState, setFormMergeState] = useState<{ sourceId: string; targetId: string | null } | null>(null);
  const sheetRef     = useRef<HTMLDivElement>(null);
  const sheetDrag    = useRef({ start: 0, delta: 0 });

  const { dispatch: dispatchData, selectedTienda, fechaDespacho: _fechaDespacho, registrado } = state;
  const fechaDespacho = _fechaDespacho ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const todayLabel = new Date(_localDate + 'T12:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

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

  /* Reconciliar formRows tras un merge remoto (eco de shared_session_state → LOAD_STATE):
     el array de items de la tienda se reemplaza y renumberItems reescribe `orden`, pero el
     useLayoutEffect (deps [selectedTienda]) NO se re-dispara → el `savedItem` de cada fila
     queda obsoleto y "SUMAR A PALLET" deja de encontrar el item (UI congelada). Aquí sólo
     refrescamos la referencia `savedItem` de las filas guardadas; las filas en progreso
     (no guardadas) se preservan intactas. Deps: identidad del array de la tienda actual. */
  const selectedItems = selectedTienda ? dispatchData[selectedTienda] : undefined;
  useEffect(() => {
    if (!selectedTienda || !selectedItems) return;
    setFormRows(prev => {
      const next = reconcileSavedRows(prev, selectedItems);
      return next === prev ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, selectedTienda]);

  /* [Backfill de slots que llegan tarde] El fetch de picking_pallets es asíncrono; si al
     recargar la página la tienda ya está seleccionada, el rebuild corre ANTES de que lleguen los
     slots y no se re-dispara → faltan tarjetas (el P2 no aparece hasta navegar y volver). Aquí
     agregamos UNA fila por cada slot activo sin tarjeta, SIN tocar las filas existentes. */
  useEffect(() => {
    if (!selectedTienda) return;
    const name = selectedTienda;
    const fullSlots = pickingSlotsFull[name] ?? [];
    if (fullSlots.length === 0) return;
    const PKG_MAP: Record<string, TipoPaquete> = { P: 'pallet', C: 'contenedor', B: 'box', CH: 'chocolate' };
    const mapCont = (raw: string): TipoContenido => {
      const c = (raw ?? '').toLowerCase();
      if (c.includes('chocolate')) return 'chocolate';
      if (c === 'mixto' || c === 'comida-hogar') return 'comida-hogar';
      const comida = c.includes('comida') || c.includes('alimento');
      const hogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
      if (comida && hogar) return 'comida-hogar';
      if (comida) return 'comida';
      return 'hogar';
    };
    const cur = dispatchData[name] || [];
    setFormRows(prev => {
      const repIds = new Set(prev.map(r => r.pickingSlotId).filter((x): x is number => x != null));
      const missing = fullSlots.filter(s => !repIds.has(s.id) && s.tipo !== 'CH');
      if (missing.length === 0) return prev;
      const add: FormRow[] = missing.map(s => {
        const pkg = PKG_MAP[s.tipo] ?? 'pallet';
        const saved = cur.find(it => it.pickingSlotId === s.id);
        if (saved) return {
          id: `bk-saved-${s.id}`, pkg: saved.pkg, tipo: saved.tipo,
          peso: String(saved.peso ?? ''), alto: String(saved.alto ?? ''),
          ancho: String(saved.ancho ?? ''), largo: String(saved.largo ?? ''),
          guia: saved.guia || '', valor: saved.valor ? String(saved.valor) : '',
          saved: true, savedItem: saved, pickingSlotId: s.id,
        };
        return {
          id: `bk-pick-${s.id}`, pkg, tipo: mapCont(s.contenido),
          peso: s.peso_kg != null ? String(s.peso_kg) : '', alto: s.alto != null ? String(s.alto) : '',
          ancho: s.ancho != null ? String(s.ancho) : (pkg === 'pallet' ? '100' : ''),
          largo: s.largo != null ? String(s.largo) : (pkg === 'pallet' ? '120' : ''),
          guia: '', valor: '', pickingSlotId: s.id,
        };
      });
      return [...prev, ...add];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickingSlotsFull, selectedTienda, dispatchData]);

  /* [Limpiar contador obsoleto] `consumedPickingSlots` era el mecanismo viejo para "consumir" un
     slot unificado. Ahora la unificación BORRA el slot, así que quedó obsoleto y un valor viejo
     en localStorage hace que el badge del tile muestre de menos. Se resetea al montar. */
  useEffect(() => { setConsumedPickingSlots({}); saveConsumedSlots({}); }, []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setExtraCods(loadExtraCods());
    setRemovedCods(loadRemovedCods());
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Resizable panels (left + right, center takes flex-1) ── */
  const { width: leftWidth, isDesktop, handleMouseDown: handleLeftMouseDown, handleTouchStart: handleLeftTouchStart } =
    useResizablePanel({ storageKey: 'regiones_left_panel_width',  defaultWidth: 280 });
  const { width: rightWidth, handleMouseDown: handleRightMouseDown, handleTouchStart: handleRightTouchStart } =
    useResizablePanel({ storageKey: 'regiones_right_panel_width', defaultWidth: 300, inverted: true });

  /* ── Load picking slots from picking_pallets (today) ── */
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
      const full:  Record<string, import('../../../despacho/santiago/components/PickingSlotCards').PickingSlot[]> = {};
      for (const row of data) {
        const name = COD_TO_TIENDA_NAME[row.store_cod as string];
        if (!name) continue;
        if (!slots[name]) { slots[name] = []; full[name] = []; }
        slots[name].push({ tipo: (row.tipo as string) || 'P', contenido: (row.contenido as string) || 'hogar' });
        full[name].push({
          id: row.id as number, tipo: (row.tipo as string) || 'P',
          contenido: (row.contenido as string) || 'hogar',
          seq: row.seq as number | null, canonical_id: row.canonical_id as string | null,
          peso_kg: row.peso_kg as number | null, alto: row.alto as number | null,
          largo: row.largo as number | null, ancho: row.ancho as number | null,
          peso_v: row.peso_v as number | null,
        });
      }
      setPickingSlots(slots);
      setPickingSlotsFull(full);
    };

    void load();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const unsub = subscribeToPickingPallets(debounced, load);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);

  /* Keep ref in sync so form-init effect always reads latest picking without re-running */
  useEffect(() => { pickingSlotsRef.current = pickingSlots; }, [pickingSlots]);
  useEffect(() => { pickingSlotsFullRef.current = pickingSlotsFull; }, [pickingSlotsFull]);

  const baseRaw       = mounted ? (sheetsTodayCods.length > 0 ? sheetsTodayCods : getTodayCods()) : [];
  const baseTodayCods = mounted ? [...baseRaw, ...adelantoCods.filter(c => !baseRaw.includes(c))] : [];
  const allTodayCods  = [...baseTodayCods, ...extraCods.filter(c => !baseTodayCods.includes(c))]
    .filter(c => !removedCods.includes(c));

  const items   = selectedTienda ? (dispatchData[selectedTienda] || []) : [];
  const pdfInfo = selectedTienda ? state.pdfData[selectedTienda] : undefined;
  const hasPdf  = !!pdfInfo;



  const PICKING_PKG: Record<string, TipoPaquete> = { P: 'pallet', C: 'contenedor', B: 'box', CH: 'chocolate' };
  const mapearContenido = (raw: string): TipoContenido => {
    const c = (raw ?? '').toLowerCase();
    if (c.includes('chocolate')) return 'chocolate';   // [Req 1] pallet/bulto de chocolate → contenido CH
    if (c === 'mixto' || c === 'comida-hogar') return 'comida-hogar';
    const esComida = c.includes('comida') || c.includes('alimento');
    const esHogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
    if (esComida && esHogar) return 'comida-hogar';
    if (esComida) return 'comida';
    return 'hogar';
  };

  /* Initialize formRows only when the selected tienda changes.
     Uses pickingSlotsRef (always current) so picking real-time updates
     do NOT retrigger this effect and wipe the user's in-progress form.
     useLayoutEffect → corre antes del paint: nunca se pinta el form de la
     tienda anterior bajo el header de la nueva. */
  useLayoutEffect(() => {
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

      const fullSlotsR = pickingSlotsFullRef.current[selectedTienda] ?? [];
      const baseSlotsR = fullSlotsR.length > 0 ? fullSlotsR : slots.map(s => ({
        id: 0, tipo: s.tipo, contenido: s.contenido, seq: null, canonical_id: null,
        peso_kg: null, alto: null, largo: null, ancho: null, peso_v: null,
      }));

      if (hasPickingData) {
        // ── Reconstrucción determinista: un row por slot de picking (incluye CH) ──
        // Indexar items guardados: por slot (pickingSlotId) y un pool por pkg de respaldo.
        const savedBySlot = new Map<number, DispatchItem>();
        const leftoverByPkg = new Map<string, DispatchItem[]>();
        for (const it of existingItems) {
          if (it.pickingSlotId) savedBySlot.set(it.pickingSlotId, it);
          else {
            const arr = leftoverByPkg.get(it.pkg) ?? [];
            arr.push(it); leftoverByPkg.set(it.pkg, arr);
          }
        }
        // Toma un item guardado del pool por pkg (fallback cuando se perdió el vínculo al slot)
        const takeLeftover = (pkg: TipoPaquete): DispatchItem | undefined => {
          const pool = leftoverByPkg.get(pkg);
          return pool && pool.length ? pool.shift() : undefined;
        };

        // Punto 2: chocolates de picking sin item guardado → auto-agregar como AGREGADOS (20 kg)
        const chocToCreate: DispatchItem[] = [];
        let chCount = existingItems.filter(i => i.pkg === 'chocolate').length;

        const rows: FormRow[] = [];
        baseSlotsR.forEach((s, i) => {
          const sid = (s as { id?: number }).id || 0;
          const pkg = PICKING_PKG[s.tipo] ?? 'pallet';
          // 1) match por slot  2) fallback: item guardado del mismo pkg sin vínculo
          let saved = sid ? savedBySlot.get(sid) : undefined;
          if (saved) savedBySlot.delete(sid);
          else saved = takeLeftover(pkg);

          // 3) Chocolate sin guardar → materializar agregado con peso por defecto
          if (!saved && pkg === 'chocolate') {
            const newCh: DispatchItem = {
              orden: `chocolate${++chCount}`, tipo: mapearContenido(s.contenido), pkg: 'chocolate',
              peso: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS_R.alto, ancho: CHOCOLATE_DIMS_R.ancho, largo: CHOCOLATE_DIMS_R.largo,
              guia: '', valor: 0, pickingSlotId: sid || undefined,
            };
            chocToCreate.push(newCh);
            saved = newCh;
          }

          if (saved) {
            // Un ítem guardado SIEMPRE se muestra como tarjeta (nunca vuelve a formulario)
            rows.push({
              id: `saved-${sid || i}-${Date.now()}`, pkg: saved.pkg, tipo: saved.tipo,
              peso: String(saved.peso ?? ''), alto: String(saved.alto ?? ''),
              ancho: String(saved.ancho ?? ''), largo: String(saved.largo ?? ''),
              guia: saved.guia || '', valor: saved.valor ? String(saved.valor) : '',
              saved: true, savedItem: saved, pickingSlotId: sid || saved.pickingSlotId,
            });
          } else {
            rows.push({
              id: `pick-${sid || i}-${Date.now()}`, pkg, tipo: mapearContenido(s.contenido),
              peso:  s.peso_kg != null ? String(s.peso_kg) : '',
              alto:  s.alto    != null ? String(s.alto)    : '',
              ancho: s.ancho   != null ? String(s.ancho)   : (pkg === 'pallet' ? '100' : ''),
              largo: s.largo   != null ? String(s.largo)   : (pkg === 'pallet' ? '120' : ''),
              guia: '', valor: '', pickingSlotId: sid || undefined,
            });
          }
        });
        // Items guardados sin slot vigente (manuales o slot eliminado) → al final, siempre como tarjeta
        const remaining: DispatchItem[] = [...savedBySlot.values()];
        for (const pool of leftoverByPkg.values()) remaining.push(...pool);
        for (const it of remaining) {
          rows.push({
            id: `savedm-${it.orden}-${Date.now()}`, pkg: it.pkg, tipo: it.tipo,
            peso: String(it.peso ?? ''), alto: String(it.alto ?? ''),
            ancho: String(it.ancho ?? ''), largo: String(it.largo ?? ''),
            guia: it.guia || '', valor: it.valor ? String(it.valor) : '',
            saved: true, savedItem: it, pickingSlotId: it.pickingSlotId,
          });
        }
        setFormRows(rows);

        // Persistir en el estado los chocolates auto-agregados + reflejar peso en picking_pallets
        if (chocToCreate.length > 0) {
          dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: [...existingItems, ...chocToCreate] });
          for (const ch of chocToCreate) {
            if (!ch.pickingSlotId) continue;
            supabase.from('picking_pallets').update({
              peso_kg: ch.peso, alto: ch.alto, ancho: ch.ancho, largo: ch.largo,
            }).eq('id', ch.pickingSlotId).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
          }
        }
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
        // Sin picking pero con items guardados → tarjetas guardadas (recuperan #id)
        const savedRows: FormRow[] = existingItems
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
            pickingSlotId: item.pickingSlotId,
          }));
        setFormRows(savedRows);
      }
    } else {
      setFormRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTienda]);


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
  const statCH = allDispatchItems.filter(i => i.pkg === 'chocolate').length;
  const activeTiendasCount = Object.entries(dispatchData).filter(([, its]) => its.length > 0).length;
  // Contador "terminadas/total del día" (Nacional): terminada = tienda con carga registrada.
  // "Terminada" = movimientos de Odoo completos (semáforo verde, done === total), la MISMA señal
  // que la barra "X/Y" de la card. Antes contaba carga registrada (items), que no coincide con el verde.
  const nacProg = sectionProgress(today, t => odooProgress.get(t.cod)?.status === 'complete');

  // #6 — líneas del "Manual" (lo cargado en Regiones). El calendario del sheet es el
  // general de Picking (CalendarioColumnas).
  const calManualLines: ManualLine[] = Object.entries(dispatchData)
    .filter(([, its]) => its.length > 0)
    .map(([name, its]) => ({
      cod:    TIENDAS[name]?.cod ?? name,
      nombre: TIENDAS[name]?.name ?? name,
      g:      'fal' as const,
      p:  its.filter(i => i.pkg === 'pallet').length,
      b:  its.filter(i => i.pkg === 'box').length,
      c:  its.filter(i => i.pkg === 'contenedor').length,
      ch: its.filter(i => i.pkg === 'chocolate').length,
    }));

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

  /* Sube el PDF (con timbres) al storage y registra la guía para el manifiesto.
     En bodega suele subirse antes de existir el manifiesto: la guía queda persistida
     y el Enrutador la jala al crear el manifiesto. Fire-and-forget, no bloquea la UI. */
  const subirYVincularGuia = async (file: File, storeCod: string, folios: string[]) => {
    if (!storeCod) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const driveRes = await fetch('/api/drive-upload', { method: 'POST', body: fd });
      const driveUrl = driveRes.ok ? (await driveRes.json()).fileId as string : undefined;
      void fetch('/api/ruta-guias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_cod: storeCod, folios, drive_url: driveUrl }),
      });
    } catch { /* no bloquear la asignación local si falla la subida */ }
  };

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
      void subirYVincularGuia(file, TIENDAS[selectedTienda]?.cod ?? '', data.guias.map(g => g.num));
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
      /* Detecta el código de tienda CONOCIDO más largo con el que empieza el nombre (número inicial +
         letras + dígito final). Así "38SP2" no se confunde con "38SP" ni con "24SPP".
         Ej: "53VAL-14-04-2026...pdf" → 53VAL; "38SP2-...pdf" → 38SP2. */
      const cleanName = file.name.replace(/\.pdf$/i, '');
      const cod = matchCodArchivo(file.name, Object.keys(codToName), { '38PSP': '38SP2' });
      if (!cod) { console.warn('[PDF Multi] Sin código reconocible:', file.name); skipped++; continue; }
      const storeName = codToName[cod];
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
        void subirYVincularGuia(file, cod, data.guias.map(g => g.num));
        assigned++;
      } catch (e) { console.error('[PDF] Error procesando', file.name, e); skipped++; }
    }
    if (multiFileRef.current) multiFileRef.current.value = '';
    setMultiPdfLoading(false);
    if (assigned > 0) showToast(`✓ ${assigned} PDF${assigned > 1 ? 's' : ''} asignado${assigned > 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitido${skipped > 1 ? 's' : ''}` : ''}`, '#16A34A');
    else showToast('No se pudo asignar ningún PDF. Verifica que el nombre inicie con el código (ej: 53VAL-...).', '#D97706');
  };

  /* Multi-form row helpers */
  // `existingSlot` viene del flujo "Preexistente" (pallet adelantado ya reclamado a hoy):
  // en ese caso NO se crea un slot nuevo, se usa el reclamado.
  const addFormRow = async (pkg: TipoPaquete, existingSlot?: PickingSlot) => {
    const cod = selectedTienda ? (TIENDAS[selectedTienda]?.cod ?? '') : '';
    const PKG_CODE: Record<TipoPaquete, string> = { pallet: 'P', box: 'B', contenedor: 'C', chocolate: 'CH' };
    const date = new Date().toISOString().slice(0, 10);

    // Chocolate: se agrega AGREGADO al instante con peso por defecto (sin formulario)
    if (pkg === 'chocolate') {
      if (!cod || !selectedTienda) return;
      let slot: PickingSlot | undefined = existingSlot;
      if (!slot) try {
        const res = await fetch('/api/picking-pallets/create-bodega', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, store_cod: cod, tipo: 'CH', contenido: 'hogar' }),
        });
        slot = (await res.json() as { data?: PickingSlot }).data;
      } catch { /* sin slot: queda como chocolate sin ID */ }
      if (slot) {
        const s = slot;
        setPickingSlotsFull(prev => ({ ...prev, [selectedTienda]: [...(prev[selectedTienda] ?? []), s] }));
      }
      const existing = dispatchData[selectedTienda] || [];
      const chc = existing.filter(i => i.pkg === 'chocolate').length + 1;
      const stamp = Date.now();
      const item: DispatchItem = {
        orden: `chocolate${chc}`, tipo: 'hogar', pkg: 'chocolate',
        peso: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS_R.alto, ancho: CHOCOLATE_DIMS_R.ancho, largo: CHOCOLATE_DIMS_R.largo,
        guia: '', valor: 0, pickingSlotId: slot?.id,
      };
      dispatch({ type: 'ADD_ITEM', tienda: selectedTienda, item });
      setFormRows(prev => [...prev, {
        id: `saved-chadd-${stamp}`, pkg: 'chocolate', tipo: 'hogar',
        peso: String(CHOCOLATE_DEFAULT_PESO), alto: String(CHOCOLATE_DIMS_R.alto),
        ancho: String(CHOCOLATE_DIMS_R.ancho), largo: String(CHOCOLATE_DIMS_R.largo),
        guia: '', valor: '', saved: true, savedItem: item, pickingSlotId: slot?.id,
      }]);
      if (slot?.id) {
        supabase.from('picking_pallets').update({
          peso_kg: CHOCOLATE_DEFAULT_PESO, alto: CHOCOLATE_DIMS_R.alto, ancho: CHOCOLATE_DIMS_R.ancho, largo: CHOCOLATE_DIMS_R.largo,
        }).eq('id', slot.id).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
      }
      showToast(`✓ ${item.orden} agregado`, '#16A34A');
      return;
    }

    const rowId = `row-${Date.now()}`;
    setFormRows(prev => [...prev, {
      id: rowId, pkg, tipo: 'hogar', peso: '',
      alto:  '',
      ancho: pkg === 'pallet' ? '100' : '',
      largo: pkg === 'pallet' ? '120' : '',
      guia: '', valor: '',
    }]);
    if (!cod || !selectedTienda) return;

    // Preexistente: usar el slot ya reclamado (no se crea uno nuevo)
    if (existingSlot) {
      setPickingSlotsFull(prev => ({ ...prev, [selectedTienda]: [...(prev[selectedTienda] ?? []), existingSlot] }));
      setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, pickingSlotId: existingSlot.id } : r));
      return;
    }

    try {
      const res  = await fetch('/api/picking-pallets/create-bodega', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date, store_cod: cod, tipo: PKG_CODE[pkg], contenido: 'hogar' }),
      });
      const json = await res.json() as { data?: PickingSlot };
      const slot = json.data;
      if (!slot) return;
      setPickingSlotsFull(prev => {
        const next = { ...prev };
        next[selectedTienda] = [...(next[selectedTienda] ?? []), slot];
        return next;
      });
      setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, pickingSlotId: slot.id } : r));
    } catch { /* fallback: el row queda sin slot */ }
  };

  // Mapea el tipo del slot (P/B/C/CH) al TipoPaquete del formulario
  const SLOT_TIPO_TO_PKG: Record<string, TipoPaquete> = { P: 'pallet', B: 'box', C: 'contenedor', CH: 'chocolate' };
  // Estado del diálogo "Nuevo / Preexistente"
  const [dialogPkg, setDialogPkg] = useState<TipoPaquete | null>(null);
  const PKG_LABEL: Record<TipoPaquete, string> = { pallet: 'Pallet', box: 'Bulto', contenedor: 'Contenedor', chocolate: 'Chocolate' };
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
    dispatch({ type: 'ADD_ITEM', tienda: selectedTienda, item: { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: itemValor, pickingSlotId: row.pickingSlotId } });
    if (hasPdf && pdfInfo) {
      const newItems = [...currentItems, { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: 0, pickingSlotId: row.pickingSlotId }];
      const perItem = Math.round(pdfInfo.totalSum / newItems.length);
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: newItems.map((it, i) => ({ ...it, guia: pdfInfo.guias[i]?.num || '', valor: perItem })) });
    }
    const pickingSlot = row.pickingSlotId
      ? (pickingSlotsFull[selectedTienda] ?? []).find(s => s.id === row.pickingSlotId)
      : null;
    const savedItem: DispatchItem = { orden, tipo: row.tipo, pkg: row.pkg, peso: p, alto: a, ancho: aw, largo: l, guia: itemGuia, valor: itemValor, pickingSlotId: row.pickingSlotId, canonical_id: pickingSlot?.canonical_id ?? undefined };
    setFormRows(prev => prev.map(r => r.id === row.id ? { ...r, saved: true, savedItem } : r));
    showToast(`✓ ${orden} agregado`, '#16A34A');
    logActividad({ accion: 'registrar_item', fuente: 'nacional', tiendaCod: TIENDAS[selectedTienda]?.cod,
      tiendaNombre: selectedTienda, label: ordenToLabel(orden), peso: p, alto: a, slotId: row.pickingSlotId });

    // Sincronizar dimensiones en picking_pallets si el row tiene slot vinculado
    if (row.pickingSlotId) {
      const pesoV = Math.round((a * aw * l) / 6000 * 10) / 10 || null;
      supabase.from('picking_pallets').update({
        peso_kg: p, alto: a, ancho: aw, largo: l, peso_v: pesoV,
      }).eq('id', row.pickingSlotId).then(({ error }) => {
        if (error) console.error('[picking_pallets update]', error.message);
      });
    }
  };


  const editSavedRow = (rowId: string) => {
    if (!selectedTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (!row?.savedItem) return;
    const currentItems = dispatchData[selectedTienda] || [];
    // Match por clave ESTABLE (pickingSlotId), no por pkg+orden: dos chocolates comparten pkg y
    // pueden tener el mismo orden → el match frágil borraba el ítem equivocado (perdía el otro).
    const idx = currentItems.findIndex(i => sameStableItem(i, row.savedItem));
    if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tienda: selectedTienda, idx });
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: false, savedItem: undefined } : r));
  };

  // Borra el slot de picking_pallets vinculado y lo quita de pickingSlotsFull
  const deletePickingSlot = (slotId?: number) => {
    if (!slotId || !selectedTienda) return;
    const name = selectedTienda;
    supabase.from('picking_pallets').delete().eq('id', slotId).then(({ error }) => {
      if (error) console.error('[picking_pallets delete]', error.message);
    });
    setPickingSlotsFull(prev => {
      const next = { ...prev };
      if (next[name]) next[name] = next[name].filter(s => s.id !== slotId);
      return next;
    });
  };

  const deleteSavedRow = (rowId: string) => {
    if (!selectedTienda) return;
    const tienda = selectedTienda;
    const row = formRows.find(r => r.id === rowId);
    const borrado = row?.savedItem;
    if (borrado) {
      const currentItems = dispatchData[tienda] || [];
      // Match por clave ESTABLE (pickingSlotId), no por pkg+orden (frágil: borraba el ítem equivocado).
      const idx = currentItems.findIndex(i => sameStableItem(i, borrado));
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tienda, idx });
      logActividad({ accion: 'eliminar_item', fuente: 'nacional', tiendaCod: TIENDAS[tienda]?.cod,
        tiendaNombre: tienda, label: ordenToLabel(borrado.orden), slotId: borrado.pickingSlotId });
    }
    deletePickingSlot(row?.pickingSlotId ?? borrado?.pickingSlotId);
    setFormRows(prev => prev.filter(r => r.id !== rowId));
    if (borrado) armarUndo(`${ordenToLabel(borrado.orden)} eliminado`, () => reAgregarItem(borrado, tienda));
  };

  const removeUnsavedRow = (rowId: string) => {
    const row = formRows.find(r => r.id === rowId);
    deletePickingSlot(row?.pickingSlotId);
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  // [Revertir borrado] Re-crea el slot (create-bodega) y re-agrega el item borrado con su carga.
  const reAgregarItem = async (item: DispatchItem, tienda: string) => {
    const cod = TIENDAS[tienda]?.cod ?? '';
    let slotId: number | undefined;
    try {
      const res = await fetch('/api/picking-pallets/create-bodega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: new Date().toISOString().slice(0, 10), store_cod: cod, tipo: pkgCodeNacional(item.pkg), contenido: 'hogar' }),
      });
      const slot = (await res.json() as { data?: PickingSlot }).data;
      if (slot) { slotId = slot.id; setPickingSlotsFull(prev => ({ ...prev, [tienda]: [...(prev[tienda] ?? []), slot] })); }
    } catch { /* sin slot: se re-agrega igual (sin #) */ }
    dispatch({ type: 'ADD_ITEM', tienda, item: { ...item, pickingSlotId: slotId } });
    if (slotId) {
      supabase.from('picking_pallets').update({ peso_kg: item.peso, alto: item.alto, ancho: item.ancho, largo: item.largo })
        .eq('id', slotId).then(({ error }) => { if (error) console.error('[reAgregar picking update]', error.message); });
    }
    showToast(`↩ ${ordenToLabel(item.orden)} restaurado`, '#16A34A');
  };

  // [Unificar inline] La unificación P3→P1 se hace ahora inline y automática (iniciarUnionInline
  // suma+borra el source en el acto y reabre el target para la altura), conservando el código de
  // P1. Ya no se usa el modal ni /api/picking-pallets/combine para este flujo.

  // Sumar un Bulto/Chocolate a un Pallet/Contenedor: el bulto se elimina (item + slot) y
  // su peso se SUMA al destino (P3 #4). El destino conserva su altura. Sin modal ni altura.
  const sumarBultoAPallet = (bultoRowId: string, palletLabel: string, palletRowId: string) => {
    if (!selectedTienda) return;
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

    // Contexto: un solo UPDATE_ITEMS — quita el bulto guardado (si lo estaba) y suma el peso
    // al pallet guardado (si lo está). El match es por id ESTABLE (pickingSlotId/orden) — no
    // por pkg+orden, que cambia bajo renumberItems tras un eco remoto (causa del "freeze").
    if (bultoRow.savedItem || palletRow.savedItem) {
      const cur = dispatchData[selectedTienda] || [];
      // Reconfirmar contra el contexto vigente: si el pallet destino ya no existe (fue
      // absorbido/renumerado en otro dispositivo), avisar en vez de hacer un no-op silencioso.
      const targetInCtx = palletRow.savedItem
        ? findItemForRow(cur, { pickingSlotId: palletRow.pickingSlotId, savedItem: palletRow.savedItem })
        : undefined;
      if (palletRow.savedItem && !targetInCtx) {
        showToast('El pallet destino cambió — recarga la tienda e inténtalo otra vez', '#D97706');
        return;
      }
      const newItems = cur
        .filter(i => !sameStableItem(i, bultoRow.savedItem))
        .map(i => sameStableItem(i, palletRow.savedItem) ? { ...i, peso: nuevoPeso } : i);
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: renumberItems(newItems) });
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
    logActividad({ accion: 'sumar', fuente: 'nacional', tiendaCod: TIENDAS[selectedTienda]?.cod,
      tiendaNombre: selectedTienda, sourceLabel: bultoRow.pkg === 'chocolate' ? 'CH' : 'bulto',
      label: palletLabel, peso: bultoPeso, slotId: targetSlotId });
  };

  /* ── Unificar pallets/contenedores INLINE (P3 → P1) ───────────────────────────────────
     Igual de automático que sumar un CH a un pallet: SIN modal ni confirmación. El peso de P3
     se suma a P1; P1 conserva su slot/código; P3 se borra (slot + item) en el acto. Luego P1
     se reabre como card editable con el peso ya sumado para ingresar/ajustar la altura y
     "Agregar" (guardado normal). Se actualizan AMBOS cachés de slots (light + full) para que
     NO aparezca el fantasma "¿Con cuál fue unificado?" (gP usa el light). Navegación-safe. */
  const iniciarUnionInline = (sourceRow: FormRow, targetRow: FormRow, srcLabel?: string, tgtLabel?: string) => {
    if (!selectedTienda) return;
    const name      = selectedTienda;
    const srcPeso   = sourceRow.savedItem?.peso ?? (parseFloat(sourceRow.peso) || 0);
    const tgtPeso   = targetRow.savedItem?.peso ?? (parseFloat(targetRow.peso) || 0);
    const nuevoPeso = sumPeso(tgtPeso, srcPeso);
    const prevAlto  = targetRow.savedItem?.alto ?? (parseFloat(targetRow.alto) || 0);
    const srcSlot   = sourceRow.pickingSlotId ?? sourceRow.savedItem?.pickingSlotId;
    const tgtSlot   = targetRow.pickingSlotId ?? targetRow.savedItem?.pickingSlotId;
    const srcCode   = sourceRow.pkg === 'contenedor' ? 'C' : sourceRow.pkg === 'chocolate' ? 'CH' : sourceRow.pkg === 'box' ? 'B' : 'P';
    const mguia     = unionRefs(targetRow.savedItem?.guia ?? targetRow.guia, sourceRow.savedItem?.guia ?? sourceRow.guia);

    // 1) Items: quitar el item del source y el del target (el target se re-agrega al "Agregar").
    const cur = dispatchData[name] || [];
    const remaining = cur.filter(i => !sameStableItem(i, sourceRow.savedItem) && !sameStableItem(i, targetRow.savedItem));
    if (remaining.length !== cur.length) {
      dispatch({ type: 'UPDATE_ITEMS', tienda: name, items: renumberItems(remaining) });
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
      next[name] = (next[name] ?? [])
        .filter(s => s.id !== srcSlot)
        .map(s => s.id === tgtSlot ? { ...s, peso_kg: nuevoPeso } : s);
      return next;
    });
    setPickingSlots(prev => {
      const arr = [...(prev[name] ?? [])];
      const idx = arr.findIndex(s => s.tipo === srcCode);
      if (idx >= 0) arr.splice(idx, 1);
      return { ...prev, [name]: arr };
    });

    // 4) Form: quitar la card source; reabrir el target como card editable con el peso ya sumado,
    //    la altura previa y las guías fusionadas, para ingresar/ajustar la altura y "Agregar".
    setFormRows(prev => prev
      .filter(r => r.id !== sourceRow.id)
      .map(r => r.id === targetRow.id
        ? { ...r, saved: false, savedItem: undefined, peso: String(nuevoPeso),
            alto: prevAlto ? String(prevAlto) : '', guia: mguia || r.guia, mergeReopened: true }
        : r));
    setFormMergeState(null);
    showToast(`Unificado (+${srcPeso}kg) — ingresa la altura y Agregar`, '#2563EB');
    logActividad({ accion: 'unificar', fuente: 'nacional', tiendaCod: TIENDAS[name]?.cod,
      tiendaNombre: name, sourceLabel: srcLabel, label: tgtLabel, peso: nuevoPeso, slotId: tgtSlot });
  };

  // Fusiona las guías del source en el target (lee refs ANTES de borrar) y borra el slot del
  // source en la BD. Fire-and-forget. El caché local ya quitó el slot del source arriba.
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

  const absorbPickingSlot = (tiendaName: string, type: 'p' | 'b' | 'c' | 'ch') => {
    setConsumedPickingSlots(prev => {
      const cur = prev[tiendaName] || { p: 0, b: 0, c: 0, ch: 0 };
      const next = { ...prev, [tiendaName]: { ...cur, [type]: cur[type] + 1 } };
      saveConsumedSlots(next);
      return next;
    });
  };

  const renumberItems = (list: DispatchItem[]) => {
    let pc = 1, bc = 1, cc = 1, chc = 1;
    return list.map(it => {
      if (it.pkg === 'pallet')     return { ...it, orden: `pallet${pc++}` };
      if (it.pkg === 'contenedor') return { ...it, orden: `contenedor${cc++}` };
      if (it.pkg === 'chocolate')  return { ...it, orden: `chocolate${chc++}` };
      return { ...it, orden: `bulto${bc++}` };
    });
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

    /* ── Multi-form (compacta): estado vacío = botones +Pallet/+Bulto/+Cont/+Choc ── */
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
            // [Req 3] Orden visual: Pallet → Contenedor → Bulto → Chocolate (estable). Solo la
            // VISTA; el estado formRows queda igual y los handlers operan por row.id.
            const orderedRows = ordenarCardsPorTipo(formRows, r => r.pkg);
            return (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {orderedRows.map((row, rowIdx) => {
              /* Locked / saved card */
              const rowColor = row.pkg === 'pallet' ? { border: 'rgba(37,99,235,0.40)', text: '#2563EB' } : row.pkg === 'contenedor' ? { border: 'rgba(107,33,168,0.40)', text: '#6B21A8' } : row.pkg === 'chocolate' ? { border: 'rgba(120,53,15,0.40)', text: '#92400E' } : { border: 'rgba(217,119,6,0.40)', text: '#D97706' };
              const pkgIdx   = orderedRows.slice(0, rowIdx + 1).filter(r => r.pkg === row.pkg).length;
              const rowLabel = row.pkg === 'pallet' ? `P${pkgIdx}` : row.pkg === 'chocolate' ? `CH${pkgIdx}` : row.pkg === 'contenedor' ? `C${pkgIdx}` : `B${pkgIdx}`;
              if (row.saved && row.savedItem) {
                return (
                  <div key={row.id} className="bg-white rounded-lg border-2 p-2" style={{ borderColor: rowColor.border }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-barlow-condensed text-[16px] font-extrabold" style={{ color: rowColor.text }}>
                        {rowLabel}{row.pickingSlotId ? <span className="ml-1.5 text-[14px] font-mono text-navy font-bold">#{row.pickingSlotId}</span> : null}
                      </span>
                      <div className="flex gap-0.5">
                        <button onClick={() => editSavedRow(row.id)} title="Editar"
                          className="text-[11px] text-text-3 hover:text-info cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✎</button>
                        <button onClick={() => deleteSavedRow(row.id)} title="Eliminar"
                          className="text-[11px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✕</button>
                      </div>
                    </div>
                    <div className="text-[13px] text-text-2 space-y-0.5 mb-1.5">
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
                    {/* P1: Sumar a Pallet directo en la card guardada (box/chocolate) sin abrir ✎ */}
                    {(row.pkg === 'box' || row.pkg === 'chocolate') && (() => {
                      const palletTargets = formRows.filter(r => r.id !== row.id && r.pkg === 'pallet');
                      if (palletTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.pkg === r.pkg).length;
                        return r.pkg === 'pallet' ? `P${idx}` : r.pkg === 'contenedor' ? `C${idx}` : r.pkg === 'chocolate' ? `CH${idx}` : `B${idx}`;
                      };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed" style={{ borderColor: 'rgba(37,99,235,0.30)' }}>
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
                    {/* P3 #1: Unificar directo en la card guardada (pallet/contenedor) sin abrir ✎ */}
                    {(row.pkg === 'pallet' || row.pkg === 'contenedor') && (() => {
                      const combineTargets = formRows.filter(r => r.id !== row.id && r.pkg === row.pkg);
                      if (combineTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.pkg === r.pkg).length;
                        return r.pkg === 'pallet' ? `P${idx}` : r.pkg === 'contenedor' ? `C${idx}` : r.pkg === 'chocolate' ? `CH${idx}` : `B${idx}`;
                      };
                      const col = row.pkg === 'contenedor'
                        ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)', solid: 'rgba(107,33,168,0.45)' }
                        : { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)', solid: 'rgba(37,99,235,0.45)' };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed" style={{ borderColor: col.border }}>
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
              /* Active / unsaved card */
              const isChocRow = row.pkg === 'chocolate';
              const isContRow = row.pkg === 'contenedor';
              const canSave = parseFloat(row.peso) > 0 && (isChocRow || isContRow || (parseFloat(row.alto) > 0 &&
                (row.pkg === 'pallet' || (parseFloat(row.ancho) > 0 && parseFloat(row.largo) > 0))));
              return (
                <div key={row.id} className="bg-white rounded-lg border px-2 py-2" style={{ borderColor: row.pkg === 'pallet' ? 'rgba(37,99,235,0.25)' : isContRow ? 'rgba(107,33,168,0.25)' : isChocRow ? 'rgba(120,53,15,0.25)' : 'rgba(217,119,6,0.25)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-barlow-condensed text-[15px] font-bold" style={{ color: rowColor.text }}>
                      {rowLabel}{row.pickingSlotId ? <span className="ml-1.5 text-[14px] font-mono text-navy font-bold">#{row.pickingSlotId}</span> : null}
                    </span>
                    <button onClick={() => removeUnsavedRow(row.id)}
                      className="text-text-3 hover:text-red cursor-pointer border-none bg-transparent text-[12px] px-0.5">✕</button>
                  </div>
                  {row.mergeReopened && (
                    <div className="mb-1.5 flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-bold"
                      style={{ border: '1.5px solid rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                      ⬦ Unificado · peso ya sumado — ingresa la altura y Agregar
                    </div>
                  )}
                  {row.pkg === 'pallet' && (
                    <div className="flex gap-0.5 mb-1.5">
                      {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(t => (
                        <button key={t} onClick={() => updateRow(row.id, 'tipo', t)}
                          className={`flex-1 py-1.5 rounded border text-[12px] font-bold cursor-pointer transition-all ${row.tipo === t ? TIPO_CLS[t] : 'border-border bg-bg-2 text-text-3'}`}>
                          {t === 'comida' ? 'Com' : t === 'hogar' ? 'Hog' : 'Mix'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    <div>
                      <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">Peso{isChocRow ? ' (máx 25kg)' : ''}</label>
                      <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)} placeholder="kg" inputMode="decimal"
                        className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                    </div>
                    {!isChocRow && !isContRow && (
                      <div>
                        <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">Alto</label>
                        <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)} placeholder="cm" inputMode="decimal"
                          max={row.pkg === 'pallet' ? MAX_ALTO_CM : undefined}
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                        {row.pkg === 'pallet' && excedeAltoMax(parseFloat(row.alto) || 0) && (
                          <div className="text-[10px] text-warn mt-0.5">⚠ máx {MAX_ALTO_CM} cm</div>
                        )}
                      </div>
                    )}
                  </div>
                  {row.pkg === 'box' ? (
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      <div>
                        <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">Ancho</label>
                        <input type="number" value={row.ancho} onChange={e => updateRow(row.id, 'ancho', e.target.value)} placeholder="cm" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                      <div>
                        <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">Largo</label>
                        <input type="number" value={row.largo} onChange={e => updateRow(row.id, 'largo', e.target.value)} placeholder="cm" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                    </div>
                  ) : isContRow ? (
                    <div className="mb-1.5 text-[11px] rounded px-1.5 py-1" style={{ color: '#6B21A8', background: 'rgba(107,33,168,0.06)', border: '1px solid rgba(107,33,168,0.15)' }}>
                      80 × 110 cm · alto 150 cm — fijo
                    </div>
                  ) : isChocRow ? (
                    <div className="mb-1.5 text-[11px] rounded px-1.5 py-1" style={{ color: '#92400E', background: 'rgba(120,53,15,0.06)', border: '1px solid rgba(120,53,15,0.15)' }}>
                      56 × 80 cm · alto 42 cm — fijo
                    </div>
                  ) : (
                    <div className="mb-1.5 text-[11px] text-info bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded px-1.5 py-1">
                      120 × 100 cm fijos
                    </div>
                  )}
                  {!hasPdf && (
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      <div>
                        <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">Guía</label>
                        <input type="text" value={row.guia} onChange={e => updateRow(row.id, 'guia', e.target.value)}
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red" />
                      </div>
                      <div>
                        <label className="text-[11px] text-text-3 uppercase tracking-wide block mb-0.5">$ Total</label>
                        <input type="number" value={row.valor} onChange={e => updateRow(row.id, 'valor', e.target.value)}
                          className="w-full bg-white border border-border rounded px-2 py-2 text-text font-barlow text-[15px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                    </div>
                  )}
                  {hasPdf && (
                    <div className="mb-1.5 text-[10px] text-success bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.25)] rounded px-1.5 py-1">
                      PDF · ${Math.round((pdfInfo?.totalSum || 0) / (items.length + 1)).toLocaleString('es-CL')}
                    </div>
                  )}
                  <button onClick={() => saveRow(row)} disabled={!canSave}
                    className="w-full py-2.5 text-white border-none rounded font-barlow-condensed text-[15px] font-bold cursor-pointer disabled:opacity-30 transition-all"
                    style={{ background: row.pkg === 'pallet' ? '#2563EB' : isContRow ? '#6B21A8' : isChocRow ? '#92400E' : '#D97706' }}>
                    {row.mergeReopened ? '+ Agregar (unificado)' : '+ Agregar'}
                  </button>
                  {!row.mergeReopened && (() => {
                    const esBultoOChoc = row.pkg === 'box' || row.pkg === 'chocolate';
                    const combineTargets = (row.pkg === 'pallet' || row.pkg === 'box' || row.pkg === 'contenedor')
                      ? formRows.filter(r => !r.saved && r.id !== row.id && r.pkg === row.pkg)
                      : [];
                    const palletTargets = esBultoOChoc
                      ? formRows.filter(r => r.id !== row.id && r.pkg === 'pallet')
                      : [];
                    if (combineTargets.length === 0 && palletTargets.length === 0) return null;
                    const gcStyle = row.pkg === 'pallet'
                      ? { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' }
                      : row.pkg === 'contenedor'
                      ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)' }
                      : { border: 'rgba(217,119,6,0.30)', color: '#D97706', bg: 'rgba(217,119,6,0.06)' };
                    const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                    const getRowLabel = (r: typeof row) => {
                      const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.pkg === r.pkg).length;
                      return r.pkg === 'pallet' ? `P${idx}` : r.pkg === 'contenedor' ? `C${idx}` : r.pkg === 'chocolate' ? `CH${idx}` : `B${idx}`;
                    };
                    return (
                      <div className="mt-1.5 pt-1.5 border-t border-dashed" style={{ borderColor: gcStyle.border }}>
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
            <button onClick={() => setDialogPkg('pallet')}
              className="py-2 border border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer hover:bg-[rgba(37,99,235,0.05)] transition-all">
              + Pallet
            </button>
            <button onClick={() => setDialogPkg('box')}
              className="py-2 border border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer hover:bg-[rgba(217,119,6,0.05)] transition-all">
              + Bulto
            </button>
            <button onClick={() => setDialogPkg('contenedor')}
              className="py-2 border border-dashed rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all"
              style={{ borderColor: 'rgba(107,33,168,0.4)', color: '#6B21A8', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,33,168,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              + Cont.
            </button>
            <button onClick={() => setDialogPkg('chocolate')}
              className="py-2 border border-dashed rounded-btn font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all"
              style={{ borderColor: 'rgba(120,53,15,0.4)', color: '#92400E', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(120,53,15,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              + Choc. CH
            </button>
          </div>
          {dialogPkg && selectedTienda && (
            <AgregarPalletDialog
              tipoLabel={PKG_LABEL[dialogPkg]}
              storeCod={TIENDAS[selectedTienda]?.cod ?? ''}
              date={new Date().toISOString().slice(0, 10)}
              onClose={() => setDialogPkg(null)}
              onNuevo={() => { const p = dialogPkg; setDialogPkg(null); void addFormRow(p); }}
              onExistente={(slot) => {
                setDialogPkg(null);
                const p = SLOT_TIPO_TO_PKG[slot.tipo] ?? 'box';
                void addFormRow(p, slot);
                showToast(`✓ Pallet #${slot.id} agregado`, '#16A34A');
              }}
            />
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

        {/* Fecha Armado / Despacho */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border, #E2E5EC)',
          background: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
              Armado
            </span>
            <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>{todayLabel}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
              Fecha de despacho
            </span>
            <input
              type="date"
              value={fechaDespacho}
              min={_localDate}
              onChange={e => dispatch({ type: 'SET_FECHA_DESPACHO', payload: e.target.value })}
              style={{
                border: '1.5px solid #dde3f0', borderRadius: 7, padding: '2px 8px',
                fontSize: 12, fontWeight: 700, color: '#1a2550', background: '#fff',
              }}
            />
          </div>
          {registrado && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, color: '#16A34A', fontWeight: 700,
              background: '#dcfce7', border: '1px solid #86efac', borderRadius: 20, padding: '2px 8px',
            }}>
              ✓ Registrado
            </span>
          )}
        </div>

        {/* Search */}
        <div className="px-2 py-2 bg-bg border-b border-border flex-shrink-0">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-white border border-border rounded-btn px-2.5 py-2 text-text font-barlow text-[15px] outline-none transition-all focus:border-red placeholder:text-text-3" />
        </div>

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
              <div className={`px-2.5 py-2 border-b sticky top-0 z-10 transition-all flex items-center gap-2 ${addDropActive ? 'bg-[rgba(211,47,47,0.18)] border-red/60' : 'bg-[rgba(211,47,47,0.10)] border-[rgba(211,47,47,0.20)]'}`}>
                <span className="font-barlow-condensed text-[15px] font-extrabold uppercase tracking-widest text-red">
                  {addDropActive ? '↓ Suelta aquí' : 'HOY'}
                </span>
                {!addDropActive && <span className="font-barlow-condensed text-[11px] text-red/50 uppercase tracking-wide">arrastra aquí</span>}
                {!addDropActive && <span className="ml-auto flex items-center gap-1.5">
                  <span className="font-barlow-condensed text-[10px] font-bold uppercase tracking-wider text-text-3">Nacional</span>
                  <SectionCount done={nacProg.done} total={nacProg.total} />
                </span>}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
                {today.map(t => {
                  const cardItems = dispatchData[t.name] || [];
                  const pkSlots   = pickingSlots[t.name] ?? [];
                  const consumed  = consumedPickingSlots[t.name] || { p: 0, b: 0, c: 0, ch: 0 };
                  return (
                    <TiendaGridCard key={t.name} name={t.name} tipoCat={tipoCatByCod[t.cod]}
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
                      storeStatus={odooProgress.get(TIENDAS[t.name]?.cod ?? '')?.status ?? 'none'}
                      storeDoneOps={odooProgress.get(TIENDAS[t.name]?.cod ?? '')?.done ?? 0}
                      storeTotalOps={odooProgress.get(TIENDAS[t.name]?.cod ?? '')?.total ?? 0}
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
                      <TiendaGridCard key={t.name} name={t.name} tipoCat={tipoCatByCod[t.cod]}
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
                        storeStatus="none"
                        storeDoneOps={0}
                        storeTotalOps={0}
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
          {/* Conteo: en desktop vive en la columna derecha (resumen); aquí solo mobile. */}
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
            <button
              onClick={() => { dispatch({ type: 'SET_TIENDA', payload: null }); setShowMobileResumen(true); }}
              className="flex-1 py-2.5 bg-red text-white rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer active:bg-red-dark lg:hidden"
              style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.30)' }}>
              RESUMEN ({activeTiendasCount})
            </button>
            <button
              onClick={() => setShowCalManual(true)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95 bg-bg-2 text-text-2 border border-border"
              title="Manual para copiar / Calendario general">
              <ClipboardList size={16} />
              <span className="hidden lg:inline font-barlow-condensed text-[14px] font-bold tracking-wide uppercase">Manual / Cal</span>
            </button>
            <button
              onClick={() => { sessionStorage.setItem('despacho_from', '/despacho/regiones'); router.push('/despacho'); }}
              className="flex-shrink-0 lg:flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95 bg-bg-2 text-text-2 border border-border"
              title="Ir al Enrutador">
              <Navigation size={16} />
              <span className="hidden lg:inline font-barlow-condensed text-[14px] font-bold tracking-wide uppercase">Enrutador</span>
            </button>
          </div>
        </div>
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

      {/* CENTER PANEL — formulario (desktop only) */}
      <div ref={rightPanelRef} className="hidden lg:flex flex-1 flex-col overflow-hidden relative">
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTienda
            ? renderForm(false)
            : (
              <div className="flex-1 flex flex-col items-center justify-center bg-navy" style={{ minHeight: 0 }}>
                <p className="font-barlow-condensed text-[22px] font-bold text-white/70 uppercase tracking-widest">Selecciona una tienda</p>
                <p className="text-[13px] text-white/35 mt-1">o arrastra desde &quot;Todas&quot; a Hoy</p>
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
          onMouseDown={handleRightMouseDown}
          onTouchStart={handleRightTouchStart}
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
            onCancel={() => { setCombineModal(null); }}
          />
        );
      })()}

      {/* [Unificar inline] La unificación P3→P1 ya no usa modal flotante: es automática
          (iniciarUnionInline) y el target se reabre como card editable para la altura. */}

      <CalManualSheet
        open={showCalManual}
        onClose={() => setShowCalManual(false)}
        title="REGIONES"
        lines={calManualLines}
      />

      <UndoBar pending={undoPending} onRevert={revertirUndo} onClose={descartarUndo} />
    </div>
  );
}
