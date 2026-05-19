'use client';

import { useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation, GripVertical } from 'lucide-react';
import { useApp } from '../../../../context/AppContext';
import { processPdf } from '../utils/pdfUtils';
import { TIENDAS, getTodayCods, validarDimensiones } from '../data/tiendas';
import { formatCod } from '../../rutas/utils/helpers';
import { getTiendasDelDia } from '../../utils/useCalendario';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';
import { ResumenPage } from './ResumenPage';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';

/* ── Per-day calendar overrides ── */
const todayDateKey   = `calendarExtra_${new Date().toISOString().split('T')[0]}`;
const todayRemoveKey = `calendarRemoved_${new Date().toISOString().split('T')[0]}`;
function loadExtraCods(): string[]  { try { return JSON.parse(localStorage.getItem(todayDateKey)   || '[]'); } catch { return []; } }
function saveExtraCods(cods: string[])  { localStorage.setItem(todayDateKey,   JSON.stringify(cods)); }
function loadRemovedCods(): string[] { try { return JSON.parse(localStorage.getItem(todayRemoveKey) || '[]'); } catch { return []; } }
function saveRemovedCods(cods: string[]) { localStorage.setItem(todayRemoveKey, JSON.stringify(cods)); }

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
  preset?: { pallets: number; bultos: number };
  hasPdf?: boolean;
  onSelect: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}
