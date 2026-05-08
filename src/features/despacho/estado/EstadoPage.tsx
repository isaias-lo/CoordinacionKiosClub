'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../santiago/data/tiendasSantiago';
import { TIENDAS } from '../regiones/data/tiendas';
import { processPdf } from '../regiones/utils/pdfUtils';
import { formatCod } from '../rutas/utils/helpers';
import { useApp } from '../../../context/AppContext';
import type { SantiagoState, SantiagoItem } from '../santiago/types';
import type { DispatchItem } from '../../../types';

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
  tipo: 'Pallet' | 'Bulto';
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

const TODAY_KEY = new Date().toISOString().split('T')[0];
const GUIDES_KEY = `estadoGuias_${TODAY_KEY}`;

function loadSantiagoItems(): Record<string, SantiagoItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('santiagoState');
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

function buildQrUrl(store: StoreLabel, driveFileId?: string): string {
  const pallets  = store.items.filter(i => i.tipo === 'Pallet').length;
  const bultos   = store.items.filter(i => i.tipo === 'Bulto').length;
  const allGuias = [...new Set(store.items.flatMap(i => i.guias))];
  const p = new URLSearchParams({ cod: store.cod, p: String(pallets), b: String(bultos) });
  if (allGuias.length > 0) p.set('g', allGuias.join(','));
  if (driveFileId) p.set('drv', driveFileId);
  return `https://toolskios.vercel.app/recepcion?${p.toString()}`;
}

/* ── Label (100×150mm para Zebra) ── */
function Label({ store, item, qrUrl }: { store: StoreLabel; item: LabelItem; qrUrl: string }) {
  const isPallet = item.tipo === 'Pallet';
  const badgeBg  = isPallet ? '#1B2A6B' : '#D97706';

  return (
    <div
      className="label-card bg-white flex flex-col"
      style={{ width: '100mm', height: '150mm', padding: '6mm', boxSizing: 'border-box', pageBreakAfter: 'always', breakAfter: 'page' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '3mm', marginBottom: '4mm' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'monospace', fontSize: '7pt', color: '#888', marginBottom: '1.5mm', letterSpacing: '0.5pt' }}>
            {store.source === 'santiago' ? 'BODEGA SANTIAGO' : 'BODEGA REGIONES'}
          </div>
          <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '24pt', fontWeight: 900, lineHeight: 1, color: '#111' }}>
            {formatCod(store.cod)}
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10.5pt', fontWeight: 700, color: '#222', marginTop: '1.5mm', lineHeight: 1.25 }}>
            {store.name}
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '7.5pt', color: '#666', marginTop: '1.5mm', lineHeight: 1.35 }}>
            {store.address}
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '22mm' }}>
          <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '9pt', fontWeight: 900, letterSpacing: '1pt', textTransform: 'uppercase', marginBottom: '0.5mm', color: badgeBg }}>
            {item.tipo}
          </div>
          <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '38pt', fontWeight: 900, lineHeight: 1, color: badgeBg }}>
            {item.itemNum}
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '8pt', color: '#999', marginTop: '0.5mm' }}>
            de {item.totalItems}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e0e0e0', marginBottom: '4mm' }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center', gap: '2mm' }}>
        <QRCodeSVG value={qrUrl} size={168} level="M" />
        <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '8pt', color: '#aaa', letterSpacing: '0.3pt', marginTop: '1mm' }}>
          Escanear para ver guías de despacho
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '3mm', paddingTop: '3mm' }}>
        {item.guias.length > 0 && (
          <div style={{ marginBottom: '2mm' }}>
            <span style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5pt' }}>Guía:{' '}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '8pt', color: '#333' }}>{item.guias.join(' · ')}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5pt' }}>Peso</div>
            <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '9.5pt', color: '#333' }}>{item.peso} kg</div>
          </div>
          {store.ventana && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5pt' }}>Ventana</div>
              <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '8.5pt', fontWeight: 700, color: '#333' }}>{store.ventana}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Store card ── */
