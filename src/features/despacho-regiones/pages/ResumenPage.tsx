import { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { buildRows, exportToTemplate } from '../utils/exportUtils';
import { TIENDAS } from '../data/tiendas';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../types';

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

export function ResumenPage() {
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

  const exportAll = () => {
    const rows = buildRows(dispatchData, selection);
    if (!rows.length) { showToast('No hay items seleccionados para exportar', '#D97706'); return; }
    exportToTemplate(rows, `despacho_seleccionados_${date}.xlsx`);
    showToast(`✓ Excel exportado (${rows.length} items)`, '#16A34A');
  };

  const exportTiendaSel = (name: string) => {
    const sel = selection[name];
    if (!sel || sel.size === 0) { showToast('No hay items seleccionados', '#D97706'); return; }
    const rows = buildRows({ [name]: dispatchData[name] }, { [name]: sel });
    if (!rows.length) return;
    const safe = name.replace(/[^a-zA-Z0-9]/g, '_');
    exportToTemplate(rows, `${safe}_${date}.xlsx`);
    showToast(`✓ ${rows.length} items · ${name.split(' ')[0]}`, '#16A34A');
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

  if (!names.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center pb-24 text-text-3">
        <div className="text-4xl mb-3 opacity-40">📋</div>
        <p className="text-sm opacity-60 font-barlow-condensed uppercase tracking-wide">No hay items agregados aún</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20">

      {/* ── Stats strip ── */}
      <div className="bg-navy flex items-center px-3 py-2.5 gap-0">
        <div className="flex-1 flex items-baseline gap-1.5 justify-center border-r border-white/10">
          <span className="font-barlow-condensed text-[28px] font-extrabold text-[#93C5FD] leading-none">{stats.pallets}</span>
          <span className="text-[11px] text-white/50 uppercase tracking-wide">Pallets</span>
        </div>
        <div className="flex-1 flex items-baseline gap-1.5 justify-center border-r border-white/10">
          <span className="font-barlow-condensed text-[28px] font-extrabold text-[#FCD34D] leading-none">{stats.bultos}</span>
          <span className="text-[11px] text-white/50 uppercase tracking-wide">Bultos</span>
        </div>
        <div className="flex-1 flex items-baseline gap-1.5 justify-center border-r border-white/10">
          <span className="font-barlow-condensed text-[28px] font-extrabold text-[#86EFAC] leading-none">{names.length}</span>
          <span className="text-[11px] text-white/50 uppercase tracking-wide">Tiendas</span>
        </div>
        {stats.monto > 0 && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <span className="font-barlow-condensed text-[15px] font-bold text-white/90 leading-none">
              ${Math.round(stats.monto / 1000)}K
            </span>
            <span className="text-[10px] text-white/40 uppercase tracking-wide mt-0.5">Total</span>
          </div>
        )}
      </div>

      {/* ── Tiendas accordion ── */}
      {names.map(name => {
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

            {/* ── Row header ── */}
            <div
              onClick={() => { cancelEdit(); setExpanded(isOpen ? null : name); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all active:bg-bg ${
                isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'
              } ${sel.size > 0 ? 'border-l-4 border-l-success' : ''}`}>

              <div className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded min-w-[46px] text-center flex-shrink-0">
                {t?.cod}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-navy truncate leading-tight">{name}</div>
                <div className="text-[11px] text-text-3 truncate">{t?.region}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {pallets > 0 && (
                  <span className="font-barlow-condensed text-[13px] font-bold text-info bg-[rgba(37,99,235,0.10)] border border-[rgba(37,99,235,0.20)] px-2 py-0.5 rounded-full">
                    {pallets}P
                  </span>
                )}
                {bultos > 0 && (
                  <span className="font-barlow-condensed text-[13px] font-bold text-warn bg-[rgba(217,119,6,0.10)] border border-[rgba(217,119,6,0.20)] px-2 py-0.5 rounded-full">
                    {bultos}B
                  </span>
                )}
                {sel.size > 0 && (
                  <span className="font-mono text-[11px] text-success font-bold">✓{sel.size}</span>
                )}
                <span className="text-text-3 text-[11px] ml-0.5">{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* ── Expanded panel ── */}
            {isOpen && (
              <div>
                {/* Select all + peso/monto */}
                <div className="flex items-center gap-2 px-3 py-2 bg-bg border-b border-border">
                  <div
                    onClick={() => dispatch({ type: 'TOGGLE_ALL_SELECTION', tienda: name, count: items.length })}
                    className={`flex items-center gap-1.5 cursor-pointer flex-shrink-0 px-2 py-1 rounded-btn transition-all ${
                      allSel ? 'bg-[rgba(22,163,74,0.12)]' : 'bg-white border border-border'
                    }`}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all ${
                      allSel ? 'bg-success border-success text-white' : 'border-border-2 bg-white'
                    }`}>
                      {allSel && '✓'}
                    </div>
                    <span className="text-[12px] font-semibold text-text-2">{allSel ? 'Quitar todo' : 'Todo'}</span>
                    <span className="font-mono text-[11px] text-text-3">{sel.size}/{items.length}</span>
                  </div>
                  <div className="flex-1 font-mono text-[11px] text-text-3 text-right">
                    {pesoT.toLocaleString('es-CL')} kg{valorT > 0 ? ` · $${valorT.toLocaleString('es-CL')}` : ''}
                  </div>
                </div>

                {/* Items */}
                {items.map((item, idx) => {
                  const isSel = sel.has(idx);
                  const dims  = [item.alto, item.ancho, item.largo].filter(Boolean);
                  const isEditing = editingItem?.tienda === name && editingItem?.idx === idx;

                  if (isEditing) {
                    return (
                      <div key={idx} className="border-l-4 border-info bg-[rgba(37,99,235,0.04)] border-b border-border/40">
                        <div className="px-3 pt-2.5 pb-2.5">

                          {/* Pkg + Tipo toggles */}
                          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2.5">
                            <div>
                              <div className={LABEL_SM}>Tipo paquete</div>
                              <div className="flex gap-1.5">
                                {(['pallet', 'box'] as TipoPaquete[]).map(p => (
                                  <button key={p} onClick={() => setEditPkg(p)}
                                    className={`font-barlow-condensed text-[12px] font-bold px-3 py-1 rounded-full border transition-all ${
                                      editPkg === p ? 'bg-info text-white border-info' : 'bg-white text-text-2 border-border'
                                    }`}>
                                    {LABEL[p]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className={LABEL_SM}>Contenido</div>
                              <div className="flex gap-1.5">
                                {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(tp => (
                                  <button key={tp} onClick={() => setEditTipo(tp)}
                                    className={`font-barlow-condensed text-[12px] font-bold px-3 py-1 rounded-full border transition-all ${
                                      editTipo === tp ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'
                                    }`}>
                                    {LABEL[tp]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Dimensions — 4-col grid */}
                          <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                            {([
                              { label: 'Peso kg',  val: editPeso,  set: setEditPeso,  step: 0.1 },
                              { label: 'Alto cm',  val: editAlto,  set: setEditAlto,  step: 1   },
                              { label: 'Ancho cm', val: editAncho, set: setEditAncho, step: 1   },
                              { label: 'Largo cm', val: editLargo, set: setEditLargo, step: 1   },
                            ] as { label: string; val: string; set: (v: string) => void; step: number }[]).map(({ label, val, set, step }) => (
                              <div key={label}>
                                <div className={LABEL_SM}>{label}</div>
                                <input type="number" value={val} onChange={e => set(e.target.value)}
                                  className={INPUT} step={step} />
                              </div>
                            ))}
                          </div>

                          {/* Guia + Valor — 2-col grid */}
                          <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                            <div>
                              <div className={LABEL_SM}>Guía</div>
                              <input type="text" value={editGuia} onChange={e => setEditGuia(e.target.value)}
                                className={INPUT} />
                            </div>
                            <div>
                              <div className={LABEL_SM}>Valor $</div>
                              <input type="number" value={editValor} onChange={e => setEditValor(e.target.value)}
                                className={INPUT} />
                            </div>
                          </div>

                          {/* Save / Cancel */}
                          <div className="flex gap-2">
                            <button onClick={saveEdit}
                              className="flex-1 py-2 bg-info text-white border-none rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer active:opacity-80">
                              ✓ Guardar
                            </button>
                            <button onClick={cancelEdit}
                              className="px-4 py-2 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[14px] cursor-pointer active:bg-bg-3">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={idx}
                      onClick={() => dispatch({ type: 'TOGGLE_SELECTION', tienda: name, idx })}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-b-0 transition-all ${
                        isSel ? 'bg-[rgba(22,163,74,0.06)]' : 'bg-white active:bg-bg'
                      }`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
                        isSel ? 'bg-success border-success text-white' : 'border-border-2 bg-white'
                      }`}>
                        {isSel && '✓'}
                      </div>
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed uppercase flex-shrink-0 ${TAG[item.pkg]}`}>
                        {item.orden}
                      </span>
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed uppercase flex-shrink-0 ${TAG[item.tipo]}`}>
                        {LABEL[item.tipo]}
                      </span>
                      <div className="flex-1 font-mono text-[11px] text-text-3 truncate">
                        {item.peso}kg
                        {dims.length ? ' · ' + dims.join('×') + 'cm' : ''}
                        {item.guia ? ' · #' + item.guia : ''}
                        {item.valor ? ' · $' + item.valor.toLocaleString('es-CL') : ''}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(name, idx); }}
                        className="text-text-3 border border-border bg-bg-2 px-2 py-1 rounded-btn text-[13px] cursor-pointer hover:text-info hover:border-info/50 flex-shrink-0 transition-all">
                        ✎
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          dispatch({ type: 'DELETE_ITEM', tienda: name, idx });
                          showToast(`${item.orden} eliminado`, '#D97706');
                        }}
                        className="text-text-3 border border-border bg-bg-2 px-2 py-1 rounded-btn text-[13px] cursor-pointer hover:text-red hover:border-red/50 flex-shrink-0 transition-all">
                        ✕
                      </button>
                    </div>
                  );
                })}

                {/* Export row */}
                <div className="px-3 py-2 bg-bg">
                  <button
                    onClick={() => exportTiendaSel(name)}
                    disabled={sel.size === 0}
                    className="w-full py-2.5 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold tracking-wide cursor-pointer transition-all active:bg-navy-dark disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ boxShadow: sel.size > 0 ? '0 2px 10px rgba(26,37,80,0.22)' : 'none' }}>
                    ↓ Exportar {sel.size > 0 ? `${sel.size} item${sel.size > 1 ? 's' : ''}` : 'seleccionados'} · {t?.cod}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border px-3 py-2.5 z-[150] flex gap-2"
           style={{ boxShadow: '0 -4px 16px rgba(26,37,80,0.10)' }}>
        <button
          onClick={() => {
            if (confirm(`¿Borrar todos los ${stats.pallets + stats.bultos} items del día?`)) {
              dispatch({ type: 'CLEAR_ALL' });
              showToast('Todo limpiado', '#8896A8');
            }
          }}
          className="w-12 flex items-center justify-center py-3 bg-bg-2 text-text-2 border border-border rounded-card text-base cursor-pointer active:bg-bg-3">
          🗑
        </button>
        <button onClick={exportAll}
          className="flex-1 py-3 bg-red text-white border-none rounded-card font-barlow-condensed text-[18px] font-bold tracking-wide cursor-pointer transition-all active:bg-red-dark"
          style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.30)' }}>
          ↓ Exportar todo
        </button>
      </div>

    </div>
  );
}
