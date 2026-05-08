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

function buildQrText(store: StoreLabel, item: LabelItem): string {
  return [
    `KiosClub — ${formatCod(store.cod)}`,
    store.name,
    `${item.tipo.toUpperCase()} ${item.itemNum}/${item.totalItems}`,
    item.guias.length ? `Guías: ${item.guias.join(', ')}` : '',
    item.totalValue > 0 ? `Total: $${item.totalValue.toLocaleString('es-CL')}` : '',
    store.ventana ? `Ventana: ${store.ventana}` : '',
  ].filter(Boolean).join('\n');
}

/* ── Label (also rendered in the hidden print area) ── */
function Label({ store, item }: { store: StoreLabel; item: LabelItem }) {
  const qr = buildQrText(store, item);
  const isPallet = item.tipo === 'Pallet';

  return (
    <div
      className="label-card bg-white flex flex-col"
      style={{ width: '100mm', height: '150mm', padding: '6mm', boxSizing: 'border-box', pageBreakAfter: 'always', breakAfter: 'page' }}>

      {/* Top row: info + QR */}
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: '4mm' }}>
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
        <div style={{ flexShrink: 0 }}>
          <QRCodeSVG value={qr || ' '} size={82} level="M" />
          <div style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: '5.5pt', color: '#aaa', marginTop: '1mm' }}>
            Escanear guías
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #e0e0e0', marginBottom: '4mm' }} />

      {/* Type badge */}
      <div style={{
        background: isPallet ? '#1B2A6B' : '#D97706',
        borderRadius: '7px',
        padding: '3.5mm 5mm',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '4mm',
      }}>
        <div>
          <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '17pt', fontWeight: 900, color: '#fff', letterSpacing: '0.5pt' }}>
            {item.tipo.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '8pt', color: 'rgba(255,255,255,0.70)', marginTop: '0.5mm' }}>
            Ítem {item.itemNum} de {item.totalItems}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '30pt', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
            {item.itemNum}<span style={{ fontSize: '13pt', opacity: 0.65 }}>/{item.totalItems}</span>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '2mm' }}>
        {item.guias.length > 0 && (
          <div>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5pt', marginBottom: '0.8mm' }}>
              N° Guía
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '8.5pt', color: '#333', wordBreak: 'break-all' }}>
              {item.guias.join(' · ')}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5pt' }}>Peso</div>
            <div style={{ fontFamily: 'Arial Black, sans-serif', fontSize: '10pt', color: '#333' }}>{item.peso} kg</div>
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

