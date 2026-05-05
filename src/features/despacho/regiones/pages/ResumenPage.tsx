'use client';

import { useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { buildRows, exportToTemplate } from '../utils/exportUtils';
import { TIENDAS } from '../data/tiendas';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';

const TAG: Record<string, string> = {
  comida:        'bg-[rgba(217,119,6,0.15)] text-warn',
  hogar:         'bg-[rgba(124,58,237,0.15)] text-hogar',
  'comida-hogar':'bg-[rgba(8,145,178,0.15)] text-mixto',
  pallet:        'bg-[rgba(37,99,235,0.15)] text-info',
  box:           'bg-[rgba(217,119,6,0.15)] text-warn',
};
const LABEL: Record<TipoContenido | TipoPaquete, string> = {
  comida: 'Comida', hogar: 'Hogar', 'comida-hogar': 'Mixto', pallet: 'Pallet', box: 'Bulto',
};

function renumber(list: DispatchItem[]): DispatchItem[] {
  let pc = 1, bc = 1;
  return list.map(it => ({ ...it, orden: it.pkg === 'pallet' ? `pallet${pc++}` : `bulto${bc++}` }));
}

const INPUT = 'w-full border border-border rounded-btn px-2 py-1.5 text-[13px] font-mono text-navy bg-white';
const LABEL_SM = 'text-[9px] text-text-3 mb-0.5 uppercase tracking-wide';

interface ResumenPageProps {
  panel?: boolean;
}

export function ResumenPage({ panel = false }: ResumenPageProps) {
  const { state, dispatch, showToast } = useApp();
  const { dispatch: dispatchData, selection } = state;
  const [expanded, setExpanded] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<{ tienda: string; idx: number } | null>(null);
  const [editPkg,   setEditPkg]   = useState<TipoPaquete>('pallet');
  const [editTipo,  setEditTipo]  = useState<TipoContenido>('comida');
  const [editPeso,  setEditPeso]  = useState('');
  const [editAlto,  setEditAlto]  = useState('');
  const [editAncho, setEditAncho] = useState('');
  const [editLargo, setEditLargo] = useState('');
  const [editGuia,  setEditGuia]  = useState('');
  const [editValor, setEditValor] = useState('');

  const names = Object.keys(dispatchData).filter(n => dispatchData[n].length > 0);
  const stats = names.reduce((a, n) => {
    (dispatchData[n] || []).forEach(i => {
      i.pkg === 'pallet' ? a.pallets++ : a.bultos++;
      a.monto += i.valor || 0;
    });
    return a;
  }, { pallets: 0, bultos: 0, monto: 0 });

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
    setExpanded(tienda);
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

  /* ── Bottom action bar ── */
  const actionBar = (
    <div className={`bg-white border-t border-border px-3 py-2.5 flex gap-2 flex-shrink-0 ${
      panel ? '' : 'fixed bottom-0 left-0 right-0 z-[150]'
    }`}
      style={{ boxShadow: '0 -4px 16px rgba(26,37,80,0.10)' }}>
      <button
        onClick={() => {
          if (confirm(`¿Borrar todos los ${stats.pallets + stats.bultos} items del día?`)) {
            dispatch({ type: 'CLEAR_ALL' });
            showToast('Todo limpiado', '#8896A8');
          }
        }}
        className="w-10 flex items-center justify-center py-2.5 bg-bg-2 text-text-2 border border-border rounded-card text-sm cursor-pointer active:bg-bg-3">
        🗑
      </button>
      <button onClick={exportAll}
        className="flex-1 py-2.5 bg-red text-white border-none rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide cursor-pointer transition-all active:bg-red-dark"
        style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.30)' }}>
        ↓ Exportar todo
      </button>
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
        const isOpen = expanded === name;
        let pesoT = 0, valorT = 0;
        items.forEach(i => { pesoT += i.peso; valorT += i.valor || 0; });
        const pallets = items.filter(i => i.pkg === 'pallet').length;
        const bultos  = items.filter(i => i.pkg === 'box').length;

        return (
          <div key={name} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>

            {/* Row header */}
            <div
              onClick={() => { cancelEdit(); setExpanded(isOpen ? null : name); }}
              className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-all active:bg-bg ${
                isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'
              } ${sel.size > 0 ? 'border-l-4 border-l-success' : ''}`}>

              <div className="font-mono text-[10px] text-text-3 bg-bg-2 border border-border-2 px-1 py-0.5 rounded min-w-[40px] text-center flex-shrink-0">
                {t?.cod}
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
                                {(['pallet', 'box'] as TipoPaquete[]).map(p => (
                                  <button key={p} onClick={() => setEditPkg(p)}
                                    className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                                      editPkg === p ? 'bg-info text-white border-info' : 'bg-white text-text-2 border-border'
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
                              { label: 'Alto', val: editAlto,  set: setEditAlto  },
                              { label: 'Ancho', val: editAncho, set: setEditAncho },
                              { label: 'Largo', val: editLargo, set: setEditLargo },
                            ] as { label: string; val: string; set: (v: string) => void }[]).map(({ label, val, set }) => (
                              <div key={label}>
                                <div className={LABEL_SM}>{label}</div>
                                <input type="number" value={val} onChange={e => set(e.target.value)} className={INPUT} />
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

                  return (
                    <div key={idx}
                      onClick={() => dispatch({ type: 'TOGGLE_SELECTION', tienda: name, idx })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer border-b border-border/40 last:border-b-0 transition-all ${
                        isSel ? 'bg-[rgba(22,163,74,0.06)]' : 'bg-white active:bg-bg'
                      }`}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[9px] font-bold flex-shrink-0 transition-all ${
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
                        className="text-text-3 border border-border bg-bg-2 px-1.5 py-0.5 rounded text-[11px] cursor-pointer hover:text-info flex-shrink-0">
                        ✎
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          dispatch({ type: 'DELETE_ITEM', tienda: name, idx });
                          showToast(`${item.orden} eliminado`, '#D97706');
                        }}
                        className="text-text-3 border border-border bg-bg-2 px-1.5 py-0.5 rounded text-[11px] cursor-pointer hover:text-red flex-shrink-0">
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
                    ↓ {sel.size > 0 ? `${sel.size} item${sel.size > 1 ? 's' : ''}` : 'seleccionados'} · {t?.cod}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  if (panel) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden border-l-2 border-border">
        {/* Panel header */}
        <div className="bg-navy px-3 py-2 flex-shrink-0 flex items-center">
          <span className="font-barlow-condensed text-[13px] font-bold text-white/70 uppercase tracking-widest">Resumen del día</span>
        </div>
        {statsStrip}
        <div className="flex-1 overflow-y-auto">
          {acordeon}
        </div>
        {actionBar}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      {statsStrip}
      {acordeon}
      {actionBar}
    </div>
  );
}