function TiendaGridCard({ name, isActive, isToday, itemCount, palletCount, preset, hasPdf, onSelect, onDragStart }: GridCardProps) {
  const t = TIENDAS[name];
  const boxCount = itemCount - palletCount;
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`flex flex-col items-center justify-between px-1 py-2 cursor-pointer rounded-lg transition-all select-none min-h-[64px] relative
        ${isActive
          ? 'bg-[rgba(211,47,47,0.12)] border-2 border-red'
          : hasPdf
          ? 'bg-[rgba(22,163,74,0.07)] border-2 border-success hover:bg-[rgba(22,163,74,0.12)]'
          : isToday
          ? 'bg-[rgba(211,47,47,0.04)] border border-[rgba(211,47,47,0.20)] hover:bg-[rgba(211,47,47,0.09)]'
          : 'bg-white border border-border hover:bg-bg'
        }`}>
      <div className={`font-barlow-condensed text-[13px] font-extrabold leading-none tracking-wide text-center ${isActive ? 'text-red' : hasPdf ? 'text-success' : 'text-navy'}`}>
        {formatCod(t.cod)}
      </div>
      <div className="text-[11px] font-semibold text-text-2 w-full text-center leading-tight truncate px-0.5 mt-0.5 uppercase">
        {t.name}
      </div>
      <div className="flex flex-wrap gap-0.5 justify-center mt-1 min-h-[16px]">
        {palletCount > 0 && (
          <span className="text-[11px] font-bold text-info bg-[rgba(37,99,235,0.12)] px-1.5 py-0.5 rounded-full leading-none">{palletCount}P</span>
        )}
        {boxCount > 0 && (
          <span className="text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.12)] px-1.5 py-0.5 rounded-full leading-none">{boxCount}B</span>
        )}
        {preset && itemCount === 0 && (preset.pallets > 0 || preset.bultos > 0) && (
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
  const [presets,           setPresets]            = useState<Record<string, { pallets: number; bultos: number }>>({});
  const [formRows,          setFormRows]           = useState<FormRow[]>([]);

  /* Calendar from Google Sheets */
  const [sheetsTodayCods, setSheetsTodayCods] = useState<string[]>([]);
  useEffect(() => {
    getTiendasDelDia('fal')
      .then(cods => {
        if (cods && cods.length > 0) {
          setSheetsTodayCods(cods);
        }
      })
      .catch(() => {});
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

  const fileRef       = useRef<HTMLInputElement>(null);
  const multiFileRef  = useRef<HTMLInputElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);

  /* Combine items (drag-to-merge) */
  const [dragIdx,      setDragIdx]      = useState<number | null>(null);
  const [dropIdx,      setDropIdx]      = useState<number | null>(null);
  const [combineModal, setCombineModal] = useState<{ srcIdx: number; tgtIdx: number } | null>(null);
  const itemDragRefs = useRef<(HTMLDivElement | null)[]>([]);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { dispatch: dispatchData, selectedTienda, currentTipo, currentPkg } = state;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const counts: Record<string, { p: number; b: number }> = {};
    Object.entries(dispatchData).forEach(([name, items]) => {
      if (!items.length) return;
      const tienda = TIENDAS[name];
      if (!tienda) return;
      const p = items.filter(i => i.pkg === 'pallet').length;
      const b = items.filter(i => i.pkg === 'box').length;
      if (p > 0 || b > 0) counts[tienda.cod] = { p, b };
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

  /* Initialize formRows when tienda changes */
  useEffect(() => {
    resetForm();
    setEditingIdx(null);
    if (selectedTienda) {
      setTimeout(() => formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 60);
      const preset = presets[selectedTienda];
      if (preset) {
        const existing = dispatchData[selectedTienda] || [];
        const exP = existing.filter(i => i.pkg === 'pallet').length;
        const exB = existing.filter(i => i.pkg === 'box').length;
        const remP = Math.max(0, preset.pallets - exP);
        const remB = Math.max(0, preset.bultos - exB);
        const rows: FormRow[] = [];
        for (let i = 0; i < remP; i++) rows.push({ id: `p${i}-${Date.now()}`, pkg: 'pallet', tipo: 'hogar', peso: '', alto: '', ancho: '100', largo: '120', guia: '', valor: '' });
        for (let i = 0; i < remB; i++) rows.push({ id: `b${i}-${Date.now()}`, pkg: 'box',    tipo: 'hogar', peso: '', alto: '', ancho: '',    largo: '',    guia: '', valor: '' });
        setFormRows(rows);
      } else {
        setFormRows([]);
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

  const select  = (name: string) => dispatch({ type: 'SET_TIENDA', payload: selectedTienda === name ? null : name });
  const setTipo = (t: TipoContenido) => { if (currentPkg === 'box') return; dispatch({ type: 'SET_TIPO', payload: t }); };
  const setPkg  = (p: TipoPaquete) => {
    dispatch({ type: 'SET_PKG', payload: p });
    if (p === 'box') dispatch({ type: 'SET_TIPO', payload: 'hogar' });
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
      const storeName = codToName[match[1]];
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
    setFormRows(prev => [...prev, { id: `row-${Date.now()}`, pkg, tipo: 'hogar', peso: '', alto: '', ancho: pkg === 'pallet' ? '100' : '', largo: pkg === 'pallet' ? '120' : '', guia: '', valor: '' }]);
  };
  const updateRow = (id: string, field: keyof FormRow, value: string) => {
    setFormRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const saveRow = (row: FormRow) => {
    if (!selectedTienda) return;
    const p = parseFloat(row.peso);
    if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const a  = parseFloat(row.alto) || 0;
    const aw = row.pkg === 'pallet' ? 100 : (parseFloat(row.ancho) || 0);
    const l  = row.pkg === 'pallet' ? 120 : (parseFloat(row.largo) || 0);
    const errores = validarDimensiones(row.pkg, p, a, aw, l);
    if (errores.length) { showToast('⚠ ' + errores[0], '#D32F2F'); return; }
    const currentItems = dispatchData[selectedTienda] || [];
    const pc = currentItems.filter(i => i.pkg === 'pallet').length + 1;
    const bc = currentItems.filter(i => i.pkg === 'box').length + 1;
    const orden = row.pkg === 'pallet' ? `pallet${pc}` : `bulto${bc}`;
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

  const updateInlinePreset = (field: 'pallets' | 'bultos', value: string) => {
    if (!selectedTienda) return;
    const n = Math.max(0, parseInt(value) || 0);
    const current = presets[selectedTienda] || { pallets: 0, bultos: 0 };
    setPresets(prev => ({ ...prev, [selectedTienda]: { ...current, [field]: n } }));
    const pkg: TipoPaquete = field === 'pallets' ? 'pallet' : 'box';
    const existing = (dispatchData[selectedTienda] || []).filter(i => i.pkg === pkg).length;
    const savedRowCount = formRows.filter(r => r.pkg === pkg && r.saved).length;
    const needed = Math.max(0, n - existing - savedRowCount);
    const unsavedForPkg = formRows.filter(r => r.pkg === pkg && !r.saved);
    const delta = needed - unsavedForPkg.length;
    if (delta > 0) {
      const newRows: FormRow[] = [];
      for (let i = 0; i < delta; i++)
        newRows.push({ id: `row-${Date.now()}-${i}`, pkg, tipo: 'hogar', peso: '', alto: '', ancho: pkg === 'pallet' ? '100' : '', largo: pkg === 'pallet' ? '120' : '', guia: '', valor: '', saved: false });
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

  /* Single-item form helpers */
  const startEdit = (idx: number) => {
    const item = items[idx]; setEditingIdx(idx);
    dispatch({ type: 'SET_PKG', payload: item.pkg }); dispatch({ type: 'SET_TIPO', payload: item.tipo });
    setPeso(String(item.peso)); setAlto(String(item.alto)); setAncho(String(item.ancho)); setLargo(String(item.largo));
    if (!hasPdf) { setGuia(item.guia); setValor(String(item.valor)); }
  };
  const cancelEdit = () => { setEditingIdx(null); resetForm(); };
  const renumberItems = (list: DispatchItem[]) => {
    let pc = 1, bc = 1;
    return list.map(it => { const ord = it.pkg === 'pallet' ? `pallet${pc}` : `bulto${bc}`; it.pkg === 'pallet' ? pc++ : bc++; return { ...it, orden: ord }; });
  };
  const saveItem = () => {
    if (!selectedTienda) return;
    const p = parseFloat(peso);
    if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
    const a = parseFloat(alto) || 0, aw = parseFloat(ancho) || 0, l = parseFloat(largo) || 0;
    const errores = validarDimensiones(currentPkg, p, a, aw, l);
    if (errores.length) { showToast('⚠ ' + errores[0], '#D32F2F'); return; }
    if (!hasPdf && editingIdx === null) {
      if (!guia.trim()) { showToast('Ingresa el N° de guía', '#D97706'); return; }
      if (!valor.trim() || parseFloat(valor) <= 0) { showToast('Ingresa el monto total', '#D97706'); return; }
    }
    if (editingIdx !== null) {
      const updated = items.map((it, i) => i !== editingIdx ? it : { ...it, tipo: currentTipo, pkg: currentPkg, peso: p, alto: a, ancho: aw, largo: l, guia: hasPdf ? it.guia : guia.trim(), valor: hasPdf ? it.valor : (parseFloat(valor) || 0) });
      dispatch({ type: 'UPDATE_ITEMS', tienda: selectedTienda, items: renumberItems(updated) });
      setEditingIdx(null); resetForm(); showToast('✓ Item actualizado', '#16A34A'); return;
    }
    let pc = 1, bc = 1;
    items.forEach(i => { i.pkg === 'pallet' ? pc++ : bc++; });
    const orden = currentPkg === 'pallet' ? `pallet${pc}` : `bulto${bc}`;
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
  const renderForm = () => {
    if (!selectedTienda) return null;
    const tienda = TIENDAS[selectedTienda];

    /* Shared header */
    const header = (
      <div className="bg-navy px-3 py-3 flex items-center justify-between flex-shrink-0">
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
        </div>
      </div>
    );

    const currentPreset = presets[selectedTienda] || { pallets: 0, bultos: 0 };

    /* Inline P/B quantity setter — shown in both modes */
    const presetBar = (
      <div className="px-3 py-2 bg-bg border-b border-border flex-shrink-0 flex items-center gap-2">
        <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-text-3 flex-1">Cant.</span>
        <div className="flex items-center gap-1.5">
          <span className="font-barlow-condensed text-[12px] font-bold text-info">P</span>
          <input type="number" min="0" max="20"
            value={currentPreset.pallets || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('pallets', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none focus:border-info [-webkit-appearance:none]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-barlow-condensed text-[12px] font-bold text-warn">B</span>
          <input type="number" min="0" max="20"
            value={currentPreset.bultos || ''}
            placeholder="0" inputMode="numeric"
            onChange={e => updateInlinePreset('bultos', e.target.value)}
            className="w-10 border border-border rounded-btn px-1.5 py-1.5 text-center font-barlow text-[14px] outline-none focus:border-warn [-webkit-appearance:none]" />
        </div>
      </div>
    );

    /* ── Multi-form (preset) mode ── */
    if (formRows.length > 0) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          {header}
          {presetBar}
          <div ref={formScrollRef} className="flex-1 overflow-y-auto px-2 py-2">
            <div className="grid grid-cols-2 gap-2 mb-2">
              {formRows.map((row) => {
                /* Locked / saved card */
                if (row.saved && row.savedItem) {
                  return (
                    <div key={row.id} className={`bg-white rounded-lg border-2 p-2 ${row.pkg === 'pallet' ? 'border-[rgba(37,99,235,0.40)]' : 'border-[rgba(217,119,6,0.40)]'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`font-barlow-condensed text-[14px] font-extrabold ${row.pkg === 'pallet' ? 'text-info' : 'text-warn'}`}>
                          {row.savedItem.orden}
                        </span>
                        <div className="flex gap-0.5">
                          <button onClick={() => editSavedRow(row.id)} title="Editar"
                            className="text-[11px] text-text-3 hover:text-info cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✎</button>
                          <button onClick={() => deleteSavedRow(row.id)} title="Eliminar"
                            className="text-[11px] text-text-3 hover:text-red cursor-pointer border-none bg-transparent px-1 py-0.5 rounded">✕</button>
                        </div>
                      </div>
                      <div className="text-[11px] text-text-2 space-y-0.5 mb-1.5">
                        <div className="font-semibold">{row.savedItem.peso}kg · {row.savedItem.alto}cm</div>
                        {row.savedItem.pkg === 'box' && <div className="text-text-3">{row.savedItem.ancho}×{row.savedItem.largo}cm</div>}
                        {row.savedItem.pkg === 'pallet' && <div className="text-text-3 capitalize">{row.savedItem.tipo}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                        <span className="text-[10px] text-success font-bold">Agregado</span>
                      </div>
                    </div>
                  );
                }
                /* Active / unsaved card */
                const canSave = parseFloat(row.peso) > 0 && parseFloat(row.alto) > 0 &&
                  (row.pkg === 'pallet' || (parseFloat(row.ancho) > 0 && parseFloat(row.largo) > 0));
                return (
                  <div key={row.id} className={`bg-white rounded-lg border px-2 py-2 ${row.pkg === 'pallet' ? 'border-[rgba(37,99,235,0.25)]' : 'border-[rgba(217,119,6,0.25)]'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`font-barlow-condensed text-[13px] font-bold ${row.pkg === 'pallet' ? 'text-info' : 'text-warn'}`}>
                        {row.pkg === 'pallet' ? 'Pallet' : 'Bulto'}
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
                        <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Peso</label>
                        <input type="number" value={row.peso} onChange={e => updateRow(row.id, 'peso', e.target.value)} placeholder="kg" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
                      <div>
                        <label className="text-[9px] text-text-3 uppercase tracking-wide block mb-0.5">Alto</label>
                        <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)} placeholder="cm" inputMode="decimal"
                          className="w-full bg-white border border-border rounded px-1.5 py-1 text-text font-barlow text-[12px] outline-none focus:border-red [-webkit-appearance:none]" />
                      </div>
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
                      className={`w-full py-1.5 text-white border-none rounded font-barlow-condensed text-[12px] font-bold cursor-pointer disabled:opacity-30 transition-all ${row.pkg === 'pallet' ? 'bg-info' : 'bg-warn'}`}>
                      + Agregar
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pb-1">
              <button onClick={() => addFormRow('pallet')}
                className="flex-1 py-2 border border-dashed border-info/50 text-info rounded-btn font-barlow-condensed text-[12px] font-bold cursor-pointer hover:bg-[rgba(37,99,235,0.05)] transition-all">
                + Pallet
              </button>
              <button onClick={() => addFormRow('box')}
                className="flex-1 py-2 border border-dashed border-warn/50 text-warn rounded-btn font-barlow-condensed text-[12px] font-bold cursor-pointer hover:bg-[rgba(217,119,6,0.05)] transition-all">
                + Bulto
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
        <div ref={formScrollRef} className="flex-1 overflow-y-auto px-2.5 pb-4">
          <SLabel>Guía PDF</SLabel>
          <div
            className={`border-2 rounded-card p-3 mb-1.5 text-center cursor-pointer bg-white transition-all text-[13px] ${hasPdf ? 'border-solid border-success bg-[rgba(22,163,74,0.04)]' : 'border-dashed border-border-2 hover:border-red hover:bg-[rgba(211,47,47,0.03)]'}`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') handlePdfFile(f); }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && handlePdfFile(e.target.files[0])} />
            {hasPdf
              ? <div className="text-success truncate">✓ <strong>{pdfInfo!.fileName}</strong></div>
              : <div className="text-text-3"><strong className="text-red">Subir PDF</strong></div>}
          </div>
          {pdfLoading && <div className="flex items-center gap-2 text-info text-[13px] py-1"><div className="w-3 h-3 border-2 border-bg-3 border-t-info rounded-full animate-spin flex-shrink-0" />Leyendo…</div>}
          {hasPdf && (
            <div className="bg-white border border-success rounded-card px-2.5 py-2 mb-1.5 text-[12px]">
              <div className="flex justify-between items-center"><span className="font-semibold text-success">{pdfInfo!.guias.length} guías · ${pdfInfo!.totalSum.toLocaleString('es-CL')}</span><button onClick={clearPdf} className="text-text-3 cursor-pointer bg-none border-none px-1">✕</button></div>
              <div className="text-text-3 mt-0.5 font-mono truncate">{pdfInfo!.guias.map(g => g.num).join(', ')}</div>
              <div className="text-text-3 mt-0.5">Con {items.length + 1} items: ${Math.round(pdfInfo!.totalSum / (items.length + 1)).toLocaleString('es-CL')} c/u</div>
            </div>
          )}
          {editingIdx !== null && (
            <div className="mt-2 bg-[rgba(37,99,235,0.07)] border border-[rgba(37,99,235,0.25)] rounded-card px-2.5 py-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-info">Editando #{editingIdx + 1}</span>
              <button onClick={cancelEdit} className="text-[12px] text-text-3 cursor-pointer border-none bg-none hover:text-red">✕ Cancelar</button>
            </div>
          )}
          <SLabel>Contenido</SLabel>
          <div className="flex gap-1.5">
            {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(t => (
              <button key={t} onClick={() => setTipo(t)} disabled={currentPkg === 'box' && t !== 'hogar'}
                className={`flex-1 py-2.5 rounded-btn border-[1.5px] font-barlow text-[14px] font-medium cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed ${currentTipo === t ? TIPO_CLS[t] : 'border-border bg-white text-text-2'}`}>
                {t === 'comida' ? 'Comida' : t === 'hogar' ? 'Hogar' : 'Mixto'}
              </button>
            ))}
          </div>
          {currentPkg === 'box' && <div className="mt-1 bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.25)] rounded-btn px-2.5 py-1 text-[12px] text-hogar">Bulto siempre es Hogar</div>}
          <SLabel>Tipo</SLabel>
          <div className="flex gap-1.5">
            {(['pallet', 'box'] as TipoPaquete[]).map(p => (
              <button key={p} onClick={() => setPkg(p)}
                className={`flex-1 py-2.5 rounded-btn border-[1.5px] font-barlow text-[14px] font-medium cursor-pointer transition-all ${currentPkg === p ? (p === 'pallet' ? 'bg-[rgba(37,99,235,0.08)] border-info text-info' : 'bg-[rgba(217,119,6,0.08)] border-warn text-warn') : 'border-border bg-white text-text-2'}`}>
                {p === 'pallet' ? 'Pallet' : 'Bulto'}
              </button>
            ))}
          </div>
          <SLabel>Peso y dimensiones</SLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Peso kg"><input type="number" value={peso} onChange={e => setPeso(e.target.value)} placeholder="500" inputMode="decimal" className={inputCls} /></Field>
            <Field label="Alto cm"><input type="number" value={alto} onChange={e => setAlto(e.target.value)} placeholder="160" inputMode="decimal" className={inputCls} /></Field>
            {currentPkg === 'pallet' ? (
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[12px] text-text-3 font-semibold tracking-wide uppercase">Ancho × Largo</label>
                <div className="bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.20)] rounded-btn px-2.5 py-2.5 text-[14px] font-mono text-info text-center">
                  100 × 120 cm — fijo
                </div>
              </div>
            ) : (
              <>
                <Field label="Ancho cm"><input type="number" value={ancho} onChange={e => setAncho(e.target.value)} placeholder="" inputMode="decimal" className={inputCls} /></Field>
                <Field label="Largo cm"><input type="number" value={largo} onChange={e => setLargo(e.target.value)} placeholder="" inputMode="decimal" className={inputCls} /></Field>
              </>
            )}
          </div>
          {!hasPdf ? (
            <><SLabel>Guía y valor</SLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="N° Guía"><input type="text" value={guia} onChange={e => setGuia(e.target.value)} placeholder="146502" inputMode="numeric" className={inputCls} /></Field>
                <Field label="Total $"><input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="793170" inputMode="decimal" className={inputCls} /></Field>
              </div>
            </>
          ) : (
            <><SLabel>Desde PDF (auto)</SLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="N° Guía">
                  <input type="text" value={editingIdx !== null ? (items[editingIdx]?.guia || '—') : (nextGuiaAuto || '—')} readOnly className="bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.35)] rounded-btn px-2.5 py-2.5 text-success font-barlow text-[16px] outline-none w-full" />
                  <div className="text-[11px] text-success mt-0.5">{editingIdx !== null ? 'Del PDF' : (nextGuiaAuto ? `${items.length + 1}/${pdfInfo!.guias.length}` : 'Sin guía')}</div>
                </Field>
                <Field label="Valor $">
                  <input type="number" value={editingIdx !== null ? (items[editingIdx]?.valor || 0) : valorAuto} readOnly className="bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.35)] rounded-btn px-2.5 py-2.5 text-success font-barlow text-[16px] outline-none w-full" />
                  <div className="text-[11px] text-success mt-0.5">Total ÷ items</div>
                </Field>
              </div>
            </>
          )}
          <button onClick={saveItem}
            className="w-full py-4 mt-3 bg-red text-white border-none rounded-card font-barlow-condensed text-[20px] font-bold tracking-wide cursor-pointer flex items-center justify-center gap-1.5 transition-all active:bg-red-dark active:scale-[0.99]"
            style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.28)' }}>
            {editingIdx !== null ? 'Guardar' : '+ Agregar'}
          </button>
          {items.length > 0 && editingIdx === null && (
            <button onClick={copyLast} className="w-full py-2.5 mt-1 bg-white text-text-2 border border-dashed border-border-2 rounded-btn text-[13px] cursor-pointer font-barlow hover:border-text-3">
              ↻ Copiar último
            </button>
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

      {/* Wrapper: on mobile = top row (tiendas+form), on desktop = transparent via contents */}
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden lg:contents">

      {/* LEFT PANEL — lista de tiendas */}
      <div className="w-[36%] sm:w-[33%] lg:w-[28%] min-w-[130px] lg:min-w-[160px] flex flex-col border-r-2 border-border overflow-hidden flex-shrink-0">

        {/* Search */}
        <div className="px-2 py-2 bg-bg border-b border-border flex-shrink-0">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-white border border-border rounded-btn px-2.5 py-2 text-text font-barlow text-[15px] outline-none transition-all focus:border-red placeholder:text-text-3" />
        </div>

        {/* HOY chips */}
        {todayNames.length > 0 && (
          <div className="px-2 py-2.5 border-b flex-shrink-0 bg-[rgba(211,47,47,0.08)] border-[rgba(211,47,47,0.20)]">
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

        {/* Toolbar: Multi-PDF */}
        <div className="px-2 py-1.5 bg-bg border-b border-border flex-shrink-0 flex gap-1.5">
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
              <div className="grid grid-cols-3 gap-1 p-1.5">
                {today.map(t => {
                  const cardItems = dispatchData[t.name] || [];
                  return (
                    <TiendaGridCard key={t.name} name={t.name}
                      isActive={selectedTienda === t.name} isToday
                      itemCount={cardItems.length}
                      palletCount={cardItems.filter(i => i.pkg === 'pallet').length}
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
                <div className={`px-2.5 py-2 border-b border-t sticky top-0 z-10 transition-all ${removeDropActive ? 'bg-[rgba(217,119,6,0.18)] border-warn/60' : 'bg-bg border-border'}`}>
                  <span className="font-barlow-condensed text-[13px] font-bold uppercase tracking-widest text-text-3">
                    {removeDropActive ? '↓ Suelta para retirar de hoy' : 'Todas'}
                  </span>
                  {!removeDropActive && <span className="font-barlow-condensed text-[11px] text-text-3/50 ml-2 uppercase tracking-wide">arrastra a HOY ↑</span>}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1 p-1.5">
                {others.map(t => {
                  const cardItems = dispatchData[t.name] || [];
                  return (
                    <TiendaGridCard key={t.name} name={t.name}
                      isActive={selectedTienda === t.name} isToday={false}
                      itemCount={cardItems.length}
                      palletCount={cardItems.filter(i => i.pkg === 'pallet').length}
                      hasPdf={!!state.pdfData[t.name]}
                      onSelect={() => select(t.name)}
                      onDragStart={e => handleAddDragStart(e, t.name)} />
                  );
                })}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="py-10 text-center text-text-3">
              <p className="text-[13px] opacity-60">Sin resultados</p>
            </div>
          )}
        </div>

        {/* ENRUTADOR */}
        <div className="px-2 py-2 border-t border-border flex-shrink-0">
          <button
            onClick={() => { sessionStorage.setItem('despacho_from', '/despacho/regiones'); router.push('/despacho'); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-full cursor-pointer transition-all active:opacity-70"
            style={{ background: 'rgba(211,47,47,0.10)', border: '1px solid rgba(211,47,47,0.50)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{
                   background: 'linear-gradient(145deg, #EF4444, #B91C1C)',
                   boxShadow: '0 3px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                 }}>
              <Navigation size={14} color="#fff" strokeWidth={2} />
            </div>
            <span className="font-barlow-condensed text-[13px] font-bold tracking-widest uppercase" style={{ color: '#B91C1C' }}>ENRUTADOR</span>
          </button>
        </div>
      </div>

      {/* CENTER PANEL — formulario */}
      <div ref={rightPanelRef} className="flex-1 flex flex-col overflow-hidden relative lg:border-r-2 lg:border-border">
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedTienda
            ? renderForm()
            : (
              <div className="flex-1 flex flex-col items-center justify-center bg-navy" style={{ minHeight: 0 }}>
                <p className="font-barlow-condensed text-[22px] font-bold text-white/70 uppercase tracking-widest">Selecciona una tienda</p>
                <p className="text-[13px] text-white/35 mt-1">o arrastra desde "Todas" a Hoy</p>
              </div>
            )
          }
        </div>

        {/* Calendar modals */}
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
      </div>

      </div>{/* end top-row wrapper */}

      {/* RIGHT PANEL — resumen (full width below on mobile/tablet, right column on desktop) */}
      <div className="h-[200px] sm:h-[220px] lg:h-auto border-t-2 border-border lg:border-t-0 lg:w-[28%] lg:min-w-[200px] flex flex-col overflow-hidden flex-shrink-0">
        <ResumenPage panel />
      </div>

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

    </div>
  );
}