/* ── Store card in sidebar ── */
function StoreCard({ store, isSelected, onClick }: { store: StoreLabel; isSelected: boolean; onClick: () => void }) {
  const pallets  = store.items.filter(i => i.tipo === 'Pallet').length;
  const bultos   = store.items.filter(i => i.tipo === 'Bulto').length;
  const hasGuides = store.items.some(i => i.guias.length > 0);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-border transition-all border-l-2
        ${isSelected ? 'bg-[rgba(27,42,107,0.06)] border-l-navy' : 'bg-white hover:bg-bg border-l-transparent'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-barlow-condensed text-[14px] font-extrabold text-navy">{formatCod(store.cod)}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide
            ${store.source === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>
            {store.source === 'santiago' ? 'Sant' : 'Reg'}
          </span>
          {hasGuides && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(22,163,74,0.10)] text-success uppercase">PDF</span>}
        </div>
        <div className="text-[11px] text-text-2 font-semibold truncate leading-tight mt-0.5">{store.name}</div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {pallets > 0 && <span className="font-barlow-condensed text-[12px] font-bold text-info bg-[rgba(37,99,235,0.10)] px-1.5 py-0.5 rounded-full">{pallets}P</span>}
        {bultos  > 0 && <span className="font-barlow-condensed text-[12px] font-bold text-warn bg-[rgba(217,119,6,0.10)] px-1.5 py-0.5 rounded-full">{bultos}B</span>}
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
  const [uploadLoading, setUploadLoading] = useState(false);
  const [dragOver,      setDragOver]      = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── Build unified store list ── */
  const rebuild = useCallback((guideMap: Record<string, GuideEntry>, regData: Record<string, DispatchItem[]>) => {
    const result: StoreLabel[] = [];

    /* Santiago — from localStorage (persisted by SantiagoContext) */
    const santItems = loadSantiagoItems();
    Object.entries(santItems).forEach(([cod, items]) => {
      if (!items.length) return;
      const t = getTiendaSantiagoByCod(cod);
      if (!t) return;
      const allItems = [...items.filter(i => i.tipo === 'Pallet'), ...items.filter(i => i.tipo === 'Bulto')];
      const guide    = guideMap[cod];
      const guideNums = guide?.guias || [];
      const perItem  = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'santiago',
        cod,
        name: t.tienda,
        address: t.direccion,
        ventana: t.ventanaHoraria,
        items: allItems.map((it, idx) => ({
          orden: it.orden,
          tipo: it.tipo,
          itemNum: idx + 1,
          totalItems: allItems.length,
          peso: it.peso,
          guias: guideNums.length > 0 ? (idx < guideNums.length ? [guideNums[idx]] : guideNums) : [],
          totalValue: perItem,
        })),
      });
    });

    /* Regiones — from AppContext (persisted to localStorage on every change) */
    Object.entries(regData).forEach(([name, items]) => {
      if (!items.length) return;
      const t = TIENDAS[name];
      if (!t) return;
      const allItems = [...items.filter(i => i.pkg === 'pallet'), ...items.filter(i => i.pkg === 'box')];
      const guide    = guideMap[t.cod];
      const guideNums = guide?.guias || [];
      const perItem  = allItems.length > 0 && (guide?.totalSum || 0) > 0 ? Math.round(guide!.totalSum / allItems.length) : 0;
      result.push({
        source: 'regiones',
        cod: t.cod,
        name: t.name,
        address: `${t.calle || ''} ${t.numero || ''}`.trim(),
        ventana: '',
        items: allItems.map((it, idx) => ({
          orden: it.orden,
          tipo: it.pkg === 'pallet' ? 'Pallet' : 'Bulto',
          itemNum: idx + 1,
          totalItems: allItems.length,
          peso: it.peso,
          guias: it.guia ? [it.guia] : (guideNums.length > 0 ? (idx < guideNums.length ? [guideNums[idx]] : guideNums) : []),
          totalValue: it.valor || perItem,
        })),
      });
    });

    result.sort((a, b) => a.cod.localeCompare(b.cod));
    setStores(result);
    setSelected(prev => {
      if (prev && result.find(s => s.cod === prev)) return prev;
      return result.length > 0 ? result[0].cod : null;
    });
  }, []);

  /* Re-build when Regiones data or guides change */
  useEffect(() => {
    const g = loadGuides();
    setGuides(g);
    rebuild(g, appState.dispatch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState.dispatch]);

  /* ── PDF upload & auto-assign ── */
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
        newGuides[storeCod] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum };
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
      showToast('No se pudo asignar. Nombre del archivo debe iniciar con el código (ej: 11ILC-...).', false);
  };

  const selectedStore = stores.find(s => s.cod === selected);
  const totalP = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Pallet').length, 0);
  const totalB = stores.reduce((n, s) => n + s.items.filter(i => i.tipo === 'Bulto').length, 0);

  /* ── RENDER ── */
  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #estado-print-area { display: block !important; }
          @page { size: 100mm 150mm; margin: 0; }
          .label-card { page-break-after: always; break-after: page; }
        }
        #estado-print-area { display: none; }
      `}</style>

      {/* Hidden print area — all labels */}
      <div id="estado-print-area">
        {stores.flatMap(store =>
          store.items.map((item, idx) => (
            <Label key={`${store.cod}-${idx}`} store={store} item={item} />
          ))
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── LEFT: Store list ── */}
        <div className="w-full lg:w-[250px] flex-shrink-0 flex flex-col border-r border-border overflow-hidden">

          <div className="px-3 py-3 bg-navy flex-shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-barlow-condensed text-[11px] uppercase tracking-widest text-white/50">
                {stores.length} tienda{stores.length !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-2.5">
                {totalP > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-[#93C5FD]">{totalP}P</span>}
                {totalB > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-[#FCD34D]">{totalB}B</span>}
              </div>
            </div>
            <button
              onClick={() => window.print()}
              disabled={stores.length === 0}
              className="w-full py-2.5 bg-red text-white border-none rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer disabled:opacity-30 transition-all active:opacity-80 flex items-center justify-center gap-2"
              style={{ boxShadow: stores.length > 0 ? '0 3px 10px rgba(211,47,47,0.40)' : 'none' }}>
              🖨 Imprimir todas
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {stores.length === 0 ? (
              <div className="py-16 text-center px-4">
                <div className="text-3xl mb-3 opacity-15">📦</div>
                <p className="text-[13px] text-text-3 font-semibold">Sin datos de despacho</p>
                <p className="text-[11px] text-text-3 opacity-50 mt-1 leading-snug">Registra pallets/bultos en Bodega Santiago o Regiones</p>
              </div>
            ) : (
              stores.map(s => (
                <StoreCard key={s.cod} store={s} isSelected={selected === s.cod} onClick={() => setSelected(s.cod)} />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Upload + preview ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Upload strip */}
          <div
            className={`flex-shrink-0 border-b border-border px-4 py-3 transition-colors ${dragOver ? 'bg-[rgba(211,47,47,0.04)]' : 'bg-bg'}`}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}>
            <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-barlow-condensed text-[13px] font-bold uppercase tracking-wide text-text">
                  Subir guías de despacho
                </div>
                <div className="text-[11px] text-text-3 mt-0.5 leading-snug">
                  {dragOver
                    ? 'Suelta los PDFs aquí…'
                    : 'Nombre del archivo debe empezar con el código de tienda · ej: 11ILC-guia.pdf'}
                </div>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadLoading}
                className={`flex-shrink-0 px-4 py-2 border-2 rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5
                  ${dragOver ? 'border-red bg-[rgba(211,47,47,0.08)] text-red' : 'border-border bg-white text-text-2 hover:border-red hover:text-red'}`}>
                {uploadLoading
                  ? <><div className="w-3 h-3 border-2 border-border border-t-red rounded-full animate-spin" />Procesando…</>
                  : dragOver ? '↓ Suelta' : '+ Subir PDFs'}
              </button>
            </div>

            {Object.keys(guides).length > 0 && (
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {Object.entries(guides).map(([cod, g]) => (
                  <span key={cod} className="flex items-center gap-1.5 bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.20)] rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
                    <span className="font-barlow-condensed text-[11px] font-bold text-success">{formatCod(cod)}</span>
                    <span className="text-[10px] text-text-3">{g.guias.length} guía{g.guias.length !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => {
                        const next = { ...guides };
                        delete next[cod];
                        saveGuides(next);
                        setGuides(next);
                        rebuild(next, appState.dispatch);
                      }}
                      className="text-text-3 hover:text-red cursor-pointer text-[12px] leading-none ml-0.5 border-none bg-transparent">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Label preview */}
          <div className="flex-1 overflow-y-auto bg-[#ECEEF3] p-5">
            {!selectedStore ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-[14px] text-text-3 opacity-40">
                  {stores.length === 0 ? 'Sin datos — registra despacho primero' : 'Selecciona una tienda'}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-barlow-condensed text-[20px] font-bold text-navy">
                      {formatCod(selectedStore.cod)} <span className="text-text-2 font-semibold">— {selectedStore.name}</span>
                    </div>
                    <p className="text-[11px] text-text-3 mt-0.5">
                      {selectedStore.items.length} etiqueta{selectedStore.items.length !== 1 ? 's' : ''}{selectedStore.address ? ` · ${selectedStore.address}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-2 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer active:opacity-80 flex items-center gap-1.5">
                    🖨 Imprimir
                  </button>
                </div>

                <div className="flex flex-wrap gap-5">
                  {selectedStore.items.map((item, idx) => (
                    <div key={idx} className="shadow-xl rounded-lg overflow-hidden" style={{ border: '1px solid #d0d4df' }}>
                      <Label store={selectedStore} item={item} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-white text-[13px] font-semibold shadow-2xl z-50 whitespace-nowrap ${toast.ok ? 'bg-[#16A34A]' : 'bg-[#D97706]'}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
