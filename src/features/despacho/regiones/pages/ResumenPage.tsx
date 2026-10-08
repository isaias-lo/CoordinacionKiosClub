'use client';

import { useState, useRef, type ReactNode } from 'react';
import { claseNacional } from '../../shared/numeroCard';
import { finalizarSlotUnion } from '@/features/despacho/shared/finalizarSlotUnion';
import { logActividad } from '@/lib/actividad';
import { useAuth } from '@/components/AuthProvider';
import { TraerOdooButton } from '@/features/despacho/shared/TraerOdooButton';
import { fechaChile } from '@/lib/fechaChile';
import { renumerarSoloSinOrden } from '@/features/despacho/shared/numeroCard';
import { leerPeso, limpiarTecleo } from '@/features/despacho/shared/pesoIngresado';
import { combinarEnLista } from '@/features/despacho/shared/combinarEnLista';
import { Check, Download } from 'lucide-react';
import { useApp } from '../../../../context/AppContext';
import { buildRows, exportToTemplate } from '../utils/exportUtils';
import { TIENDAS, getTodayTiendas } from '../data/tiendas';
import { formatCod } from '../../rutas/utils/helpers';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { REGIONES_TERMINADO_KEY } from '@/components/modals/FinishModal';
import type { TipoContenido, TipoPaquete, DispatchItem } from '../../../../types';
import { MAX_ALTO_CM, excedeAltoMax } from '../../shared/palletLimits';
import { eliminarSlotPicking } from '../../shared/eliminarSlotPicking';
import { formatCLPCorto } from '../../shared/formatoCLP';
import { excedeTopeDuro } from '../../shared/pesoIngresado';
import { claseUnidad } from '../../shared/unidadVisual';
import { confirmarCambioGuardado } from '../../shared/confirmarGuardado';
import { textoPesoConTara } from '../../shared/pesoDelPallet';
import { copiaParaOtraTienda, formatoMedidas, posicionDeUnidad, totalesResumen } from '../../shared/resumenDia';
import { AvisoResumenTerminada, BotonHerramienta, CabeceraResumen, FilaResumenTienda, ResumenVacio, UnidadResumen } from '../../shared/ResumenDiaUI';

const NOMBRE_PLURAL: Partial<Record<TipoPaquete, string>> = {
  pallet: 'Pallets', box: 'Bultos', contenedor: 'Contenedores', chocolate: 'Chocolates',
};
const LABEL: Record<TipoContenido | TipoPaquete, string> = {
  comida: 'Comida', hogar: 'Hogar', 'comida-hogar': 'Mixto', pallet: 'Pallet', box: 'Bulto', contenedor: 'Contenedor', chocolate: 'Chocolate',
  adquisicion: 'Adquisición', 'web-retiro': 'Web / retiro',
};

// El renumerado del Resumen ya no es propio: era la TERCERA copia del mismo bloque posicional, y
// aplastaba el número de los chocolates igual que lo hacía el reducer. Como el reducer dejó de
// renumerar en UPDATE_ITEMS, esta copia era la única que actuaba: combinar o editar un ítem acá
// bastaba para que el CH3 volviera a llamarse CH1.
const renumber = renumerarSoloSinOrden;

const INPUT = 'w-full min-h-[44px] bg-card border-[1.5px] border-border rounded-btn px-2 text-cuerpo font-barlow tabular-nums text-text outline-none focus:border-navy';
const LABEL_SM = 'text-rotulo font-bold text-text-sub uppercase mb-1';
/** El paquete elegido al editar, en el color de su tipo. */
const ESTILO_EDIT: Partial<Record<TipoPaquete, string>> = {
  pallet: 'bg-uni-pallet text-white border-uni-pallet',
  box: 'bg-uni-bulto text-white border-uni-bulto',
  contenedor: 'bg-uni-contenedor text-white border-uni-contenedor',
};

interface ResumenPageProps {
  panel?: boolean;
  /** Abre el FinishModal de registro (el botón "Registrar" vive ahora en esta barra, no en el header). */
  onRegistrar?: () => void;
  /** ¿La tienda (por código) está marcada terminada? Sus unidades no se pueden tocar desde acá. */
  terminada?: (cod: string) => boolean;
  /** Tiendas de hoy terminadas, sobre las de hoy: la barra de la cabecera. */
  avance?: { listas: number; total: number };
  /** En el teléfono: volver a la lista y lo que va a la derecha (Enrutador). */
  volver?: ReactNode;
  extra?: ReactNode;
  /** Lo que falta cerrar del día (tiendas sin terminar, sin pesar). Se avisa antes de registrar. */
  avisoRegistrar?: string | null;
}

