'use client';

import React, { useCallback } from 'react';
import { EncabezadoTienda } from './EncabezadoTienda';
import { TablaEncargados, type FilaSeco } from './TablaEncargados';
import { PanelEncargado } from './PanelEncargado';

type PropsEncabezado = React.ComponentProps<typeof EncabezadoTienda>;

interface Props {
  encabezado: PropsEncabezado;
  /** Operaciones sin responsable en Odoo: solo el aviso de arriba, nunca una fila. */
  sinAsignar: { texto: string; detalle: string; onActualizar: () => void } | null;
  otroDia: number;
  formManual: React.ReactNode;
  cargando: boolean;
  filas: FilaSeco[];
  opsConEncargado: { con: number; total: number };
  abierta: string | null;
  onAbrir: (stateKey: string | null) => void;
  imprimirTodas: { tiendas: number; etiquetas: number; onClick: () => void } | null;
  actualizadoA: string | null;
}

/** Seco en escritorio: encabezado de la tienda, avisos, tabla de encargados y su panel lateral. */
export function VistaSeco(p: Props) {
  const i = p.filas.findIndex(f => f.group.stateKey === p.abierta);
  const fila = i >= 0 ? p.filas[i] : null;
  const { onAbrir } = p;
  const cerrar = useCallback(() => onAbrir(null), [onAbrir]);
  const nombre = p.encabezado.nombre;

  return (
    <div className="pk-main">
      <EncabezadoTienda {...p.encabezado} />
      <div className="pk-content">
        {p.formManual && <div className="pk-card">{p.formManual}</div>}
        {p.sinAsignar && (
          <div className="pk-alert print:hidden" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A3271A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></svg>
            <span><b>{p.sinAsignar.texto}</b> {p.sinAsignar.detalle}</span>
            <span className="pk-sp" />
            <button type="button" className="pk-btn" onClick={p.sinAsignar.onActualizar}>Actualizar</button>
          </div>
        )}
        {p.otroDia > 0 && (
          <div className="pk-alert warn print:hidden" role="status">
            <span><b>{p.otroDia} movimiento{p.otroDia !== 1 ? 's' : ''} con fecha de origen distinta a hoy.</b> Revísa{p.otroDia !== 1 ? 'los' : 'lo'} antes de trabajar{p.otroDia !== 1 ? 'los' : 'lo'}.</span>
          </div>
        )}
        {p.cargando && p.filas.length === 0 ? (
          <div className="pk-vacio"><span>Cargando operaciones de Odoo…</span></div>
        ) : p.filas.length === 0 ? (
          <div className="pk-vacio"><b>Sin operaciones de Abastecimiento en esta sección hoy</b><span>Si alguien trabajó sin quedar en Odoo, usa «Encargado manual».</span></div>
        ) : (
          <TablaEncargados filas={p.filas} nombreTienda={nombre} opsConEncargado={p.opsConEncargado}
            abierta={p.abierta} onAbrir={k => onAbrir(k)} />
        )}
        <div className="pk-pie-nota print:hidden">
          <span>— no aplica a esa sección (Aseo y Hogar no llevan chocolate; Chocolates no lleva bultos)</span>
          <span className="pk-sp" />
          {p.actualizadoA && <span>Odoo actualizado a las {p.actualizadoA}</span>}
          <span>Toca una fila para ver el detalle y la vista previa de etiquetas</span>
        </div>
        {p.imprimirTodas && (
          <div className="print:hidden" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="pk-btn" onClick={p.imprimirTodas.onClick}>
              Imprimir las {p.imprimirTodas.tiendas} tiendas · {p.imprimirTodas.etiquetas} etiquetas
            </button>
          </div>
        )}
      </div>
      {fila && (
        <PanelEncargado fila={fila} nombreTienda={nombre} onCerrar={cerrar}
          onAnterior={i > 0 ? () => onAbrir(p.filas[i - 1].group.stateKey) : undefined}
          onSiguiente={i < p.filas.length - 1 ? () => onAbrir(p.filas[i + 1].group.stateKey) : undefined} />
      )}
    </div>
  );
}
