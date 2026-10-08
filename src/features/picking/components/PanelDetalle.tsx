'use client';

// Detalle de un encargado en el panel lateral de Seco (diseño «Picking, propuesta empresarial»,
// SecoDetalle). Es solo presentación: el estado y las reglas viven en PickerGroupCard, que arma
// este panel con lo que ya calculó, así la tarjeta y el panel nunca se separan.

import React from 'react';
import { Printer, RotateCcw, AlertTriangle } from 'lucide-react';
import { BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import type { PickerGroup, PickingOperation, PalletSlot, PickerType, PrintRecord } from '../picking-types';
import type { ClaveUnidad } from '../tiposUnidad';
import { pesoTotalValido, avisoCantidad, type TipoCaja, type PesoTotalGuardado } from '../pesoTotal';
import { mensajeReimpresion } from '../reimpresion';
import { STATE_INFO, buildCanonicalId, todayISO } from '../picking-utils';
import { fmtHoraChile } from '@/lib/fechaChile';

const TONO_ESTADO: Record<string, string> = { done: 'ok', cancel: 'bad', draft: 'mute' };

export interface PanelDetalleProps {
  group: PickerGroup;
  displayName: string;
  palletsByTipo: Record<string, number>;
  onNameChange: (v: string) => void;
  onTipoPalletsChange: (clave: ClaveUnidad, n: number) => void;
  onRefreshOp: (op: PickingOperation) => void;
  refreshingId: number | null;
  assignedNums: number[];
  isPrinted: boolean;
  slots: PalletSlot[];
  lastPrint?: PrintRecord;
  myName?: string;
  otroDia?: boolean;
  batchValue?: string;
  onBatchChange?: (raw: string) => void;
  pesoTotal?: Partial<Record<TipoCaja, { raw: string; guardado: PesoTotalGuardado | null }>>;
  onPesoTotalChange?: (tipo: TipoCaja, raw: string) => void;
  avisoOtraSeccion?: { texto: string; boton: string; onIr: () => void } | null;
  notaUnidades?: string | null;
  pie?: React.ReactNode;
  totalPickers: number;
  adelanto?: { fecha_despacho: string | null };
  sinBloqueoOdoo: boolean;
  allCategories: string[];
  refs: string;
  cats: string;
  pickerLabel: string;
  barcodePickerName: string;
  unidadesVisibles: { tipo: ClaveUnidad; sigla: string; label: string }[];
  bajar: (tipo: ClaveUnidad) => void;
  selectedIndices: Set<number>;
  toggleIndex: (i: number) => void;
  setSelectedIndices: (s: Set<number>) => void;
  pendingDecrementTipo: ClaveUnidad | null;
  setPendingDecrementTipo: (t: ClaveUnidad | null) => void;
  confirmarReimpresion: null | 'todas' | 'seleccion';
  setConfirmarReimpresion: (c: null | 'todas' | 'seleccion') => void;
  yaImpresosDe: (cual: 'todas' | 'seleccion') => number[];
  pedirImpresion: (cual: 'todas' | 'seleccion') => void;
  onPrint: () => void;
  handlePrintSelected: () => void;
}

export function PanelDetalle(p: PanelDetalleProps) {
  const { group, palletsByTipo, assignedNums, slots, selectedIndices, lastPrint } = p;
  const batchDeOdoo = [...new Set(group.operations.map(o => o.batch).filter(Boolean))].join(' · ');
  const n = assignedNums.length;

  return (
    <>
      <div className="pk-pd-b">
        {p.otroDia && (
          <div className="pk-aviso warn">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>La fecha del documento origen no coincide con hoy: verifica antes de trabajarlo.</span>
          </div>
        )}

        {group.operations.length > 0 && (
          <div className="pk-col6">
            <span className="pk-lbl">OPERACIONES EN ODOO</span>
            <div className="pk-card">
              <table className="pk-tabla">
                <tbody>
                  {group.operations.map(op => (
                    <tr key={op.id}>
                      <td className="pk-mono">{op.name}</td>
                      <td>
                        {[op.categories.join(' · '), op.lineCount > 0 ? `${op.lineCount} línea${op.lineCount !== 1 ? 's' : ''}` : '']
                          .filter(Boolean).join(' · ')}
                        {op.origin && <div className="pk-sub pk-trunc" title={op.origin}>{op.origin}</div>}
                      </td>
                      <td className="nw"><span className={`pk-pill ${TONO_ESTADO[op.state] ?? 'warn'}`}>{STATE_INFO[op.state]?.label ?? op.state}</span></td>
                      <td className="pk-mono pk-sub">{op.batch ?? ''}</td>
                      <td style={{ width: 1 }}>
                        {op.state !== 'done' && (
                          <button type="button" className="pk-btn" style={{ padding: '5px 7px' }}
                            onClick={() => p.onRefreshOp(op)} disabled={p.refreshingId === op.id}
                            aria-label={`Actualizar ${op.name} desde Odoo`} title="Actualizar desde Odoo">
                            <RotateCcw size={13} className={p.refreshingId === op.id ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="pk-pd-campos">
          <label className="pk-col5">
            <span className="pk-lbl2">Nombre en la etiqueta</span>
            <span className="pk-field">
              <input type="text" value={p.displayName} onChange={e => p.onNameChange(e.target.value)}
                placeholder={group.key} />
              {!p.displayName && <span className="pk-pill mute">de Odoo</span>}
            </span>
          </label>
          <label className="pk-col5">
            <span className="pk-lbl2">Batch</span>
            {batchDeOdoo ? (
              <span className="pk-field pk-mono" title="Transferir Agrupación (Odoo)">{batchDeOdoo}</span>
            ) : p.onBatchChange ? (
              <span className="pk-field">
                <input type="text" inputMode="numeric" value={p.batchValue ?? ''}
                  onChange={e => p.onBatchChange!(e.target.value)} placeholder="Opcional" />
              </span>
            ) : (
              <span className="pk-field" style={{ color: '#8A91A1' }}>—</span>
            )}
          </label>
        </div>
        {!p.displayName && (
          <span className="pk-sub" style={{ marginTop: -8 }}>Si no escribes un nombre, la etiqueta lleva «{group.key}».</span>
        )}
        {!batchDeOdoo && p.batchValue && (
          <span className="pk-sub" style={{ marginTop: -8 }}>Se imprimirá como <span className="pk-mono">BATCH/{p.batchValue}</span></span>
        )}

        {p.onPesoTotalChange && (['CH', 'CC', 'CN'] as TipoCaja[]).filter(t => (palletsByTipo[t] ?? 0) > 0).map(t => {
          const cajas = palletsByTipo[t] ?? 0;
          const st = p.pesoTotal?.[t];
          const raw = st?.raw ?? '';
          const v = raw.trim() ? pesoTotalValido(raw, cajas, t) : null;
          const aviso = avisoCantidad(st?.guardado ?? null, cajas);
          const nombre = t === 'CH' ? 'de chocolate' : t === 'CC' ? 'cartón' : 'negras';
          const titulo = cajas === 1 ? `Peso de la caja ${t === 'CH' ? 'de chocolate' : t === 'CC' ? 'cartón' : 'negra'}` : `Peso total de las ${cajas} cajas ${nombre}`;
          return (
            <label key={t} className="pk-col5">
              <span className="pk-lbl2">{titulo} <span className="pk-sub">(kg, opcional)</span></span>
              <span className="pk-field" style={{ borderColor: v && !v.ok ? '#A3271A' : aviso ? '#B45309' : undefined }}>
                <input type="text" inputMode="decimal" value={raw} aria-label={titulo}
                  onChange={e => p.onPesoTotalChange!(t, e.target.value)}
                  placeholder={cajas === 1 ? 'kg' : 'Todas juntas en la balanza'} />
              </span>
              {v && !v.ok ? (
                <span className="pk-sub" style={{ color: '#A3271A' }}>{v.error}</span>
              ) : aviso ? (
                <span className="pk-sub" style={{ color: '#8A4A06' }}>{aviso}</span>
              ) : (
                <span className="pk-sub">
                  {v?.ok
                    ? (cajas === 1 ? 'Se aplica a esta caja.' : `Se reparte entre las ${cajas}: ${String(v.porCaja).replace('.', ',')} kg por caja.`)
                    : t === 'CH' ? 'Opcional: si no lo pesas acá, se pesa en Bodega.'
                      : 'Pesa todas las cajas juntas y escribe el total: se reparte entre ellas.'}
                </span>
              )}
            </label>
          );
        })}

        <div className="pk-col8">
          <span className="pk-lbl">UNIDADES A DESPACHAR</span>
          {p.unidadesVisibles.map(({ tipo, sigla, label }) => {
            const count = palletsByTipo[tipo] ?? 0;
            return (
              <div key={tipo} className="pk-contador">
                <span className="pk-col1">
                  <span style={{ fontWeight: 700 }}>{label}</span>
                  <span className="pk-sub">{sigla}</span>
                </span>
                <button type="button" className="menos" onClick={() => p.bajar(tipo)} aria-label={`Quitar ${label}`}>−</button>
                <span className={`n${count === 0 ? ' z' : ''}`} aria-live="polite">{count}</span>
                <button type="button" className="mas" onClick={() => p.onTipoPalletsChange(tipo, count + 1)} aria-label={`Agregar ${label}`}>+</button>
              </div>
            );
          })}
          {p.notaUnidades && <span className="pk-sub">{p.notaUnidades}</span>}

          {p.pendingDecrementTipo && (
            <div className="pk-aviso bad" role="alertdialog" aria-label="Confirmar eliminación">
              <AlertTriangle size={16} aria-hidden="true" />
              <span style={{ flex: 1 }}>
                {p.isPrinted ? 'Este pallet ya fue impreso. ¿Eliminar igual?' : 'Es el último de este tipo: se elimina por completo. ¿Eliminar igual?'}
              </span>
              <button type="button" className="pk-btn" onClick={() => p.setPendingDecrementTipo(null)}>Cancelar</button>
              <button type="button" className="pk-btn peligro" onClick={() => {
                const t = p.pendingDecrementTipo!;
                p.onTipoPalletsChange(t, Math.max(0, (palletsByTipo[t] ?? 0) - 1));
                p.setPendingDecrementTipo(null);
              }}>Eliminar</button>
            </div>
          )}

          {p.isPrinted && lastPrint?.printed_by_name && lastPrint.printed_by_name !== p.myName && (
            <div className="pk-aviso warn">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>Impreso por <b>{lastPrint.printed_by_name}</b> · {fmtHoraChile(lastPrint.printed_at)}</span>
            </div>
          )}
        </div>

        <div className="pk-col8">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="pk-lbl">VISTA PREVIA · {n} ETIQUETA{n !== 1 ? 'S' : ''}</span>
            {selectedIndices.size > 0 && (
              <span className="pk-sub" style={{ color: '#1F3FA8' }}>{selectedIndices.size} seleccionada{selectedIndices.size !== 1 ? 's' : ''}</span>
            )}
            <span className="pk-sp" />
            {(lastPrint?.print_count ?? 0) > 1 && (
              <span className="pk-pill warn" title="Veces que se imprimió esta etiqueta">Reimpreso ×{lastPrint!.print_count}</span>
            )}
          </div>

          {!p.sinBloqueoOdoo ? (
            <div className="pk-vacio">
              <b>{group.operations.filter(o => o.state === 'done').length} de {group.operations.length} operaciones realizadas en Odoo</b>
              <span>Se puede imprimir cuando estén todas realizadas.</span>
            </div>
          ) : n === 0 && p.avisoOtraSeccion ? (
            <div className="pk-vacio info">
              <b>{p.avisoOtraSeccion.texto}</b>
              <span>Acá no se cuenta, para no sumarlo dos veces.</span>
              <button type="button" className="pk-btn pri" onClick={p.avisoOtraSeccion.onIr}>{p.avisoOtraSeccion.boton}</button>
            </div>
          ) : n === 0 ? (
            <div className="pk-vacio"><span>Cuenta unidades para generar las etiquetas.</span></div>
          ) : (
            <>
              {p.confirmarReimpresion && (
                <div className="pk-aviso warn" role="alertdialog" aria-label="Confirmar reimpresión" style={{ flexWrap: 'wrap' }}>
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 200 }}>
                    {mensajeReimpresion({
                      ids: p.yaImpresosDe(p.confirmarReimpresion),
                      hora: lastPrint?.printed_at ? fmtHoraChile(lastPrint.printed_at) : null,
                      por: lastPrint?.printed_by_name ?? null,
                    })}
                  </span>
                  <button type="button" className="pk-btn" onClick={() => p.setConfirmarReimpresion(null)}>Cancelar</button>
                  <button type="button" className="pk-btn copia" onClick={() => {
                    const cual = p.confirmarReimpresion;
                    p.setConfirmarReimpresion(null);
                    if (cual === 'todas') p.onPrint(); else p.handlePrintSelected();
                  }}><Printer size={13} /> Imprimir copia</button>
                </div>
              )}
              <div className="pk-preview">
                {assignedNums.map((pNum, i) => {
                  const sel = selectedIndices.has(i);
                  const slot = slots[i];
                  const slotTipo = (slot?.tipo as PickerType | undefined) ?? 'P';
                  const tipoTotal = slots.filter(sl => ((sl.tipo as PickerType | undefined) ?? 'P') === slotTipo).length;
                  return (
                    <div key={slot?.id ?? i} role="button" tabIndex={0} onClick={() => p.toggleIndex(i)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.toggleIndex(i); } }}
                      aria-pressed={sel} aria-label={`Etiqueta ${slotTipo}-${pNum}${sel ? ', seleccionada' : ''}`}
                      className={`pk-prev${sel ? ' sel' : ''}`}>
                      <BarcodeCard
                        value={`${group.storeCod};${p.barcodePickerName};${p.refs};${slotTipo}${pNum};${p.cats}`}
                        palletNum={pNum} total={tipoTotal}
                        storeCod={group.storeCod} pickerLabel={p.pickerLabel}
                        responsibleKey={group.key} allCategories={p.allCategories}
                        totalPickers={p.totalPickers} tipo={slotTipo}
                        slotId={slot?.id}
                        canonicalId={buildCanonicalId(slotTipo, pNum, group.storeCod, todayISO())}
                        adelanto={!!p.adelanto} adelantoFecha={p.adelanto?.fecha_despacho ?? null}
                        compact
                      />
                    </div>
                  );
                })}
              </div>
              <span className="pk-sub">Toca una etiqueta para imprimir solo esa.</span>
            </>
          )}
        </div>
      </div>

      <div className="pk-pd-pie">
        <span className="pk-sub pk-pie-hint">Se guardan solas al cambiar</span>
        {p.pie}
        {selectedIndices.size > 0 && (
          <>
            <button type="button" className="pk-btn" onClick={() => p.setSelectedIndices(new Set())}>Limpiar</button>
            <button type="button" className="pk-btn pri" onClick={() => p.pedirImpresion('seleccion')}>
              Imprimir {selectedIndices.size === 1 ? '1 seleccionada' : `${selectedIndices.size} seleccionadas`}
            </button>
          </>
        )}
        {/* Con algo seleccionado, este botón imprime TODAS, y lo dice. */}
        <button type="button" className={`pk-btn${selectedIndices.size > 0 ? '' : ' pri'}`}
          disabled={!p.sinBloqueoOdoo || n === 0}
          onClick={() => p.pedirImpresion('todas')}>
          {selectedIndices.size > 0 ? `Todas (${n})`
            : p.isPrinted ? `Reimprimir ${n} etiqueta${n !== 1 ? 's' : ''}`
              : `Imprimir ${n} etiqueta${n !== 1 ? 's' : ''}`}
        </button>
      </div>
    </>
  );
}