export function ResumenPage({ panel = false, onRegistrar, terminada = () => false, avance, volver, extra, avisoRegistrar }: ResumenPageProps) {
  const { state, dispatch, showToast } = useApp();
  const { profile } = useAuth();
  const { dispatch: dispatchData, selection } = state;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // Se edita por `id`: la posición puede cambiar si otro equipo agrega o borra mientras tanto.
  const [editingItem, setEditingItem] = useState<{ tienda: string; idx: number; id?: string } | null>(null);

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
  // La misma cuenta que la lista de tiendas (`contarPorClase`): antes todo lo que no era pallet
  // ni chocolate sumaba como bulto, contenedores y adquisiciones incluidos.
  const totales = totalesResumen(names.flatMap(n => dispatchData[n] || []), i => claseNacional(i.pkg));

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
    setEditingItem({ tienda, idx, id: item.id });
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
    // `...src` conserva el `pickingSlotId`, y `combinarEnLista` lo deja en la posición del primero
    // de los dos — la misma regla que usan los dos formularios, en un solo sitio.
    const merged: DispatchItem = { ...src, peso, alto, tipo: tipoMerge, guia, valor };
    dispatch({ type: 'UPDATE_ITEMS', tienda, items: renumber(combinarEnLista(list, srcIdx, tgtIdx, merged)) });
    // La unidad absorbida deja de existir: su slot de picking también. Este flujo era el único de
    // los tres que no lo borraba, así que dejaba un slot huérfano que nadie volvía a mirar.
    if (src.pickingSlotId && tgt.pickingSlotId && src.pickingSlotId !== tgt.pickingSlotId) {
      void finalizarSlotUnion(src.pickingSlotId, tgt.pickingSlotId).then(r => {
        if (!r.ok) showToast(`⚠ La unión quedó a medias (${r.error}) — revisá el pallet`, '#D32F2F');
      });
      // Esta pantalla no escribía NADA en la bitácora — ni un `unificar`. Combinar desde acá hacía
      // desaparecer una unidad sin dejar rastro, mientras que hacerlo desde el formulario sí lo
      // dejaba. Los dos espejos ya lo registran; faltaba este tercer camino.
      logActividad({ accion: 'unificar', fuente: 'nacional',
        tiendaCod: TIENDAS[tienda]?.cod, tiendaNombre: tienda,
        label: merged.orden, sourceLabel: tgt.orden, slotId: src.pickingSlotId });
    }
    setCombineModal(null);
    showToast('✓ Items combinados', '#16A34A');
  };

  const handleCopyConfirm = () => {
    if (!copyModal || copyTargets.size === 0) return;
    const { item } = copyModal;
    // Sin id, slot ni código: la copia es otra unidad. Con ellos, dos tiendas compartían la misma
    // y el merge entre equipos o la reconciliación con Picking pisaba una con la otra.
    const itemCopy: DispatchItem = copiaParaOtraTienda(item);
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
    const { tienda, idx: idxAntes, id } = editingItem;
    const list = [...(dispatchData[tienda] || [])];
    const idx = posicionDeUnidad(list, id, idxAntes);
    if (idx < 0) {
      showToast('⚠ Esa unidad ya no está (la cambió otro equipo). No se guardó nada.', '#D32F2F');
      setEditingItem(null);
      return;
    }
    // Las mismas guardias que la tarjeta de pesaje: sin peso no se guarda, y un peso imposible
    // (la coma que se perdió) se ataja acá y no en el cruce del día siguiente.
    const clase = claseNacional(editPkg);
    const sinPeso = clase === 'adquisicion' || clase === 'webretiro';
    const peso = sinPeso ? (leerPeso(editPeso) ?? 0) : leerPeso(editPeso);
    if (peso == null) { showToast('Ingresa el peso', '#D97706'); return; }
    const duro = excedeTopeDuro(peso, clase);
    if (duro) { showToast(`⚠ ${duro}`, '#D32F2F'); return; }
    list[idx] = {
      ...list[idx],
      pkg:   editPkg,
      tipo:  editTipo,
      peso,
      alto:  parseFloat(editAlto)  || 0,
      ancho: parseFloat(editAncho) || 0,
      largo: parseFloat(editLargo) || 0,
      guia:  editGuia,
      valor: parseInt(editValor)   || 0,
    };
    dispatch({ type: 'UPDATE_ITEMS', tienda, items: renumber(list) });
    setEditingItem(null);
    showToast('✓ Item actualizado', '#16A34A');
  };

  const totalItems  = names.reduce((a, n) => a + (dispatchData[n]?.length ?? 0), 0);
  const totalSel    = names.reduce((a, n) => a + (selection[n]?.size ?? 0), 0);
  const allSelected = totalItems > 0 && totalSel === totalItems;
  const cabecera = (
    <CabeceraResumen totales={totales} tiendas={names.length} avance={avance} volver={volver}
      herramientas={
        <>
          {/* El lado de Odoo no depende de Bodega: existe desde temprano y se puede traer sin
              esperar al registro. Solo admin. Ver `TraerOdooButton`. */}
          <TraerOdooButton rol={profile?.role} fechaISO={fechaChile()} showToast={showToast} />
          {extra}
        </>
      } />
  );
  // Seleccionar (para exportar) y desplegar: una fila de herramientas, no texto gris en la barra navy.
  const herramientas = names.length > 0 && (
    <div className="flex items-center gap-1.5 px-3 py-2 bg-bg border-b border-border flex-shrink-0">
      <BotonHerramienta activo={allSelected} title="Marcar o desmarcar todo para exportar"
        onClick={() => dispatch({ type: 'SELECT_ALL_GLOBAL', selectAll: !allSelected })}>
        {allSelected ? '✓ Todo marcado' : 'Marcar todo'}
      </BotonHerramienta>
      <span className="text-apoyo text-text-sub tabular-nums">{totalSel}/{totalItems} para exportar</span>
      <span className="flex-1" />
      <BotonHerramienta onClick={() => setExpanded(expanded.size === names.length ? new Set() : new Set(names))}>
        {expanded.size === names.length ? 'Plegar todo' : 'Desplegar todo'}
      </BotonHerramienta>
    </div>
  );

  /* Reabrir el despacho ya registrado (mismo comportamiento que tenía el botón del header). */
  const handleReopen = () => {
    if (!confirm('¿Reabrir el despacho del día?')) return;
    try { localStorage.removeItem(REGIONES_TERMINADO_KEY); } catch {}
    dispatch({ type: 'SET_REGISTRADO', payload: false });
    showToast('Despacho reabierto', '#8896A8');
  };

  /* ── Pie: Exportar + Registrar ── */
  const actionBar = (
    <div className={`bg-card border-t border-border px-3 py-2.5 flex gap-2 flex-shrink-0 items-center ${
      panel ? '' : 'fixed bottom-0 left-0 right-0 z-[150]'
    }`}>
      <button type="button" onClick={exportAll} disabled={totalSel === 0}
        title={totalSel === 0 ? 'Marca unidades para exportar' : `Exportar ${totalSel} a Excel`}
        className="min-h-[44px] px-4 bg-bg-2 text-text-2 rounded-btn text-apoyo font-bold cursor-pointer active:bg-bg-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
        <Download size={16} aria-hidden="true" /> Exportar{totalSel > 0 ? ` (${totalSel})` : ''}
      </button>
      <span className="flex-1" />
      {state.registrado ? (
        <button type="button" onClick={handleReopen} title="Registrado · toca para reabrir"
          className="min-h-[44px] px-5 bg-est-ok text-white rounded-btn text-cuerpo font-bold cursor-pointer active:opacity-80 flex items-center gap-1.5">
          <Check size={18} aria-hidden="true" /> Registrado
        </button>
      ) : (
        <button type="button" disabled={names.length === 0}
          onClick={() => { if (avisoRegistrar && !window.confirm(`${avisoRegistrar}\n\n¿Registrar igual?`)) return; onRegistrar?.(); }}
          className="min-h-[44px] px-5 bg-navy text-white rounded-btn text-cuerpo font-bold cursor-pointer active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed">
          Registrar despacho
        </button>
      )}
    </div>
  );

  /* ── Una fila por tienda; tocarla despliega sus unidades ── */
  const acordeon = (
    <>
      {!names.length ? <ResumenVacio /> : names.map(name => {
        const t = TIENDAS[name];
        const items = dispatchData[name] || [];
        const sel   = selection[name] || new Set<number>();
        const allSel = sel.size === items.length;
        const isOpen = expanded.has(name);
        const cerrada = !!t?.cod && terminada(t.cod);
        const tot = totalesResumen(items, i => claseNacional(i.pkg));

        return (
          <FilaResumenTienda key={name} cod={t?.cod ? formatCod(t.cod) : ''} nombre={name} sub={t?.region}
            totales={tot} terminada={cerrada} abierta={isOpen}
            seleccion={{ n: sel.size, total: items.length }}
            onToggle={() => { cancelEdit(); toggleExpanded(name); }}>
            {cerrada && <AvisoResumenTerminada />}
            <div className="flex items-center gap-1.5 px-3.5 py-2 bg-bg">
              <BotonHerramienta activo={allSel} onClick={() => dispatch({ type: 'TOGGLE_ALL_SELECTION', tienda: name, count: items.length })}>
                {allSel ? '✓ Todas' : 'Marcar todas'}
              </BotonHerramienta>
              <span className="flex-1" />
              <button type="button" onClick={() => exportTiendaSel(name)} disabled={sel.size === 0}
                className="min-h-[36px] px-2.5 rounded-btn bg-navy text-white text-apoyo font-bold cursor-pointer active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
                <Download size={14} aria-hidden="true" /> Exportar {sel.size > 0 ? sel.size : ''}
              </button>
            </div>

            {items.map((item, idx) => {
              const isSel = sel.has(idx);
              const isEditing = editingItem?.tienda === name && (editingItem.id ? editingItem.id === item.id : editingItem.idx === idx);

              if (isEditing) {
                return (
                  <div key={item.id ?? idx} className="border-t border-border/60 bg-navy/[0.04] shadow-[inset_4px_0_0_theme(colors.navy.DEFAULT)] px-3.5 py-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mb-2.5">
                      <div>
                        <div className={LABEL_SM}>Paquete</div>
                        <div className="flex gap-1">
                          {/* Contenedor solo si ya lo era: ya no se usa, pero uno existente no puede quedar sin su botón. */}
                          {(['pallet', 'box', ...(item.pkg === 'contenedor' ? ['contenedor'] : [])] as TipoPaquete[]).map(p => (
                            <button key={p} type="button" onClick={() => setEditPkg(p)}
                              className={`min-h-[36px] px-2.5 rounded-btn border-[1.5px] text-apoyo font-bold cursor-pointer ${
                                editPkg === p ? `${ESTILO_EDIT[p]}` : 'bg-card text-text-2 border-border'}`}>
                              {LABEL[p]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className={LABEL_SM}>Contenido</div>
                        <div className="flex gap-1">
                          {(['comida', 'hogar', 'comida-hogar'] as TipoContenido[]).map(tp => (
                            <button key={tp} type="button" onClick={() => setEditTipo(tp)}
                              className={`min-h-[36px] px-2.5 rounded-btn border-[1.5px] text-apoyo font-bold cursor-pointer ${
                                editTipo === tp ? 'bg-navy text-white border-navy' : 'bg-card text-text-2 border-border'}`}>
                              {LABEL[tp]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                      {([
                        { label: 'Peso kg', val: editPeso,  set: setEditPeso, decimal: true },
                        { label: 'Alto cm', val: editAlto,  set: setEditAlto, max: editPkg === 'pallet' ? MAX_ALTO_CM : undefined },
                        { label: 'Ancho cm', val: editAncho, set: setEditAncho },
                        { label: 'Largo cm', val: editLargo, set: setEditLargo },
                      ] as { label: string; val: string; set: (v: string) => void; max?: number; decimal?: boolean }[]).map(({ label, val, set, max, decimal }) => (
                        <div key={label}>
                          <div className={LABEL_SM}>{label}</div>
                          <input type={decimal ? 'text' : 'number'} inputMode="decimal" value={val}
                            onChange={e => set(decimal ? limpiarTecleo(e.target.value) : e.target.value)}
                            max={decimal ? undefined : max} className={INPUT} />
                          {label.startsWith('Alto') && editPkg === 'pallet' && excedeAltoMax(parseFloat(val) || 0) && (
                            <div className="text-rotulo text-est-aviso">⚠ máx {MAX_ALTO_CM}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                      <div>
                        <div className={LABEL_SM}>Guía</div>
                        <input type="text" value={editGuia} onChange={e => setEditGuia(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <div className={LABEL_SM}>Valor $</div>
                        <input type="number" inputMode="numeric" value={editValor} onChange={e => setEditValor(e.target.value)} className={INPUT} />
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={saveEdit}
                        className="flex-1 min-h-[44px] bg-navy text-white rounded-btn text-cuerpo font-bold cursor-pointer active:opacity-80">
                        Guardar
                      </button>
                      <button type="button" onClick={cancelEdit}
                        className="min-h-[44px] px-4 bg-bg-2 text-text-2 rounded-btn text-cuerpo font-bold cursor-pointer active:bg-bg-3">
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              }

              const isDragging = dragIdx === idx && dragTienda === name;
              const isDropTarget = dropIdx === idx && dragTienda === name && dragIdx !== null && items[dragIdx]?.pkg === item.pkg;
              const clase = claseUnidad(item.pkg);
              const sinPeso = clase === 'agregado';
              const detalle = [
                LABEL[item.tipo],
                sinPeso ? '' : formatoMedidas(item.alto, item.ancho, item.largo),
                item.guia ? `guía ${item.guia}` : '',
                item.valor ? formatCLPCorto(item.valor) : '',
              ].filter(Boolean).join(' · ');
              // Arrastrar una unidad sobre otra del mismo tipo las combina. En una tienda terminada no.
              const arrastre = cerrada ? {} : {
                draggable: true,
                onDragStart: () => { setDragIdx(idx); setDragTienda(name); },
                onDragOver: (e: React.DragEvent) => {
                  if (dragIdx !== null && dragTienda === name && dragIdx !== idx && items[dragIdx]?.pkg === item.pkg)
                    { e.preventDefault(); setDropIdx(idx); }
                },
                onDragLeave: () => setDropIdx(prev => prev === idx ? null : prev),
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (dragIdx !== null && dragTienda === name && dragIdx !== idx && items[dragIdx]?.pkg === item.pkg)
                    setCombineModal({ srcIdx: dragIdx, tgtIdx: idx, tienda: name });
                  setDragIdx(null); setDropIdx(null); setDragTienda(null);
                },
                onDragEnd: () => { setDragIdx(null); setDropIdx(null); setDragTienda(null); },
                onTouchStart: (e: React.TouchEvent) => {
                  const t = e.touches[0];
                  (e.currentTarget as HTMLElement).dataset.txS = String(t.clientX);
                  (e.currentTarget as HTMLElement).dataset.tyS = String(t.clientY);
                  longPressRef.current = setTimeout(() => { setDragIdx(idx); setDragTienda(name); navigator.vibrate?.(25); }, 220);
                },
                onTouchMove: (e: React.TouchEvent) => {
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
                },
                onTouchEnd: (e: React.TouchEvent) => {
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
                },
              };
              return (
                <UnidadResumen key={item.id ?? idx}
                  data-item-idx={idx} data-item-tienda={name}
                  {...arrastre}
                  className={cerrada ? '' : dragIdx !== null && dragTienda === name ? 'cursor-grabbing' : 'cursor-grab'}
                  clase={clase} etiqueta={item.orden || LABEL[item.pkg]}
                  peso={sinPeso ? LABEL[item.pkg] : textoPesoConTara(item.peso, item.taraPallet)}
                  detalle={detalle}
                  seleccion={{ activa: isSel, onToggle: () => dispatch({ type: 'TOGGLE_SELECTION', tienda: name, idx }) }}
                  bloqueada={cerrada} resaltada={isDropTarget} apagada={isDragging}
                  onEditar={() => { if (confirmarCambioGuardado('editar', item.orden)) startEdit(name, idx); }}
                  onCopiar={() => { setCopyModal({ tienda: name, item }); setCopyTargets(new Set()); setCopySearch(''); }}
                  onEliminar={() => {
                    if (!confirmarCambioGuardado('eliminar', item.orden)) return;
                    // Por id, no por la posición de cuando se pintó la fila: si otro equipo cambió
                    // la lista en el medio, se borraba otra unidad.
                    const pos = posicionDeUnidad(dispatchData[name] || [], item.id, idx);
                    if (pos < 0) { showToast('⚠ Esa unidad ya no está', '#D32F2F'); return; }
                    // Borra también el slot de picking_pallets: sin esto el ítem reaparecía
                    // al reconstruir el formulario (backfill lo revivía).
                    eliminarSlotPicking(item.pickingSlotId, {
                      fuente: 'nacional', tiendaCod: TIENDAS[name]?.cod, tiendaNombre: name,
                      label: item.orden,
                    });
                    dispatch({ type: 'DELETE_ITEM', tienda: name, idx: pos });
                    showToast(`${item.orden} eliminado`, '#D97706');
                  }} />
              );
            })}
          </FilaResumenTienda>
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
        pkgLabel={NOMBRE_PLURAL[src.pkg] ?? 'Bultos'}
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
      <div className="flex-1 flex flex-col overflow-hidden border-l border-border bg-bg">
        {cabecera}
        {herramientas}
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
    <div className="flex-1 overflow-y-auto pb-20 bg-bg">
      {cabecera}
      {herramientas}
      {acordeon}
      {actionBar}
      {combineModalEl}
      {copyModalEl}
    </div>
  );
}
