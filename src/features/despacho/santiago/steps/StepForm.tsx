'use client';
import { useState, useEffect, useRef } from 'react';
import { Navigation } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSantiago } from '../context/SantiagoContext';
import { useApp } from '../../../../context/AppContext';
import { getTiendasSantiagoHoy, TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import { formatCod } from '../../rutas/utils/helpers';
import { getTiendasSantiagoHoyGrouped, getCalendarioSantiagoInicialHoy } from '../utils/calendarSantiago';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import type { TiendaSantiago, TipoCargamento, ContenidoSantiago, EstadoItem, SantiagoItem } from '../types';
import { pushCounts } from '../../../../lib/despachoSesion';

/* ── Calendar localStorage ── */
const todayKey    = new Date().toISOString().split('T')[0];
const EXTRA_KEY   = `calExtraSANT_${todayKey}`;
const REMOVED_KEY = `calRemovedSANT_${todayKey}`;
function loadExtra():   string[] { try { return JSON.parse(localStorage.getItem(EXTRA_KEY)   || '[]'); } catch { return []; } }
function loadRemoved(): string[] { try { return JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'); } catch { return []; } }

/* ── Constants ── */
const CONTENIDO_PALLET: ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto'];
const CONTENIDO_BULTO:  ContenidoSantiago[] = ['Hogar', 'Chocolate'];
const ESTADO_DEFAULT: EstadoItem = 'Listo para despachar';
const ESTADOS: EstadoItem[] = [
  'Listo para despachar', 'Despachado', 'Carga recibida', 'Carga No recibida por tienda',
];
const CHOCOLATE_DIMS = { alto: 38, largo: 78, ancho: 52, peso: 5 };

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
  t, isActive, isToday, itemCount, palletCount,
  despachoP, despachoB,
  onSelect, onAddToday, onRemoveFromToday,
}: {
  t: TiendaSantiago; isActive: boolean; isToday: boolean;
  itemCount: number; palletCount: number;
  despachoP?: number; despachoB?: number;
  onSelect: () => void;
  onAddToday?: () => void;
  onRemoveFromToday?: () => void;
}) {
  const boxCount     = itemCount - palletCount;
  const hasItems     = itemCount > 0;
  const expP         = despachoP ?? 0;
  const expB         = despachoB ?? 0;
  const showExpected = !hasItems && (expP > 0 || expB > 0);
  return (
    <div
      onClick={onSelect}
      className={`flex flex-col items-center justify-between px-1 py-2 cursor-pointer rounded-lg transition-all select-none min-h-[58px] relative
        ${isActive
          ? 'bg-[rgba(211,47,47,0.12)] border-2 border-red'
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
      <div className={`font-barlow-condensed text-[17px] font-extrabold leading-none tracking-wide ${isActive ? 'text-red' : 'text-navy'}`}>
        {formatCod(t.cod)}
      </div>
      <div className="text-[11px] font-semibold text-text-2 w-full text-center leading-tight truncate px-0.5 mt-0.5">
        {t.tienda}
      </div>
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 min-h-[16px]">
        {hasItems ? (
          <>
            {palletCount > 0 && <span className="text-[11px] font-bold text-info bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 rounded-full leading-none">{palletCount}P</span>}
            {boxCount    > 0 && <span className="text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.12)] px-1.5 py-0.5 rounded-full leading-none">{boxCount}B</span>}
          </>
        ) : showExpected ? (
          <>
            {expP > 0 && <span className="text-[11px] font-bold text-info/40 bg-[rgba(37,99,235,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-info/20">{expP}P</span>}
            {expB > 0 && <span className="text-[11px] font-bold text-warn/40 bg-[rgba(217,119,6,0.06)] px-1.5 py-0.5 rounded-full leading-none border border-dashed border-warn/20">{expB}B</span>}
          </>
        ) : null}
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
  const { state, dispatch } = useSantiago();
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

  /* Preset / multi-form */
  const [presets,  setPresets]  = useState<Record<string, { pallets: number; bultos: number }>>({});
  const [formRows, setFormRows] = useState<FormRow[]>([]);

  /* Resumen inline state */
  const [resumenExpanded, setResumenExpanded] = useState<string | null>(null);
  const [resumenEditing,  setResumenEditing]  = useState<ResumenEditState | null>(null);

  /* Calendar from Sheets */
  const [sheetsTodayGrouped, setSheetsTodayGrouped] = useState<{ rm: string[]; costa: string[] }>(getCalendarioSantiagoInicialHoy);
  const [selectedGrps, setSelectedGrps] = useState<Set<'rm' | 'costa'>>(new Set(['rm']));

  useEffect(() => {
    getTiendasSantiagoHoyGrouped()
      .then(grouped => {
        setSheetsTodayGrouped(grouped);
      })
      .catch(() => {});
  }, []);

  /* Despacho ↔ Santiago bidirectional sync */
  const [despachoCounts, setDespachoCounts] = useState<Record<string, { p: number; b: number }>>({});

  // Write santiagoCounts whenever items change → Despacho reads this
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const counts: Record<string, { p: number; b: number }> = {};
    Object.entries(items).forEach(([cod, list]) => {
      const p = list.filter(i => i.tipo === 'Pallet').length;
      const b = list.filter(i => i.tipo === 'Bulto').length;
      if (p > 0 || b > 0) counts[cod] = { p, b };
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
        const payload: { date?: string; counts?: Record<string, { p: number; b: number }> } = JSON.parse(raw);
        // New format: { date, counts } — discard if from a different day
        if (payload.counts !== undefined) {
          setDespachoCounts(payload.date === todayKey ? payload.counts : {});
        } else {
          // Legacy format: plain counts object (no date stamp)
          setDespachoCounts(payload as Record<string, { p: number; b: number }>);
        }
      } catch (_) {}
    };
    sync();
    window.addEventListener('storage', sync);
    const interval = setInterval(sync, 2000);
    return () => { window.removeEventListener('storage', sync); clearInterval(interval); };
  }, []);

  const prevContenidoRef = useRef<ContenidoSantiago>('Hogar');
  const formScrollRef    = useRef<HTMLDivElement>(null);

  /* ── Derived ── */
  const localTodayCods  = getTiendasSantiagoHoy().map(t => t.cod);
  const sheetsAllCods   = [...sheetsTodayGrouped.rm, ...sheetsTodayGrouped.costa];
  const baseTodayCods   = sheetsAllCods.length > 0 ? sheetsAllCods : localTodayCods;
  const allTodayCods    = [...baseTodayCods, ...extraCods.filter(c => !baseTodayCods.includes(c))]
    .filter(c => !removedCods.includes(c));
  // Orden determinado por allTodayCods (CAL_INICIAL / Despacho) — no por TIENDAS_SANTIAGO
  const tiendaByCod     = Object.fromEntries(TIENDAS_SANTIAGO.map(t => [t.cod, t]));
  const todayTiendas    = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t);
  const filtered        = TIENDAS_SANTIAGO.filter(t => {
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
  const activeTiendas      = Object.entries(items).filter(([, it]) => it.length > 0);
  const tiendaItems        = currentTienda ? (items[currentTienda.cod] || []) : [];
  const tiendaPallets      = tiendaItems.filter(i => i.tipo === 'Pallet').length;
  const tiendaBultos       = tiendaItems.filter(i => i.tipo === 'Bulto').length;

  const isChocolateBulto = tipo === 'Bulto' && contenido === 'Chocolate';
  const finalLargo = tipo === 'Pallet' ? 120 : isChocolateBulto ? CHOCOLATE_DIMS.largo : (parseFloat(largo) || 0);
  const finalAncho = tipo === 'Pallet' ? 100 : isChocolateBulto ? CHOCOLATE_DIMS.ancho : (parseFloat(ancho) || 0);
  const finalAlto  = isChocolateBulto ? CHOCOLATE_DIMS.alto : (parseFloat(alto) || 0);
  const pesoV      = (finalAlto * finalLargo * finalAncho) / 6000;
  const canAdd     = !!peso && parseFloat(peso) > 0 &&
    (isChocolateBulto || (
      !!alto && parseFloat(alto) > 0 &&
      (tipo === 'Pallet' || (!!largo && parseFloat(largo) > 0 && !!ancho && parseFloat(ancho) > 0))
    ));

  /* ── Resumen helpers ── */
  const buildSummaryString = () =>
    activeTiendas.map(([cod, it]) => {
      const p = it.filter(i => i.tipo === 'Pallet').length;
      const b = it.filter(i => i.tipo === 'Bulto').length;
      return `${cod}: ${[p > 0 ? `${p}P` : '', b > 0 ? `${b}B` : ''].filter(Boolean).join('+')}`;
    }).join(', ');

  const registrar = () => {
    if (!activeTiendas.length) { showToast('No hay items para registrar', '#D97706'); return; }
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
    router.push('/despacho');
  };

  const goToResumen = () => {
    dispatch({ type: 'CLEAR_TIENDA' });
    setView('resumen');
  };

  /* ── Calendar actions ── */
  const addToToday = (name: string) => {
    const t = TIENDAS_SANTIAGO.find(t => t.tienda === name); if (!t) return;
    const next = [...extraCods, t.cod];
    setExtraCods(next); localStorage.setItem(EXTRA_KEY, JSON.stringify(next));
    showToast(`✓ ${t.tienda} agregada a hoy`, '#16A34A');
  };
  const removeFromToday = (name: string) => {
    const t = TIENDAS_SANTIAGO.find(t => t.tienda === name); if (!t) return;
    const newExtra   = extraCods.filter(c => c !== t.cod);
    const newRemoved = [...removedCods, t.cod];
    setExtraCods(newExtra);     localStorage.setItem(EXTRA_KEY,   JSON.stringify(newExtra));
    setRemovedCods(newRemoved); localStorage.setItem(REMOVED_KEY, JSON.stringify(newRemoved));
    showToast(`${t.tienda} retirada de hoy`, '#D97706');
  };

  const selectTienda = (t: TiendaSantiago) => {
    dispatch({ type: 'SELECT_TIENDA', payload: t });
    // Auto-populate form rows from despachoCounts when no items registered yet
    const existing = items[t.cod] || [];
    if (!presets[t.cod] && existing.length === 0) {
      const dc = despachoCounts[t.cod];
      if (dc && (dc.p > 0 || dc.b > 0)) {
        setPresets(prev => ({ ...prev, [t.cod]: { pallets: dc.p, bultos: dc.b } }));
      }
    }
    setView('form');
  };

  /* ── Form effects ── */
  useEffect(() => {
    setTipo('Pallet'); setContenido('Hogar');
    setPeso(''); setAlto(''); setLargo(''); setAncho('');
    setEditingIdx(null);
    prevContenidoRef.current = 'Hogar';
    if (currentTienda) {
      setTimeout(() => formScrollRef.current?.scrollTo({ top: 0 }), 60);
      const preset = presets[currentTienda.cod];
      if (preset) {
        const existing = items[currentTienda.cod] || [];
        const rows: FormRow[] = [];
        for (let i = 0; i < Math.max(0, preset.pallets - existing.filter(x => x.tipo === 'Pallet').length); i++)
          rows.push({ id: `p${i}-${Date.now()}`, tipo: 'Pallet', contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
        for (let i = 0; i < Math.max(0, preset.bultos - existing.filter(x => x.tipo === 'Bulto').length); i++)
          rows.push({ id: `b${i}-${Date.now()}`, tipo: 'Bulto', contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
        setFormRows(rows);
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
      setPeso(String(CHOCOLATE_DIMS.peso)); setAlto(String(CHOCOLATE_DIMS.alto));
      setAncho(String(CHOCOLATE_DIMS.ancho)); setLargo(String(CHOCOLATE_DIMS.largo));
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
    const pc = existing.filter(i => i.tipo === 'Pallet').length;
    const bc = existing.filter(i => i.tipo === 'Bulto').length;
    dispatch({
      type: 'ADD_ITEM',
      item: {
        id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo, contenido,
        peso: parseFloat(peso), alto: pA, largo: pL, ancho: pW,
        pesoVolumetrico: Math.round(pesoV * 100) / 100, regimen,
        orden: tipo === 'Pallet' ? `P${pc + 1}` : `${bc + 1}B`,
        estado: ESTADO_DEFAULT,
      },
    });
    setPeso(''); setAlto('');
    if (tipo === 'Bulto' && !isChocolateBulto) { setLargo(''); setAncho(''); }
    showToast(`✓ ${tipo === 'Pallet' ? `P${pc+1}` : `${bc+1}B`} agregado`, '#16A34A');
  };

  const startEdit = (idx: number) => {
    const item = tiendaItems[idx];
    setEditingIdx(idx); setTipo(item.tipo); setContenido(item.contenido);
    setPeso(String(item.peso)); setAlto(String(item.alto));
    if (item.tipo === 'Bulto') { setLargo(String(item.largo)); setAncho(String(item.ancho)); }
    formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditingIdx(null); setPeso(''); setAlto(''); setLargo(''); setAncho(''); };

  /* ── Preset bar ── */
  const updateInlinePreset = (field: 'pallets' | 'bultos', value: string) => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const n   = Math.max(0, parseInt(value) || 0);
    const curr = presets[cod] || { pallets: 0, bultos: 0 };
    setPresets(prev => ({ ...prev, [cod]: { ...curr, [field]: n } }));
    const tipo2: TipoCargamento = field === 'pallets' ? 'Pallet' : 'Bulto';
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
        updated.alto = String(CHOCOLATE_DIMS.alto);
        updated.largo = String(CHOCOLATE_DIMS.largo);
        updated.ancho = String(CHOCOLATE_DIMS.ancho);
      } else if (field === 'contenido' && r.contenido === 'Chocolate') {
        updated.alto = ''; updated.largo = ''; updated.ancho = '';
      }
      return updated;
    }));

  const saveRow = (row: FormRow) => {
    if (!currentTienda || !regimen) return;
    const p = parseFloat(row.peso); if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const isChoc = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
    const a  = isChoc ? CHOCOLATE_DIMS.alto  : (parseFloat(row.alto)  || 0);
    const fL = row.tipo === 'Pallet' ? 120 : (isChoc ? CHOCOLATE_DIMS.largo : (parseFloat(row.largo) || 0));
    const fA = row.tipo === 'Pallet' ? 100 : (isChoc ? CHOCOLATE_DIMS.ancho : (parseFloat(row.ancho) || 0));
    if (!a) { showToast('Ingresa el alto', '#D97706'); return; }
    if (row.tipo === 'Bulto' && !isChoc && (!fL || !fA)) { showToast('Ingresa largo y ancho', '#D97706'); return; }
    const cod = currentTienda.cod;
    const existing = items[cod] || [];
    const pc = existing.filter(i => i.tipo === 'Pallet').length + 1;
    const bc = existing.filter(i => i.tipo === 'Bulto').length + 1;
    const savedItem: SantiagoItem = {
      id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo: row.tipo, contenido: row.contenido,
      peso: p, alto: a, largo: fL, ancho: fA,
      pesoVolumetrico: Math.round((a * fL * fA) / 6000 * 100) / 100, regimen,
      orden: row.tipo === 'Pallet' ? `P${pc}` : `${bc}B`,
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
    setResumenExpanded(cod);
  };
  const rCancelEdit = () => setResumenEditing(null);
  const rSaveEdit = () => {
    if (!resumenEditing) return;
    const { cod, idx, tipo: rTipo, contenido: rContenido, estado: rEstado } = resumenEditing;
    const item = (items[cod] || [])[idx];
    const isChoc = rTipo === 'Bulto' && rContenido === 'Chocolate';
    const alto  = isChoc ? CHOCOLATE_DIMS.alto  : (parseInt(resumenEditing.alto) || 0);
    const largo = rTipo === 'Pallet' ? item.largo : (isChoc ? CHOCOLATE_DIMS.largo : (parseInt(resumenEditing.largo) || 0));
    const ancho = rTipo === 'Pallet' ? item.ancho : (isChoc ? CHOCOLATE_DIMS.ancho : (parseInt(resumenEditing.ancho) || 0));
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
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {todayList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              return (
                <TiendaGridCard key={t.cod} t={t}
                  isActive={currentTienda?.cod === t.cod} isToday
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  despachoP={dc?.p} despachoB={dc?.b}
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
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {othersList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              return (
                <TiendaGridCard key={t.cod} t={t}
                  isActive={currentTienda?.cod === t.cod} isToday={false}
                  itemCount={tI.length} palletCount={tI.filter(i => i.tipo === 'Pallet').length}
                  despachoP={dc?.p} despachoB={dc?.b}
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
            className="flex-1 py-3 bg-red text-white rounded-btn font-barlow-condensed text-[17px] font-bold cursor-pointer active:bg-red-dark lg:hidden"
            style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.30)' }}>
            Ver resumen ({activeTiendasCount}) →
          </button>
        )}
        <button onClick={enrutar}
          className="w-full lg:w-auto lg:flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full cursor-pointer transition-all active:scale-95"
          style={{ background: 'rgba(211,47,47,0.10)', border: '1px solid rgba(211,47,47,0.50)' }}
          title="Ir al Enrutador">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{
                 background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
                 boxShadow: '0 3px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
               }}>
            <Navigation size={14} color="#fff" strokeWidth={2} />
          </div>
          <span className="font-barlow-condensed text-[15px] font-bold tracking-widest uppercase" style={{ color: '#B91C1C' }}>Enrutador</span>
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
              const t        = getTiendaSantiagoByCod(cod);
              const pallets  = it.filter(i => i.tipo === 'Pallet').length;
              const bultos   = it.filter(i => i.tipo === 'Bulto').length;
              const isOpen   = resumenExpanded === cod;
              const totalPeso = it.reduce((s, i) => s + i.peso, 0);

              return (
                <div key={cod} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>
                  <div
                    onClick={() => { rCancelEdit(); setResumenExpanded(isOpen ? null : cod); }}
                    className={`flex items-center gap-2.5 px-3 py-3 cursor-pointer transition-all active:bg-bg ${isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'}`}>
                    <div className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded min-w-[42px] text-center flex-shrink-0">{formatCod(cod)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-navy truncate leading-tight">{t?.tienda || cod}</div>
                      <div className="text-[11px] text-text-3 truncate">{t?.comuna} · {t?.ventanaHoraria}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {pallets > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-info bg-[rgba(37,99,235,0.10)] border border-[rgba(37,99,235,0.20)] px-2 py-0.5 rounded-full">{pallets}P</span>}
                      {bultos  > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-warn bg-[rgba(217,119,6,0.10)] border border-[rgba(217,119,6,0.20)] px-2 py-0.5 rounded-full">{bultos}B</span>}
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
                                    {(['Pallet', 'Bulto'] as TipoCargamento[]).map(tp => (
                                      <button key={tp}
                                        onClick={() => setResumenEditing(prev => prev ? { ...prev, tipo: tp, contenido: tp === 'Pallet' ? 'Comida' : 'Hogar' } : prev)}
                                        className={`flex-1 font-barlow-condensed text-[14px] font-bold py-2 rounded-full border transition-all ${
                                          re.tipo === tp ? (tp === 'Pallet' ? 'bg-info text-white border-info' : 'bg-warn text-white border-warn') : 'bg-white text-text-2 border-border'
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

                        return (
                          <div key={item.id} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-b-0 bg-white">
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
    const currentPreset = presets[currentTienda.cod] || { pallets: 0, bultos: 0 };
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} />

        <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-3">
          <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 flex-1">Cantidad</span>
          {(['pallets', 'bultos'] as const).map(field => (
            <div key={field} className="flex items-center gap-1.5">
              <span className={`font-barlow-condensed text-[13px] font-bold ${field === 'pallets' ? 'text-info' : 'text-warn'}`}>{field === 'pallets' ? 'P' : 'B'}</span>
              <input type="number" min="0" max="30"
                value={currentPreset[field] || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset(field, e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-info [-webkit-appearance:none]" />
            </div>
          ))}
        </div>

        <div ref={formScrollRef} className="flex-1 overflow-y-auto px-2 py-2">
          <div className="grid grid-cols-2 gap-2 mb-2">
            {formRows.map(row => {
              if (row.saved && row.savedItem) {
                return (
                  <div key={row.id} className={`bg-white rounded-xl border-2 p-2.5 ${row.tipo === 'Pallet' ? 'border-[rgba(37,99,235,0.40)]' : 'border-[rgba(217,119,6,0.40)]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-barlow-condensed text-[15px] font-extrabold ${row.tipo === 'Pallet' ? 'text-info' : 'text-warn'}`}>{row.savedItem.orden}</span>
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
              const isChocRow = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
              const canSaveRow = parseFloat(row.peso) > 0 &&
                (isChocRow || (parseFloat(row.alto) > 0 &&
                  (row.tipo === 'Pallet' || (parseFloat(row.largo) > 0 && parseFloat(row.ancho) > 0))));
              return (
                <div key={row.id} className={`bg-white rounded-xl border px-2 py-2.5 ${row.tipo === 'Pallet' ? 'border-[rgba(37,99,235,0.25)]' : 'border-[rgba(217,119,6,0.25)]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-barlow-condensed text-[13px] font-bold ${row.tipo === 'Pallet' ? 'text-info' : 'text-warn'}`}>{row.tipo}</span>
                    <button onClick={() => setFormRows(prev => prev.filter(r => r.id !== row.id))} className="text-text-3 active:text-red cursor-pointer border-none bg-transparent text-[13px]">✕</button>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {(row.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                      <button key={c} onClick={() => updateRow(row.id, 'contenido', c)}
                        className={`flex-1 py-1 rounded border text-[9px] font-bold cursor-pointer transition-all ${row.contenido === c ? 'bg-[rgba(37,99,235,0.10)] border-info text-info' : 'border-border bg-bg-2 text-text-3'}`}>
                        {c.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    <div>
                      <label className="text-[9px] text-text-3 uppercase block mb-0.5">peso</label>
                      <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)}
                        placeholder="kg" inputMode="decimal"
                        className="w-full bg-white border border-border rounded px-1.5 py-1.5 text-text font-barlow text-[13px] outline-none focus:border-red [-webkit-appearance:none]" />
                    </div>
                    {!isChocRow && (
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
                  <button onClick={() => saveRow(row)} disabled={!canSaveRow}
                    className={`w-full py-2 text-white border-none rounded font-barlow-condensed text-[13px] font-bold cursor-pointer disabled:opacity-30 ${row.tipo === 'Pallet' ? 'bg-info' : 'bg-warn'}`}>
                    + Agregar
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pb-2">
            <button onClick={() => addFormRow('Pallet')} className="flex-1 py-2.5 border-2 border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Pallet</button>
            <button onClick={() => addFormRow('Bulto')}  className="flex-1 py-2.5 border-2 border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">+ Bulto</button>
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
    const currentPreset = presets[currentTienda.cod] || { pallets: 0, bultos: 0 };
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} pallets={tiendaPallets} bultos={tiendaBultos} onBack={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }} />

        <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-3">
          <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 flex-1">Cantidad</span>
          {(['pallets', 'bultos'] as const).map(field => (
            <div key={field} className="flex items-center gap-1.5">
              <span className={`font-barlow-condensed text-[13px] font-bold ${field === 'pallets' ? 'text-info' : 'text-warn'}`}>{field === 'pallets' ? 'P' : 'B'}</span>
              <input type="number" min="0" max="30"
                value={currentPreset[field] || ''} placeholder="0" inputMode="numeric"
                onChange={e => updateInlinePreset(field, e.target.value)}
                className="w-12 border-2 border-border rounded-btn px-1.5 py-2 text-center font-barlow text-[15px] outline-none focus:border-info [-webkit-appearance:none]" />
            </div>
          ))}
        </div>

        <div ref={formScrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {editingIdx !== null && (
            <div className="bg-[rgba(37,99,235,0.07)] border border-[rgba(37,99,235,0.25)] rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-info">Editando item #{editingIdx + 1}</span>
              <button onClick={cancelEdit} className="text-[13px] text-text-3 cursor-pointer border-none bg-none active:text-red">✕ Cancelar</button>
            </div>
          )}

          {/* Tipo */}
          <div className="flex gap-2">
            {(['Pallet', 'Bulto'] as TipoCargamento[]).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex-1 py-3 lg:py-2.5 rounded-btn font-barlow-condensed text-[17px] lg:text-[15px] font-bold cursor-pointer border-2 transition-all ${
                  tipo === t
                    ? t === 'Pallet' ? 'bg-[rgba(37,99,235,0.10)] border-info text-info' : 'bg-[rgba(217,119,6,0.10)] border-warn text-warn'
                    : 'bg-white border-border text-text-2'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div className="flex gap-2">
            {(tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
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
          {isChocolateBulto ? (
            <div className="bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded-btn px-3 py-2.5 text-[13px] text-navy/70">
              Dimensiones fijas: {CHOCOLATE_DIMS.alto} × {CHOCOLATE_DIMS.largo} × {CHOCOLATE_DIMS.ancho} cm
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

          <button onClick={saveItem} disabled={!canAdd}
            className="w-full py-4 lg:py-3 bg-red text-white border-none rounded-card font-barlow-condensed text-[21px] lg:text-[18px] font-bold cursor-pointer disabled:opacity-30 active:bg-red-dark"
            style={{ boxShadow: canAdd ? '0 4px 14px rgba(211,47,47,0.28)' : 'none' }}>
            {editingIdx !== null ? '✓ Guardar cambios' : '+ Agregar'}
          </button>

          {/* Items list */}
          {tiendaItems.length > 0 && (
            <div className="border-t border-border pt-3 mt-1">
              <div className="font-barlow-condensed text-[12px] uppercase tracking-widest text-text-3 mb-3">Items ({tiendaItems.length})</div>
              <div className="flex flex-col gap-2">
                {tiendaItems.map((item, idx) => {
                  const isEditing = editingIdx === idx;
                  return (
                    <div key={item.id} className={`bg-white border-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all ${isEditing ? 'border-info bg-[rgba(37,99,235,0.04)]' : 'border-border'}`}>
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

      {/* ─── LEFT PANEL ─── */}
      <div className={`${view === 'list' ? 'flex' : 'hidden'} lg:flex flex-1 lg:flex-none flex-col w-full lg:w-[42%] lg:border-r-2 lg:border-border overflow-hidden lg:flex-shrink-0`}>

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

        {/* Desktop resumen (no tienda selected) + mobile form view */}
        <div className={`${view === 'form' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-hidden`}>
          {!currentTienda
            ? renderResumenPanel()
            : formRows.length > 0
              ? renderMultiForm()
              : renderSingleForm()
          }
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
    </div>
  );
}