function StoreCard({
  store, isSelected, onClick, checked, onCheck,
}: {
  store: StoreLabel;
  isSelected: boolean;
  onClick: () => void;
  checked: boolean;
  onCheck: (v: boolean) => void;
}) {
  const pallets   = store.items.filter(i => i.tipo === 'Pallet').length;
  const bultos    = store.items.filter(i => i.tipo === 'Bulto').length;
  const hasGuides = store.items.some(i => i.guias.length > 0);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-border transition-all border-l-[3px]
        ${isSelected ? 'bg-[rgba(27,42,107,0.06)] border-l-navy' : 'bg-white hover:bg-bg border-l-transparent'}`}>

      {/* Checkbox para selección de impresión */}
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onCheck(e.target.checked)}
        onClick={e => e.stopPropagation()}
        className="w-4 h-4 flex-shrink-0 cursor-pointer accent-navy rounded"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-barlow-condensed text-[18px] font-extrabold text-navy leading-none">{formatCod(store.cod)}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide
            ${store.source === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>
            {store.source === 'santiago' ? 'Santiago' : 'Regiones'}
          </span>
          {hasGuides && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[rgba(22,163,74,0.10)] text-success uppercase">
              PDF ✓
            </span>
          )}
        </div>
        <div className="text-[13px] text-text-2 font-semibold truncate leading-tight">{store.name}</div>
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
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN
═══════════════════════════════════════ */
export function EstadoPage() {
  const { state: appState } = useApp();

  const [stores,        setStores]        = useState<StoreLabel[]>([]);
  const [guides,        setGuides]        = useState<Record<string, GuideEntry>>({});
  const [selected,      setSelected]      = useState<string | null>(null);
  const [printCods,     setPrintCods]     = useState<Set<string>>(new Set());
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragOver,      setDragOver]      = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      const pallets  = items.filter(i => i.tipo === 'Pallet');
      const bultos   = items.filter(i => i.tipo === 'Bulto');
      const allItems = [...pallets, ...bultos];
      const guide    = guideMap[cod];
      const guideNums = guide?.guias || [];
      const perItem  = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'santiago', cod, name: t.tienda, address: t.direccion, ventana: t.ventanaHoraria,
        items: allItems.map((it, idx) => {
          const isPallet  = it.tipo === 'Pallet';
          const typeItems = isPallet ? pallets : bultos;
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
      const pallets  = items.filter(i => i.pkg === 'pallet');
      const bultos   = items.filter(i => i.pkg === 'box');
      const allItems = [...pallets, ...bultos];
      const guide    = guideMap[t.cod];
      const guideNums = guide?.guias || [];
      const perItem  = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'regiones', cod: t.cod, name: t.name, address: `${t.calle || ''} ${t.numero || ''}`.trim(), ventana: '',
        items: allItems.map((it, idx) => {
          const isPallet  = it.pkg === 'pallet';
          const typeItems = isPallet ? pallets : bultos;
          const typeIdx   = typeItems.indexOf(it);
          return { orden: it.orden, tipo: isPallet ? 'Pallet' : 'Bulto', itemNum: typeIdx + 1, totalItems: typeItems.length, peso: it.peso,
            guias: it.guia ? [it.guia] : (guideNums.length > 0 ? (idx < guideNums.length ? [guideNums[idx]] : guideNums) : []),
            totalValue: it.valor || perItem };
        }),
      });
    });

    result.sort((a, b) => a.cod.localeCompare(b.cod));
    setStores(result);
    // Preserve existing selections; add new stores as selected by default
    setPrintCods(prev => {
      const next = new Set(prev);
      result.forEach(s => { if (!next.has(s.cod)) next.add(s.cod); });
      for (const cod of [...next]) { if (!result.find(s => s.cod === cod)) next.delete(cod); }
      return next;
    });
    setSelected(prev => {
      if (prev && result.find(s => s.cod === prev)) return prev;
      return result.length > 0 ? result[0].cod : null;
    });
  }, []);

  useEffect(() => {
    const g = loadGuides();
    setGuides(g);
    rebuild(g, appState.dispatch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch]);

  const handleFiles = async (files: FileList) => {
    if (!files.length) return;
    setUploadLoading(true);

    const codMap: Record<string, string> = {};
    TIENDAS_SANTIAGO.forEach(t => { codMap[t.cod] = t.cod; });
    Object.values(TIENDAS).forEach(t => { codMap[t.cod] = t.cod; });

    let assigned = 0, skipped = 0;
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

        let driveFileId: string | undefined;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const driveRes = await fetch('/api/drive-upload', { method: 'POST', body: fd });
          if (driveRes.ok) driveFileId = (await driveRes.json()).fileId;
        } catch { /* non-blocking */ }

        newGuides[storeCod] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum, driveFileId };
        assigned++;
      } catch { skipped++; }
    }

    if (fileRef.current) fileRef.current.value = '';
    setUploadLoading(false);
    saveGuides(newGuides);
    setGuides(newGuides);
    rebuild(newGuides, appState.dispatch);
    if (assigned > 0)
      showToast(`✓ ${assigned} guía${assigned !== 1 ? 's' : ''} asignada${assigned !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitida${skipped !== 1 ? 's' : ''}` : ''}`);
    else
      showToast('No se pudo asignar. El nombre debe empezar con el código (ej: 11ILC-guia.pdf)', false);
  };

  const removeGuide = (cod: string) => {
    const next = { ...guides };
    delete next[cod];
    saveGuides(next);
    setGuides(next);
    rebuild(next, appState.dispatch);
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

  const allChecked  = stores.length > 0 && printCods.size === stores.length;
  const noneChecked = printCods.size === 0;

  const selectedStore = stores.find(s => s.cod === selected);
  const totalP = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Pallet').length, 0);
  const totalB = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Bulto').length, 0);
  const totalSelectedLabels = stores
    .filter(s => printCods.has(s.cod))
    .reduce((n, s) => n + s.items.length, 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #estado-print-area, #estado-print-area * { visibility: visible; }
          #estado-print-area { position: fixed; inset: 0; }
          @page { size: 100mm 150mm; margin: 0; }
          .label-card { page-break-after: always; break-after: page; }
        }
        #estado-print-area { display: none; }
        @media print { #estado-print-area { display: block; } }
      `}</style>

      {/* Hidden print area — only selected stores */}
      <div id="estado-print-area">
        {stores
          .filter(store => printCods.has(store.cod))
          .flatMap(store => {
            const qrUrl = buildQrUrl(store, guides[store.cod]?.driveFileId);
            return store.items.map((item, idx) => (
              <Label key={`${store.cod}-${idx}`} store={store} item={item} qrUrl={qrUrl} />
            ));
          })}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ══════════════════════════════
            LEFT — Subida + Lista + Imprimir
        ══════════════════════════════ */}
        <div className="w-full lg:w-[440px] flex-shrink-0 flex flex-col border-r border-border overflow-hidden">

          {/* Stats header */}
          <div className="px-5 py-4 bg-navy flex-shrink-0">
            <div className="font-barlow-condensed text-[22px] font-bold text-white leading-none">
              {stores.length} tienda{stores.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {totalP > 0 && <span className="font-barlow-condensed text-[15px] font-bold text-[#93C5FD]">{totalP} pallet{totalP !== 1 ? 's' : ''}</span>}
              {totalB > 0 && <span className="font-barlow-condensed text-[15px] font-bold text-[#FCD34D]">{totalB} bulto{totalB !== 1 ? 's' : ''}</span>}
              {totalP === 0 && totalB === 0 && <span className="text-[13px] text-white/35">Sin despacho registrado</span>}
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

            {/* Loaded guide chips */}
            {Object.keys(guides).length > 0 && (
              <div className="px-3 py-2 flex gap-1.5 flex-wrap">
                {Object.entries(guides).map(([cod, g]) => (
                  <span key={cod} className="flex items-center gap-1.5 bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.25)] rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                    <span className="font-barlow-condensed text-[12px] font-bold text-success">{formatCod(cod)}</span>
                    <span className="text-[11px] text-text-3">{g.guias.length}g</span>
                    <button
                      onClick={() => removeGuide(cod)}
                      className="text-text-3 hover:text-red cursor-pointer text-[14px] leading-none ml-0.5 border-none bg-transparent font-bold">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {Object.keys(guides).length === 0 && <div className="pb-3" />}
          </div>

          {/* Print controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-bg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-text-3 uppercase tracking-widest">Selección para imprimir</span>
              <button
                onClick={() => setPrintCods(allChecked ? new Set() : new Set(stores.map(s => s.cod)))}
                disabled={stores.length === 0}
                className="text-[12px] font-bold text-info hover:underline cursor-pointer border-none bg-transparent disabled:opacity-30">
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>
            <button
              onClick={() => window.print()}
              disabled={noneChecked || stores.length === 0}
              className="w-full py-3 bg-red text-white border-none rounded-btn font-barlow-condensed text-[16px] font-bold cursor-pointer disabled:opacity-30 transition-all active:opacity-80 flex items-center justify-center gap-2 tracking-wide"
              style={{ boxShadow: !noneChecked && stores.length > 0 ? '0 4px 14px rgba(211,47,47,0.45)' : 'none' }}>
              🖨 Imprimir {noneChecked ? '— nada seleccionado' : `${totalSelectedLabels} etiqueta${totalSelectedLabels !== 1 ? 's' : ''}`}
            </button>
          </div>

          {/* Store list */}
          <div className="flex-1 overflow-y-auto">
            {stores.length === 0 ? (
              <div className="py-20 text-center px-6">
                <div className="text-5xl mb-4 opacity-10">📦</div>
                <p className="text-[15px] text-text-2 font-bold mb-1">Sin datos de despacho</p>
                <p className="text-[13px] text-text-3 leading-snug">
                  Registra pallets o bultos en Bodega Santiago o Bodega Regiones
                </p>
              </div>
            ) : (
              stores.map(s => (
                <StoreCard
                  key={s.cod}
                  store={s}
                  isSelected={selected === s.cod}
                  onClick={() => setSelected(s.cod)}
                  checked={printCods.has(s.cod)}
                  onCheck={v => setPrintCods(prev => {
                    const next = new Set(prev);
                    v ? next.add(s.cod) : next.delete(s.cod);
                    return next;
                  })}
                />
              ))
            )}
          </div>
        </div>

        {/* ══════════════════════════════
            RIGHT — Previsualización de etiquetas
        ══════════════════════════════ */}
        <div className="flex-1 overflow-y-auto bg-[#ECEEF3] p-6">
          {!selectedStore ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-10">🏷️</div>
                <p className="text-[16px] text-text-3 font-semibold opacity-60">
                  {stores.length === 0 ? 'Sin datos — registra despacho primero' : 'Selecciona una tienda para ver las etiquetas'}
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
                <button
                  onClick={() => printSingleStore(selectedStore.cod)}
                  className="flex-shrink-0 px-5 py-3 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold cursor-pointer active:opacity-80 flex items-center gap-2 whitespace-nowrap"
                  style={{ boxShadow: '0 3px 10px rgba(27,42,107,0.30)' }}>
                  🖨 Solo esta tienda
                </button>
              </div>

              {/* Scale labels for preview only — 100mm≈378px, 150mm≈567px at 96dpi */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 16 }}>
                {(() => {
                  const SCALE  = 0.63;
                  const W = 378 * SCALE; // ≈238px
                  const H = 567 * SCALE; // ≈357px
                  const qrUrl = buildQrUrl(selectedStore, guides[selectedStore.cod]?.driveFileId);
                  return selectedStore.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="shadow-xl rounded-xl overflow-hidden flex-shrink-0"
                      style={{ border: '1px solid #d0d4df', width: W, height: H, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
                        <Label store={selectedStore} item={item} qrUrl={qrUrl} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
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
