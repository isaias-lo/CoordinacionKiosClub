'use client';

import { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { useApp } from '../../../../context/AppContext';
import { buildRows, exportToTemplate } from '../utils/exportUtils';
import { TIENDAS, getTodayTiendas } from '../data/tiendas';
import { formatCod } from '../../rutas/utils/helpers';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { REGIONES_TERMINADO_KEY } from '@/components/modals/FinishModal';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';
import { MAX_ALTO_CM, excedeAltoMax } from '../../shared/palletLimits';

const TAG: Record<string, string> = {
  comida:        'bg-[rgba(217,119,6,0.15)] text-warn',
  hogar:         'bg-[rgba(124,58,237,0.15)] text-hogar',
  'comida-hogar':'bg-[rgba(8,145,178,0.15)] text-mixto',
  pallet:        'bg-[rgba(37,99,235,0.15)] text-info',
  box:           'bg-[rgba(217,119,6,0.15)] text-warn',
  chocolate:     'bg-[rgba(120,53,15,0.12)] text-[#92400E]',
};
const LABEL: Record<TipoContenido | TipoPaquete, string> = {
  comida: 'Comida', hogar: 'Hogar', 'comida-hogar': 'Mixto', pallet: 'Pallet', box: 'Bulto', contenedor: 'Contenedor', chocolate: 'Chocolate',
};

function renumber(list: DispatchItem[]): DispatchItem[] {
  let pc = 1, bc = 1, cc = 1, chc = 1;
  return list.map(it =>
    it.pkg === 'pallet'     ? { ...it, orden: `pallet${pc++}` }
    : it.pkg === 'contenedor' ? { ...it, orden: `contenedor${cc++}` }
    : it.pkg === 'chocolate'  ? { ...it, orden: `chocolate${chc++}` }
    : { ...it, orden: `bulto${bc++}` }
  );
}

const INPUT = 'w-full border border-border rounded-btn px-2 py-1.5 text-[13px] font-mono text-navy bg-white';
const LABEL_SM = 'text-[9px] text-text-3 mb-0.5 uppercase tracking-wide';

interface ResumenPageProps {
  panel?: boolean;
  /** Abre el FinishModal de registro (el botón "Registrar" vive ahora en esta barra, no en el header). */
  onRegistrar?: () => void;
}

export function ResumenPage({ panel = false, onRegistrar }: ResumenPageProps) {
  const { state, dispatch, showToast } = useApp();
  const { dispatch: dispatchData, selection } = state;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const [editingItem, setEditingItem] = useState<{ tienda: string; idx: number } | null>(null);

  /* Copy to tiendas */
  const [copyModal,   setCopyModal]   = useState<{ tienda: string; item: DispatchItem } | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [copySearch,  setCopySearch]  = useState('');

  /* Combine drag & drop */
  const [dragIdx,      setDragIdx]      = useState<number | null>(null);
  const [dropIdx,      setDropIdx]      = useState<number | null>(null);
  const [dragTienda,   setDragTienda]   = useState<string | null>(null);
  const [combineModal, setCombineModal] = useState<{ srcIdx: number; tgtIdx: number; tienda: string } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editPkg,   setEditPkg]   = useState<TipoPaquete>('pallet');
  const [editTipo,  setEditTipo]  = useState<TipoContenido>('comida');
  const [editPeso,  setEditPeso]  = useState('');
  const [editAlto,  setEditAlto]  = useState('');
  const [editAncho, setEditAncho] = useState('');
  const [editLargo, setEditLargo] = useState('');
  const [editGuia,  setEditGuia]  = useState('');
  const [editValor, setEditValor] = useState('');

  const todayOrder = getTodayTiendas();
  const names = [
    ...todayOrder.filter(n => dispatchData[n]?.length > 0),
    ...Object.keys(dispatchData).filter(n => dispatchData[n].length > 0 && !todayOrder.includes(n)),
  ];
  const stats = names.reduce((a, n) => {
    (dispatchData[n] || []).forEach(i => {
      if (i.pkg === 'pallet') a.pallets++;
      else if (i.pkg === 'chocolate') a.chocolates++;
      else a.bultos++;
      a.monto += i.valor || 0;
    });
    return a;
  }, { pallets: 0, bultos: 0, chocolates: 0, monto: 0 });

  const date = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');

  const exportAll = async () => {
    const rows = buildRows(dispatchData, selection);
    if (!rows.length) { showToast('No hay items seleccionados para exportar', '#D97706'); return; }
    try {
      await exportToTemplate(rows, `despacho_seleccionados_${date}.xlsx`);
      showToast(`✓ Excel exportado (${rows.length} items)`, '#16A34A');
    } catch (e) {
      showToast(`Error al exportar: ${e instanceof Error ? e.message : 'intenta de nuevo'}`, '#D32F2F');
    }
  };

  const exportTiendaSel = async (name: string) => {
    const sel = selection[name];
    if (!sel || sel.size === 0) { showToast('No hay items seleccionados', '#D97706'); return; }
    const rows = buildRows({ [name]: dispatchData[name] }, { [name]: sel });
    if (!rows.length) return;
    const safe = name.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await exportToTemplate(rows, `${safe}_${date}.xlsx`);
      showToast(`✓ ${rows.length} items · ${name.split(' ')[0]}`, '#16A34A');
    } catch (e) {
      showToast(`Error al exportar: ${e instanceof Error ? e.message : 'intenta de nuevo'}`, '#D32F2F');
    }
  };

  const startEdit = (tienda: string, idx: number) => {
    const item = (dispatchData[tienda] || [])[idx];
    if (!item) return;
    setEditPkg(item.pkg);
    setEditTipo(item.tipo);
    setEditPeso(String(item.peso));
    setEditAlto(String(item.alto || ''));
    setEditAncho(String(item.ancho || ''));
    setEditLargo(String(item.largo || ''));
    setEditGuia(item.guia || '');
    setEditValor(item.valor ? String(item.valor) : '');
    setEditingItem({ tienda, idx });
    setExpanded(prev => { const next = new Set(prev); next.add(tienda); return next; });
  };

  const handleCombineConfirm = (peso: number, alto: number) => {
    if (!combineModal) return;
    const { srcIdx, tgtIdx, tienda } = combineModal;
    const list = [...(dispatchData[tienda] || [])];
    const src = list[srcIdx];
    const tgt = list[tgtIdx];
    if (!src || !tgt) return;
    const tipoMerge: TipoContenido = src.tipo === tgt.tipo ? src.tipo : 'comida-hogar';
    const guia  = [src.guia, tgt.guia].filter(Boolean).join(', ');
    const valor = (src.valor || 0) + (tgt.valor || 0);
    const higher = Math.max(srcIdx, tgtIdx);
    const lower  = Math.min(srcIdx, tgtIdx);
    const newList = list.filter((_, i) => i !== higher && i !== lower);
    newList.splice(lower, 0, { ...src, peso, alto, tipo: tipoMerge, guia, valor });
    dispatch({ type: 'UPDATE_ITEMS', tienda, items: renumber(newList) });
    setCombineModal(null);
    showToast('✓ Items combinados', '#16A34A');
  };

  const handleCopyConfirm = () => {
    if (!copyModal || copyTargets.size === 0) return;
    const { item } = copyModal;
    const itemCopy: DispatchItem = { ...item, guia: '', orden: '' };
    copyTargets.forEach(tienda => {
      dispatch({ type: 'ADD_ITEM', tienda, item: { ...itemCopy } });
    });
    showToast(`✓ Copiado a ${copyTargets.size} tienda${copyTargets.size > 1 ? 's' : ''}`, '#16A34A');
    setCopyModal(null);
    setCopyTargets(new Set());
    setCopySearch('');
  };

  const cancelEdit = () => setEditingItem(null);

  const saveEdit = () => {
    if (!editingItem) return;
    const { tienda, idx } = editingItem;
    const list = [...(dispatchData[tienda] || [])];
    list[idx] = {
      ...list[idx],
      pkg:   editPkg,
      tipo:  editTipo,
      peso:  parseFloat(editPeso)  || 0,
      alto:  parseInt(editAlto)    || 0,
      ancho: parseInt(editAncho)   || 0,
      largo: parseInt(editLargo)   || 0,
      guia:  editGuia,
      valor: parseInt(editValor)   || 0,
    };
    dispatch({ type: 'UPDATE_ITEMS', tienda, items: renumber(list) });
    setEditingItem(null);
    showToast('✓ Item actualizado', '#16A34A');
  };

  /* ── Stats strip ── */
  const statsStrip = (
    <div className="bg-navy flex items-center px-3 py-2 gap-0 flex-shrink-0">
      <div className="flex-1 flex items-baseline gap-1 justify-center border-r border-white/10">
        <span className="font-barlow-condensed text-[22px] font-extrabold text-[#93C5FD] leading-none">{stats.pallets}</span>
        <span className="text-[10px] text-white/50 uppercase tracking-wide">P</span>
      </div>
      <div className="flex-1 flex items-baseline gap-1 justify-center border-r border-white/10">
        <span className="font-barlow-condensed text-[22px] font-extrabold text-[#FCD34D] leading-none">{stats.bultos}</span>
        <span className="text-[10px] text-white/50 uppercase tracking-wide">B</span>
      </div>
      {stats.chocolates > 0 && (
        <div className="flex-1 flex items-baseline gap-1 justify-center border-r border-white/10">
          <span className="font-barlow-condensed text-[22px] font-extrabold text-[#FBB6A0] leading-none">{stats.chocolates}</span>
          <span className="text-[10px] text-white/50 uppercase tracking-wide">CH</span>
        </div>
      )}
      <div className="flex-1 flex items-baseline gap-1 justify-center border-r border-white/10">
        <span className="font-barlow-condensed text-[22px] font-extrabold text-[#86EFAC] leading-none">{names.length}</span>
        <span className="text-[10px] text-white/50 uppercase tracking-wide">T</span>
      </div>
      {stats.monto > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <span className="font-barlow-condensed text-[13px] font-bold text-white/90 leading-none">
            ${Math.round(stats.monto / 1000)}K
          </span>
          <span className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">$</span>
        </div>
      )}
    </div>
  );

  /* Reabrir el despacho ya registrado (mismo comportamiento que tenía el botón del header). */
  const handleReopen = () => {
    if (!confirm('¿Reabrir el despacho del día?')) return;
    try { localStorage.removeItem(REGIONES_TERMINADO_KEY); } catch {}
    dispatch({ type: 'SET_REGISTRADO', payload: false });
    showToast('Despacho reabierto', '#8896A8');
  };

  /* ── Bottom action bar ── EXPORTAR + Registrar (el 🗑 y el Registrar del header se movieron aquí). */
  const actionBar = (
    <div className={`bg-white border-t border-border px-3 py-2.5 flex gap-2 flex-shrink-0 justify-end ${
      panel ? '' : 'fixed bottom-0 left-0 right-0 z-[150]'
    }`}
      style={{ boxShadow: '0 -4px 16px rgba(26,37,80,0.10)' }}>
      <button onClick={exportAll}
        className="py-2.5 px-4 bg-bg-2 text-text-2 border border-border rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide uppercase cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5">
        ↓ Exportar
      </button>
      {state.registrado ? (
        <button onClick={handleReopen}
          title="Registrado · toca para reabrir"
          className="py-2.5 px-5 bg-[#16A34A] text-white border-none rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide uppercase cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
          style={{ boxShadow: '0 4px 16px rgba(22,163,74,0.30)' }}>
          ✓ Completado
        </button>
      ) : (
        <button onClick={() => onRegistrar?.()}
          className="py-2.5 px-5 bg-red text-white border-none rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide uppercase cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
          style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.30)' }}>
          Registrar
        </button>
      )}
    </div>
  );

  /* ── Tiendas accordion ── */
  const acordeon = (
    <>
      {!names.length ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-text-3">
          <div className="text-3xl mb-2 opacity-40">📋</div>
          <p className="text-xs opacity-60 font-barlow-condensed uppercase tracking-wide text-center px-4">
            Sin items aún
          </p>
        </div>
      ) : names.map(name => {
        const t = TIENDAS[name];
        const items = dispatchData[name] || [];
        const sel   = selection[name] || new Set<number>();
        const allSel = sel.size === items.length;
        const isOpen = expanded.has(name);
        let pesoT = 0, valorT = 0;
        items.forEach(i => { pesoT += i.peso; valorT += i.valor || 0; });
        const pallets     = items.filter(i => i.pkg === 'pallet').length;
        const bultos      = items.filter(i => i.pkg === 'box').length;
        const chocolates  = items.filter(i => i.pkg === 'chocolate').length;

        return (
          <div key={name} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>

            {/* Row header */}
            <div
              onClick={() => { cancelEdit(); toggleExpanded(name); }}
              className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-all active:bg-bg ${
                isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'
              } ${sel.size > 0 ? 'border-l-4 border-l-success' : ''}`}>

              <div className="font-mono text-[10px] text-text-3 bg-bg-2 border border-border-2 px-1 py-0.5 rounded min-w-[40px] text-center flex-shrink-0">
                {t?.cod ? formatCod(t.cod) : ''}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-navy truncate leading-tight">{name}</div>
                <div className="text-[10px] text-text-3 truncate">{t?.region}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {pallets > 0 && (
                  <span className="font-barlow-condensed text-[11px] font-bold text-info bg-[rgba(37,99,235,0.10)] border border-[rgba(37,99,235,0.20)] px-1.5 py-0.5 rounded-full">
                    {pallets}P
                  </span>
                )}
                {bultos > 0 && (
                  <span className="font-barlow-condensed text-[11px] font-bold text-warn bg-[rgba(217,119,6,0.10)] border border-[rgba(217,119,6,0.20)] px-1.5 py-0.5 rounded-full">
                    {bultos}B
                  </span>
                )}
                {chocolates > 0 && (
                  <span className="font-barlow-condensed text-[11px] font-bold text-[#92400E] bg-[rgba(120,53,15,0.10)] border border-[rgba(120,53,15,0.20)] px-1.5 py-0.5 rounded-full">
                    {chocolates}CH
                  </span>
                )}
                {sel.size > 0 && (
                  <span className="font-mono text-[10px] text-success font-bold">✓{sel.size}</span>
                )}
                <span className="text-text-3 text-[10px] ml-0.5">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded panel */}
            {isOpen && (
              <div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-bg border-b border-border">
                  <div
                    onClick={() => dispatch({ type: 'TOGGLE_ALL_SELECTION', tienda: name, count: items.length })}
                    className={`flex items-center gap-1 cursor-pointer flex-shrink-0 px-1.5 py-0.5 rounded-btn transition-all ${
                      allSel ? 'bg-[rgba(22,163,74,0.12)]' : 'bg-white border border-border'
                    }`}>
                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-all ${
                      allSel ? 'bg-success border-success text-white' : 'border-border-2 bg-white'
                    }`}>
                      {allSel && '✓'}
                    </div>
                    <span className="text-[11px] font-semibold text-text-2">{allSel ? 'Quitar' : 'Todo'}</span>
                    <span className="font-mono text-[10px] text-text-3">{sel.size}/{items.length}</span>
                  </div>
                  <div className="flex-1 font-mono text-[10px] text-text-3 text-right">
                    {pesoT.toLocaleString('es-CL')}kg{valorT > 0 ? ` · $${Math.round(valorT/1000)}K` : ''}
                  </div>
                </div>

                {items.map((item, idx) => {
                  const isSel = sel.has(idx);
                  const dims  = [item.alto, item.ancho, item.largo].filter(Boolean);
                  const isEditing = editingItem?.tienda === name && editingItem?.idx === idx;

                  if (isEditing) {
                    return (
                      <div key={idx} className="border-l-4 border-info bg-[rgba(37,99,235,0.04)] border-b border-border/40">
                        <div className="px-2.5 pt-2 pb-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-2">
                            <div>
                              <div className={LABEL_SM}>Paquete</div>
                              <div className="flex gap-1">
                                {(['pallet', 'box', 'contenedor'] as TipoPaquete[]).map(p => (
                                  <button key={p} onClick={() => setEditPkg(p)}
                                    className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                      editPkg === p
                                        ? p === 'pallet'     ? 'bg-info text-white border-info'
                                        : p === 'contenedor' ? 'bg-[#6B21A8] text-white border-[#6B21A8]'
                                        : 'bg-warn text-white border-warn'
                                        : 'bg-white text-text-2 border-border'
                                    }`}>
                                    {LABEL[p]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className={LABEL_SM}>Contenido</div>
                              <div className="flex gap-1">
                                {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(tp => (
                                  <button key={tp} onClick={() => setEditTipo(tp)}
                                    className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                      editTipo === tp ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'
                                    }`}>
                                    {LABEL[tp]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-1 mb-1">
                            {([
                              { label: 'Peso', val: editPeso,  set: setEditPeso  },
                              { label: 'Alto', val: editAlto,  set: setEditAlto, max: editPkg === 'pallet' ? MAX_ALTO_CM : undefined },
                              { label: 'Ancho', val: editAncho, set: setEditAncho },
                              { label: 'Largo', val: editLargo, set: setEditLargo },
                            ] as { label: string; val: string; set: (v: string) => void; max?: number }[]).map(({ label, val, set, max }) => (
                              <div key={label}>
                                <div className={LABEL_SM}>{label}</div>
                                <input type="number" value={val} onChange={e => set(e.target.value)} max={max} className={INPUT} />
                                {label === 'Alto' && editPkg === 'pallet' && excedeAltoMax(parseFloat(val) || 0) && (
                                  <div className="text-[9px] text-warn">⚠ máx {MAX_ALTO_CM}</div>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-1 mb-2">
                            <div>
                              <div className={LABEL_SM}>Guía</div>
                              <input type="text" value={editGuia} onChange={e => setEditGuia(e.target.value)} className={INPUT} />
                            </div>
                            <div>
                              <div className={LABEL_SM}>Valor $</div>
                              <input type="number" value={editValor} onChange={e => setEditValor(e.target.value)} className={INPUT} />
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={saveEdit}
                              className="flex-1 py-1.5 bg-info text-white border-none rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">
                              ✓ Guardar
                            </button>
                            <button onClick={cancelEdit}
                              className="px-3 py-1.5 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[13px] cursor-pointer">
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const isDragging = dragIdx === idx && dragTienda === name;
                  const isDropTarget = dropIdx === idx && dragTienda === name && dragIdx !== null && items[dragIdx]?.pkg === item.pkg;
                  return (
                    <div key={idx}
                      data-item-idx={idx}
                      data-item-tienda={name}
                      draggable
                      onDragStart={() => { setDragIdx(idx); setDragTienda(name); }}
                      onDragOver={(e) => {
                        if (dragIdx !== null && dragTienda === name && dragIdx !== idx && items[dragIdx]?.pkg === item.pkg)
                          { e.preventDefault(); setDropIdx(idx); }
                      }}
                      onDragLeave={() => setDropIdx(prev => prev === idx ? null : prev)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null && dragTienda === name && dragIdx !== idx && items[dragIdx]?.pkg === item.pkg)
                          setCombineModal({ srcIdx: dragIdx, tgtIdx: idx, tienda: name });
                        setDragIdx(null); setDropIdx(null); setDragTienda(null);
                      }}
                      onDragEnd={() => { setDragIdx(null); setDropIdx(null); setDragTienda(null); }}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        (e.currentTarget as HTMLElement).dataset.txS = String(t.clientX);
                        (e.currentTarget as HTMLElement).dataset.tyS = String(t.clientY);
                        longPressRef.current = setTimeout(() => { setDragIdx(idx); setDragTienda(name); navigator.vibrate?.(25); }, 220);
                      }}
                      onTouchMove={(e) => {
                        const t = e.touches[0];
                        const el = e.currentTarget as HTMLElement;
                        if (longPressRef.current && (Math.abs(t.clientX - parseFloat(el.dataset.txS ?? '0')) > 8 || Math.abs(t.clientY - parseFloat(el.dataset.tyS ?? '0')) > 8))
                          { clearTimeout(longPressRef.current); longPressRef.current = null; }
                        if (dragIdx === null) return;
                        e.preventDefault();
                        const under = document.elementFromPoint(t.clientX, t.clientY);
                        const itemEl = under?.closest('[data-item-tienda]') as HTMLElement | null;
                        const tgt = itemEl ? parseInt(itemEl.dataset.itemIdx ?? '-1') : -1;
                        const tgtTienda = itemEl?.dataset.itemTienda;
                        setDropIdx(tgt !== -1 && tgt !== dragIdx && tgtTienda === name ? tgt : null);
                      }}
                      onTouchEnd={(e) => {
                        if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
                        if (dragIdx === null) return;
                        e.preventDefault();
                        const t = e.changedTouches[0];
                        const under = document.elementFromPoint(t.clientX, t.clientY);
                        const itemEl = under?.closest('[data-item-tienda]') as HTMLElement | null;
                        const tgt = itemEl ? parseInt(itemEl.dataset.itemIdx ?? '-1') : -1;
                        const tgtTienda = itemEl?.dataset.itemTienda;
                        if (tgt !== -1 && tgt !== dragIdx && tgtTienda === name && items[dragIdx]?.pkg === items[tgt]?.pkg)
                          setCombineModal({ srcIdx: dragIdx, tgtIdx: tgt, tienda: name });
                        setDragIdx(null); setDropIdx(null); setDragTienda(null);
                      }}
                      onClick={() => { if (!dragTienda) dispatch({ type: 'TOGGLE_SELECTION', tienda: name, idx }); }}
                      className={[
                        'flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/40 last:border-b-0 transition-all select-none',
                        isDropTarget ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : isSel ? 'bg-[rgba(22,163,74,0.06)]' : 'bg-white',
                        isDragging ? 'opacity-40' : '',
                        dragIdx !== null && dragTienda === name ? 'cursor-grabbing' : 'cursor-grab',
                      ].join(' ')}>
                      <GripVertical size={11} color="#CBD5E1" className="flex-shrink-0" />
                      <div
                        onClick={e => { e.stopPropagation(); dispatch({ type: 'TOGGLE_SELECTION', tienda: name, idx }); }}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-all ${
                          isSel ? 'bg-success border-success text-white' : 'border-border-2 bg-white'
                        }`}>
                        {isSel && '✓'}
                      </div>
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full font-barlow-condensed uppercase flex-shrink-0 ${TAG[item.pkg]}`}>
                        {item.orden}
                      </span>
                      <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full font-barlow-condensed uppercase flex-shrink-0 ${TAG[item.tipo]}`}>
                        {LABEL[item.tipo]}
                      </span>
                      <div className="flex-1 font-mono text-[10px] text-text-3 truncate">
                        {item.peso}kg
                        {dims.length ? ' · ' + dims.join('×') + 'cm' : ''}
                        {item.guia ? ' · #' + item.guia : ''}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(name, idx); }}
                        className="text-text-3 border border-border bg-bg-2 px-1.5 py-0.5 rounded text-[11px] cursor-pointer hover:text-info flex-shrink-0"
                        title="Editar">
                        ✎
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setCopyModal({ tienda: name, item }); setCopyTargets(new Set()); setCopySearch(''); }}
                        className="text-text-3 border border-border bg-bg-2 px-1.5 py-0.5 rounded text-[11px] cursor-pointer hover:text-success flex-shrink-0"
                        title="Copiar a otras tiendas">
                        ⧉
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          dispatch({ type: 'DELETE_ITEM', tienda: name, idx });
                          showToast(`${item.orden} eliminado`, '#D97706');
                        }}
                        className="text-text-3 border border-border bg-bg-2 px-1.5 py-0.5 rounded text-[11px] cursor-pointer hover:text-red flex-shrink-0"
                        title="Eliminar">
                        ✕
                      </button>
                    </div>
                  );
                })}

                <div className="px-2.5 py-1.5 bg-bg">
                  <button
                    onClick={() => exportTiendaSel(name)}
                    disabled={sel.size === 0}
                    className="w-full py-2 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer transition-all disabled:opacity-30">
                    ↓ {sel.size > 0 ? `${sel.size} item${sel.size > 1 ? 's' : ''}` : 'seleccionados'} · {t?.cod ? formatCod(t.cod) : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const combineModalEl = combineModal && (() => {
    const list = dispatchData[combineModal.tienda] || [];
    const src = list[combineModal.srcIdx];
    const tgt = list[combineModal.tgtIdx];
    if (!src || !tgt) return null;
    const srcLabel = `${src.orden} · ${src.peso}kg${src.guia ? ` · #${src.guia}` : ''}`;
    const tgtLabel = `${tgt.orden} · ${tgt.peso}kg${tgt.guia ? ` · #${tgt.guia}` : ''}`;
    const mergedGuia  = [src.guia, tgt.guia].filter(Boolean).join(', ');
    const mergedValor = (src.valor || 0) + (tgt.valor || 0);
    return (
      <CombineItemsModal
        pkgLabel={src.pkg === 'pallet' ? 'Pallets' : 'Bultos'}
        srcLabel={srcLabel}
        tgtLabel={tgtLabel}
        mergedGuia={mergedGuia || undefined}
        mergedValor={mergedValor || undefined}
        onConfirm={handleCombineConfirm}
        onCancel={() => { setCombineModal(null); setDragIdx(null); setDropIdx(null); setDragTienda(null); }}
      />
    );
  })();

  /* ── Copy to tiendas modal ── */
  const copyModalEl = copyModal && (() => {
    const { tienda: srcTienda, item } = copyModal;
    const allNames = Object.keys(TIENDAS).filter(n => n !== srcTienda);
    const todayNames = allNames.filter(n => (dispatchData[n]?.length ?? 0) > 0);
    const filtered = copySearch
      ? allNames.filter(n =>
          n.toLowerCase().includes(copySearch.toLowerCase()) ||
          TIENDAS[n].cod.toLowerCase().includes(copySearch.toLowerCase())
        )
      : allNames;
    const dims = [item.alto, item.ancho, item.largo].filter(Boolean);
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/60" onClick={() => setCopyModal(null)} />
        <div className="relative w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
             style={{ maxHeight: '88vh' }}>

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-navy text-white flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="font-barlow-condensed text-[15px] font-bold uppercase tracking-wider">Copiar a tiendas</div>
              <div className="text-[11px] text-white/55 mt-0.5 truncate">
                {item.orden} · {LABEL[item.pkg]} · {LABEL[item.tipo]} · {item.peso}kg{dims.length ? ` · ${dims.join('×')}cm` : ''}
              </div>
            </div>
            <button onClick={() => setCopyModal(null)}
              className="text-white/50 hover:text-white cursor-pointer text-xl leading-none flex-shrink-0">✕</button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border flex-shrink-0">
            <input
              type="text"
              value={copySearch}
              onChange={e => setCopySearch(e.target.value)}
              placeholder="Buscar tienda o código…"
              autoFocus
              className="w-full px-3 py-1.5 border border-border rounded-lg text-[13px] text-navy focus:outline-none focus:border-navy"
            />
          </div>

          {/* Quick selectors */}
          {todayNames.length > 0 && !copySearch && (
            <div className="px-3 py-2 bg-bg border-b border-border flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span className="text-[10px] text-text-3 uppercase tracking-wide">Sel. rápida</span>
              <button
                onClick={() => {
                  const next = new Set(copyTargets);
                  todayNames.forEach(n => next.add(n));
                  setCopyTargets(next);
                }}
                className="text-[11px] font-bold text-success bg-[rgba(22,163,74,0.10)] border border-[rgba(22,163,74,0.25)] px-2 py-0.5 rounded-full cursor-pointer">
                ✓ HOY ({todayNames.length})
              </button>
              {copyTargets.size > 0 && (
                <button
                  onClick={() => setCopyTargets(new Set())}
                  className="text-[11px] font-bold text-text-3 bg-bg-2 border border-border px-2 py-0.5 rounded-full cursor-pointer">
                  Limpiar
                </button>
              )}
            </div>
          )}

          {/* Tienda list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map(name => {
              const t = TIENDAS[name];
              const checked  = copyTargets.has(name);
              const hasItems = (dispatchData[name]?.length ?? 0) > 0;
              return (
                <div key={name}
                  onClick={() => {
                    const next = new Set(copyTargets);
                    checked ? next.delete(name) : next.add(name);
                    setCopyTargets(next);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-border cursor-pointer transition-all ${
                    checked ? 'bg-[rgba(22,163,74,0.06)]' : 'bg-white hover:bg-bg'
                  }`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-all ${
                    checked ? 'bg-success border-success text-white' : 'border-border-2 bg-white'
                  }`}>
                    {checked && '✓'}
                  </div>
                  <div className="font-mono text-[10px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded flex-shrink-0">
                    {formatCod(t.cod)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-navy truncate leading-tight">{name}</div>
                    <div className="text-[10px] text-text-3">{t.region}</div>
                  </div>
                  {hasItems && (
                    <span className="text-[9px] font-bold text-success bg-[rgba(22,163,74,0.10)] border border-[rgba(22,163,74,0.20)] px-1.5 py-0.5 rounded-full flex-shrink-0">
                      HOY
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-3 py-3 border-t border-border flex-shrink-0">
            <button onClick={() => setCopyModal(null)}
              className="flex-1 py-2.5 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer">
              Cancelar
            </button>
            <button
              onClick={handleCopyConfirm}
              disabled={copyTargets.size === 0}
              className="flex-1 py-2.5 bg-success text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold cursor-pointer disabled:opacity-30 transition-all active:scale-[0.98]"
              style={{ boxShadow: copyTargets.size > 0 ? '0 4px 14px rgba(22,163,74,0.35)' : 'none' }}>
              {copyTargets.size > 0
                ? `Copiar a ${copyTargets.size} tienda${copyTargets.size > 1 ? 's' : ''}`
                : 'Selecciona destinos'}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  if (panel) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden border-l-2 border-border">
        {/* Panel header */}
        <div className="bg-navy px-3 py-2 flex-shrink-0 flex items-center gap-2">
          <span className="font-barlow-condensed text-[13px] font-bold text-white/70 uppercase tracking-widest flex-1">Resumen del día</span>
          {names.length > 0 && (() => {
            const totalItems = names.reduce((a, n) => a + (dispatchData[n]?.length ?? 0), 0);
            const totalSel   = names.reduce((a, n) => a + (selection[n]?.size ?? 0), 0);
            const allSelected = totalItems > 0 && totalSel === totalItems;
            return (
              <button
                onClick={() => dispatch({ type: 'SELECT_ALL_GLOBAL', selectAll: !allSelected })}
                className="font-barlow-condensed text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white/90 cursor-pointer transition-colors"
                title="Seleccionar/Quitar todas las tiendas para exportar">
                {allSelected ? '✓ Quitar todo' : '☐ Seleccionar todo'}
              </button>
            );
          })()}
          {names.length > 0 && (
            <button
              onClick={() => setExpanded(expanded.size === names.length ? new Set() : new Set(names))}
              className="font-barlow-condensed text-[11px] font-bold uppercase tracking-wider text-white/50 hover:text-white/90 cursor-pointer transition-colors">
              {expanded.size === names.length ? '▲ Colapsar' : '▼ Ver todo'}
            </button>
          )}
        </div>
        {statsStrip}
        <div className="flex-1 overflow-y-auto">
          {acordeon}
        </div>
        {actionBar}
        {combineModalEl}
        {copyModalEl}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      {statsStrip}
      {acordeon}
      {actionBar}
      {combineModalEl}
      {copyModalEl}
    </div>
  );
}
