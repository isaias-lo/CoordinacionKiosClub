'use client';

// Cuerpo de la tarjeta de un encargado en teléfono y handheld (diseño «Picking, propuesta
// empresarial», Teléfono). Solo presentación: las reglas (confirmar al bajar, confirmar la
// reimpresión, esperar a Odoo) vienen armadas desde PickerGroupCard, igual que en PanelDetalle.
// El detalle completo (nombre, batch, peso, vista previa) se abre tocando el nombre.

import React from 'react';
import { AlertTriangle, Printer } from 'lucide-react';
import type { PanelDetalleProps } from './PanelDetalle';
import { mensajeReimpresion } from '../reimpresion';
import { fmtHoraChile } from '@/lib/fechaChile';

export function CuerpoTelefono(p: PanelDetalleProps) {
  const { group, palletsByTipo, lastPrint } = p;
  const n = p.assignedNums.length;
  const hechas = group.operations.filter(o => o.state === 'done').length;

  return (
    <>
      {p.otroDia && (
        <div className="pk-aviso warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>La fecha del documento origen no coincide con hoy: verifica antes de trabajarlo.</span>
        </div>
      )}

      {p.unidadesVisibles.map(({ tipo, label }) => {
        const count = palletsByTipo[tipo] ?? 0;
        return (
          <div key={tipo} className="pk-tel-cont">
            <span className="l">{label}</span>
            <button type="button" className="menos" onClick={() => p.bajar(tipo)} aria-label={`Quitar ${label}`}>−</button>
            <span className={`n${count === 0 ? ' z' : ''}`} aria-live="polite">{count}</span>
            <button type="button" className="mas" onClick={() => p.onTipoPalletsChange(tipo, count + 1)} aria-label={`Agregar ${label}`}>+</button>
          </div>
        );
      })}

      {p.pendingDecrementTipo && (
        <div className="pk-aviso bad pk-tel-conf" role="alertdialog" aria-label="Confirmar eliminación">
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

      {n === 0 && p.avisoOtraSeccion && (
        <div className="pk-aviso info pk-tel-conf">
          <span style={{ flex: 1 }}>{p.avisoOtraSeccion.texto}</span>
          <button type="button" className="pk-btn pri" onClick={p.avisoOtraSeccion.onIr}>{p.avisoOtraSeccion.boton}</button>
        </div>
      )}

      {p.isPrinted && lastPrint?.printed_by_name && lastPrint.printed_by_name !== p.myName && (
        <div className="pk-aviso warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Impreso por <b>{lastPrint.printed_by_name}</b> · {fmtHoraChile(lastPrint.printed_at)}</span>
        </div>
      )}

      {p.confirmarReimpresion && (
        <div className="pk-aviso warn pk-tel-conf" role="alertdialog" aria-label="Confirmar reimpresión">
          <AlertTriangle size={16} aria-hidden="true" />
          <span style={{ flex: 1, minWidth: 180 }}>
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

      <div className="pk-tel-pie">
        {!p.sinBloqueoOdoo ? (
          <span className="pk-pill warn">{hechas} de {group.operations.length} en Odoo</span>
        ) : n > 0 ? (
          <span className="pk-pill info">{n} etiqueta{n !== 1 ? 's' : ''}</span>
        ) : (
          <span className="pk-pill mute">Falta contar</span>
        )}
        {(lastPrint?.print_count ?? 0) > 1 && (
          <span className="pk-pill warn" title="Veces que se imprimió esta etiqueta">×{lastPrint!.print_count}</span>
        )}
        <span className="pk-sp" />
        <button type="button" className="pk-btn pri" disabled={!p.sinBloqueoOdoo || n === 0}
          onClick={() => p.pedirImpresion('todas')}>
          {p.isPrinted ? 'Reimprimir' : 'Imprimir'}
        </button>
      </div>
    </>
  );
}
