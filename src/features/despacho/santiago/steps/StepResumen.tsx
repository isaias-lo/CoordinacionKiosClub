'use client';
import { useState } from 'react';
import { useSantiago, SANTIAGO_TERMINADO_KEY } from '../context/SantiagoContext';
import { pushSessionState } from '@/lib/userSessionState';
import { useAuth } from '@/components/AuthProvider';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import { useApp } from '../../../../context/AppContext';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import type { TipoCargamento, ContenidoSantiago, EstadoItem, SantiagoItem } from '../types';

const todayKey = new Date().toISOString().split('T')[0];
const SANTIAGO_STATE_KEY = `santiagoState_${todayKey}`;

const ESTADOS: EstadoItem[] = [
  'Listo para despachar',
  'Despachado',
  'Carga recibida',
  'Carga No recibida por tienda',
];

const INPUT = 'w-full border border-border rounded-btn px-2 py-2 text-[13px] font-mono text-navy bg-white';
const LABEL_SM = 'text-[9px] text-text-3 mb-0.5 uppercase tracking-wide';

export function StepResumen() {
  const { state, dispatch } = useSantiago();
  const { user } = useAuth();
  const { showToast } = useApp();
  const { items, regimen } = state;
  const [expanded, setExpanded] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<{ cod: string; idx: number } | null>(null);
  const [editTipo,      setEditTipo]      = useState<TipoCargamento>('Pallet');
  const [editContenido, setEditContenido] = useState<ContenidoSantiago>('Comida');
  const [editEstado,    setEditEstado]    = useState<EstadoItem>('Listo para despachar');
  const [editPeso,  setEditPeso]  = useState('');
  const [editAlto,  setEditAlto]  = useState('');
  const [editLargo, setEditLargo] = useState('');
  const [editAncho, setEditAncho] = useState('');

  const activeTiendas = Object.entries(items).filter(([, it]) => it.length > 0);

  let totalPallets = 0, totalBultos = 0;
  activeTiendas.forEach(([, it]) => {
    totalPallets += it.filter(i => i.tipo === 'Pallet').length;
    totalBultos  += it.filter(i => i.tipo === 'Bulto').length;
  });

  const buildSummaryString = () =>
    activeTiendas.map(([cod, it]) => {
      const p = it.filter(i => i.tipo === 'Pallet').length;
      const b = it.filter(i => i.tipo === 'Bulto').length;
      return `${cod}: ${[p > 0 ? `${p}P` : '', b > 0 ? `${b}B` : ''].filter(Boolean).join('+')}`;
    }).join(', ');

  const doReset = async () => {
    dispatch({ type: 'RESET' });
    // Push empty state immediately — don't rely on debounce (cancelled on navigation)
    const emptyPayload = { step: 'regimen' as const, regimen: null, items: {} };
    try {
      await pushSessionState('santiago', emptyPayload, user?.id ?? undefined);
      localStorage.setItem(SANTIAGO_STATE_KEY, JSON.stringify(emptyPayload));
    } catch {}
    localStorage.setItem(SANTIAGO_TERMINADO_KEY,
      new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
  };

  const registrar = () => {
    if (!activeTiendas.length) { showToast('No hay items para registrar', '#D97706'); return; }
    sheetsSantiagoWrite(items, regimen!);
    showToast(`✓ Registrado · ${buildSummaryString()}`, '#16A34A');
  };

  const startEdit = (cod: string, idx: number) => {
    const item = (items[cod] || [])[idx];
    if (!item) return;
    setEditTipo(item.tipo);
    setEditContenido(item.contenido);
    setEditEstado(item.estado);
    setEditPeso(String(item.peso));
    setEditAlto(String(item.alto));
    setEditLargo(String(item.largo));
    setEditAncho(String(item.ancho));
    setEditingItem({ cod, idx });
    setExpanded(cod);
  };

  const cancelEdit = () => setEditingItem(null);

  const saveEdit = () => {
    if (!editingItem) return;
    const { cod, idx } = editingItem;
    const item = (items[cod] || [])[idx];
    const alto  = parseInt(editAlto)  || 0;
    const largo = editTipo === 'Bulto' ? (parseInt(editLargo) || 0) : item.largo;
    const ancho = editTipo === 'Bulto' ? (parseInt(editAncho) || 0) : item.ancho;
    const updated: SantiagoItem = {
      ...item,
      tipo:            editTipo,
      contenido:       editContenido,
      estado:          editEstado,
      peso:            parseFloat(editPeso) || 0,
      alto,
      largo,
      ancho,
      pesoVolumetrico: (alto * largo * ancho) / 6000,
    };
    dispatch({ type: 'EDIT_ITEM', tiendaCod: cod, idx, item: updated });
    setEditingItem(null);
    showToast('✓ Item actualizado', '#16A34A');
  };

  return (
    <div className="flex-1 overflow-y-auto pb-28">

      {/* Stats strip */}
      <div className="bg-navy flex items-center">
        {[
          { v: totalPallets, l: 'Pallets', color: '#93C5FD' },
          { v: totalBultos,  l: 'Bultos',  color: '#FCD34D' },
          { v: activeTiendas.length, l: 'Tiendas', color: '#86EFAC' },
        ].map(({ v, l, color }, i) => (
          <div key={l} className={`flex-1 py-3 text-center ${i < 2 ? 'border-r border-white/10' : ''}`}>
            <div className="font-barlow-condensed text-[30px] font-extrabold leading-none" style={{ color }}>{v}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wide mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Step header */}
      <div className="px-3 py-2.5 bg-white border-b border-border">
        <div className="font-barlow-condensed text-[10px] uppercase tracking-widest text-text-3">Paso 3 de 3</div>
        <div className="font-barlow-condensed text-[20px] font-bold text-navy leading-tight">
          Resumen — <span className="text-info">{regimen}</span>
        </div>
      </div>

      {/* Summary string */}
      {activeTiendas.length > 0 && (
        <div className="mx-3 mt-3 bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.25)] rounded-xl px-3 py-2.5">
          <div className="font-barlow-condensed text-[10px] uppercase tracking-widest text-success mb-1">Resumen despacho</div>
          <div className="font-barlow-condensed text-[15px] font-bold text-navy leading-snug">{buildSummaryString()}</div>
        </div>
      )}

      {/* Accordion per tienda */}
      {activeTiendas.length === 0 ? (
        <div className="py-16 text-center text-text-3">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-[13px] opacity-60">No hay items registrados</p>
        </div>
      ) : (
        <div className="mt-2">
          {activeTiendas.map(([cod, it]) => {
            const t         = getTiendaSantiagoByCod(cod);
            const pallets   = it.filter(i => i.tipo === 'Pallet').length;
            const bultos    = it.filter(i => i.tipo === 'Bulto').length;
            const isOpen    = expanded === cod;
            const totalPeso = it.reduce((s, i) => s + i.peso, 0);

            return (
              <div key={cod} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>

                {/* Header row */}
                <div
                  onClick={() => { cancelEdit(); setExpanded(isOpen ? null : cod); }}
                  className={`flex items-center gap-2.5 px-3 py-3 cursor-pointer transition-all active:bg-bg ${isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'}`}>
                  <div className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded min-w-[42px] text-center flex-shrink-0">
                    {cod}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold text-navy truncate leading-tight">{t?.tienda || cod}</div>
                    <div className="text-[11px] text-text-3 truncate">{t?.comuna} · {t?.ventanaHoraria}</div>
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
                    <span className="text-text-3 text-[12px] ml-0.5">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded items */}
                {isOpen && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-bg border-b border-border">
                      <div className="font-mono text-[11px] text-text-3 flex-1">
                        {it.length} item{it.length > 1 ? 's' : ''} · {totalPeso.toLocaleString('es-CL')} kg
                      </div>
                    </div>

                    {it.map((item, idx) => {
                      const isEditing = editingItem?.cod === cod && editingItem?.idx === idx;

                      if (isEditing) {
                        return (
                          <div key={item.id} className="border-l-4 border-info bg-[rgba(37,99,235,0.04)] border-b border-border/40">
                            <div className="px-3 pt-3 pb-3">

                              {/* Tipo toggle */}
                              <div className="mb-3">
                                <div className={LABEL_SM}>Tipo</div>
                                <div className="flex gap-2 mt-1">
                                  {(['Pallet', 'Bulto'] as TipoCargamento[]).map(tp => (
                                    <button key={tp} onClick={() => setEditTipo(tp)}
                                      className={`flex-1 font-barlow-condensed text-[14px] font-bold py-2 rounded-full border transition-all ${
                                        editTipo === tp
                                          ? tp === 'Pallet' ? 'bg-info text-white border-info' : 'bg-warn text-white border-warn'
                                          : 'bg-white text-text-2 border-border'
                                      }`}>
                                      {tp}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Contenido toggle */}
                              <div className="mb-3">
                                <div className={LABEL_SM}>Contenido</div>
                                <div className="grid grid-cols-2 gap-1.5 mt-1">
                                  {(['Comida', 'Hogar', 'Mixto', 'Chocolate'] as ContenidoSantiago[]).map(c => (
                                    <button key={c} onClick={() => setEditContenido(c)}
                                      className={`font-barlow-condensed text-[13px] font-bold py-2 rounded-full border transition-all ${
                                        editContenido === c ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'
                                      }`}>
                                      {c}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Estado select */}
                              <div className="mb-3">
                                <div className={LABEL_SM}>Estado</div>
                                <select value={editEstado}
                                  onChange={e => setEditEstado(e.target.value as EstadoItem)}
                                  className="w-full border border-border rounded-btn px-2 py-2.5 text-[13px] text-navy bg-white mt-0.5">
                                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                              </div>

                              {/* Dimensions */}
                              <div className={`grid gap-2 mb-3 ${editTipo === 'Bulto' ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                <div>
                                  <div className={LABEL_SM}>Peso kg</div>
                                  <input type="number" value={editPeso} onChange={e => setEditPeso(e.target.value)}
                                    className={INPUT} step="0.1" />
                                </div>
                                <div>
                                  <div className={LABEL_SM}>Alto cm</div>
                                  <input type="number" value={editAlto} onChange={e => setEditAlto(e.target.value)}
                                    className={INPUT} />
                                </div>
                                {editTipo === 'Bulto' && (
                                  <>
                                    <div>
                                      <div className={LABEL_SM}>Largo cm</div>
                                      <input type="number" value={editLargo} onChange={e => setEditLargo(e.target.value)}
                                        className={INPUT} />
                                    </div>
                                    <div>
                                      <div className={LABEL_SM}>Ancho cm</div>
                                      <input type="number" value={editAncho} onChange={e => setEditAncho(e.target.value)}
                                        className={INPUT} />
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Save / Cancel */}
                              <div className="flex gap-2">
                                <button onClick={saveEdit}
                                  className="flex-1 py-3 bg-info text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold cursor-pointer active:opacity-80">
                                  ✓ Guardar
                                </button>
                                <button onClick={cancelEdit}
                                  className="px-5 py-3 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[15px] cursor-pointer active:bg-bg-3">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={item.id}
                          className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-b-0 bg-white">
                          <span className={`font-barlow-condensed text-[13px] font-bold min-w-[32px] ${item.tipo === 'Pallet' ? 'text-info' : 'text-warn'}`}>
                            {item.orden}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full font-barlow-condensed ${item.tipo === 'Pallet' ? 'text-info bg-[rgba(37,99,235,0.10)]' : 'text-warn bg-[rgba(217,119,6,0.10)]'}`}>
                                {item.tipo}
                              </span>
                              <span className="text-[12px] font-semibold text-text-2">{item.contenido}</span>
                              <span className="text-[12px] font-bold text-navy">{item.peso}kg</span>
                            </div>
                            <div className="text-[11px] text-text-3 mt-0.5 truncate">
                              {item.alto}cm
                              {item.tipo === 'Bulto' ? ` · ${item.largo}×${item.ancho}cm` : ' · 120×100cm'}
                              {' · '}{item.estado.split(' ').slice(0, 2).join(' ')}
                            </div>
                          </div>
                          <button
                            onClick={() => startEdit(cod, idx)}
                            className="border border-border text-text-3 bg-bg-2 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] active:text-info flex-shrink-0">
                            ✎
                          </button>
                          <button
                            onClick={() => {
                              dispatch({ type: 'DELETE_ITEM', tiendaCod: cod, idx });
                              showToast(`${item.orden} eliminado`, '#D97706');
                            }}
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
          })}
        </div>
      )}

      {/* Bottom actions bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border px-3 py-2.5 z-[150] flex gap-2"
           style={{ boxShadow: '0 -4px 16px rgba(26,37,80,0.10)' }}>
        <button
          onClick={doReset}
          className="w-12 flex items-center justify-center py-3.5 bg-bg-2 text-text-2 border border-border rounded-card text-[18px] cursor-pointer active:bg-bg-3"
          title="Nuevo despacho">
          🗑
        </button>
        <button
          onClick={registrar}
          disabled={activeTiendas.length === 0}
          className="flex-1 py-3.5 bg-red text-white border-none rounded-card font-barlow-condensed text-[18px] font-bold tracking-wide cursor-pointer disabled:opacity-30 transition-all active:bg-red-dark"
          style={{ boxShadow: activeTiendas.length > 0 ? '0 4px 16px rgba(211,47,47,0.30)' : 'none' }}>
          ↑ Registrar despacho
        </button>
        <button
          onClick={() => {
            if (confirm('¿Iniciar nuevo despacho? Los datos actuales se perderán.')) {
              doReset();
            }
          }}
          className="w-12 flex items-center justify-center py-3.5 bg-bg-2 text-text-2 border border-border rounded-card text-[18px] cursor-pointer active:bg-bg-3"
          title="Nuevo despacho">
          🗑
        </button>
      </div>
    </div>
  );
}
