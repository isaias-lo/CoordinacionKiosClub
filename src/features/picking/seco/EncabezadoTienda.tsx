'use client';

import React from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';

export interface Kpis {
  opsHechas: number; opsTotal: number; encargados: number;
  unidades: number; detalleUnidades: string; sinImprimir: number;
}

export interface TabSeccion { key: string; label: string; color?: string; cuenta: number }

interface Props {
  cod: string;
  nombre: string;
  tipo?: { label: string } | null;
  /** Las tiendas elegidas, para pasar de una a otra. Con una sola no se muestra. */
  tiendas: { cod: string; nombre: string }[];
  onElegirTienda: (cod: string) => void;
  onManual: () => void;
  onActualizar: () => void;
  actualizando: boolean;
  actualizadoA?: string | null;
  imprimir: { n: number; armado: boolean; onClick: () => void } | null;
  kpis: Kpis;
  secciones: TabSeccion[];
  seccion: string;
  onSeccion: (key: string) => void;
}

/** Encabezado de la tienda: nombre, acciones, 4 indicadores y las secciones con su conteo. */
export function EncabezadoTienda(p: Props) {
  const k = p.kpis;
  return (
    <div className="pk-head print:hidden">
      <div className="pk-hrow">
        <span className="pk-code">{p.cod}</span>
        <span className="pk-h1">{p.nombre}</span>
        {p.tipo?.label && p.tipo.label !== 'Otro' && <span className="pk-pill mute">{p.tipo.label.replace(' Center', '')}</span>}
        {p.tiendas.length > 1 && (
          <span className="pk-seg" role="tablist" aria-label="Tienda" style={{ marginLeft: 8 }}>
            {p.tiendas.map(t => (
              <button key={t.cod} type="button" role="tab" aria-selected={t.cod === p.cod}
                className={t.cod === p.cod ? 'on' : ''} onClick={() => p.onElegirTienda(t.cod)} title={t.cod}>
                {t.nombre}
              </button>
            ))}
          </span>
        )}
        <span className="pk-acciones">
        <button type="button" className="pk-btn ico" onClick={p.onManual}><UserPlus size={14} aria-hidden="true" />Encargado manual</button>
        <button type="button" className="pk-btn ico" onClick={p.onActualizar} disabled={p.actualizando}
          title={p.actualizadoA ? `Actualizado a las ${p.actualizadoA}` : undefined}>
          <RefreshCw size={14} className={p.actualizando ? 'animate-spin' : ''} aria-hidden="true" />
          {p.actualizando ? 'Actualizando…' : 'Actualizar desde Odoo'}
        </button>
        {p.imprimir && (
          // Dos toques: el primero arma, el segundo imprime (igual que antes en la tienda).
          <button type="button" className={`pk-btn ${p.imprimir.armado ? 'armado' : 'pri'}`} onClick={p.imprimir.onClick}>
            {p.imprimir.armado ? '¿Confirmar impresión?' : `Imprimir ${p.imprimir.n} etiqueta${p.imprimir.n !== 1 ? 's' : ''}`}
          </button>
        )}
        </span>
      </div>
      <div className="pk-kpis">
        <div className="pk-kpi"><span className="l">Operaciones realizadas</span><span className="v">{k.opsHechas} <small>de {k.opsTotal}</small></span></div>
        <div className="pk-kpi"><span className="l">Encargados</span><span className="v">{k.encargados}</span></div>
        <div className="pk-kpi"><span className="l">Unidades contadas</span><span className="v">{k.unidades} {k.detalleUnidades && <small>{k.detalleUnidades}</small>}</span></div>
        <div className="pk-kpi"><span className="l">Etiquetas sin imprimir</span><span className="v" style={k.sinImprimir > 0 ? { color: '#2B4BC8' } : undefined}>{k.sinImprimir}</span></div>
      </div>
      <div className="pk-tabs" role="tablist" aria-label="Sección">
        {p.secciones.map(s => (
          <button key={s.key} type="button" role="tab" aria-selected={p.seccion === s.key}
            className={`pk-tab${p.seccion === s.key ? ' on' : ''}`} onClick={() => p.onSeccion(s.key)}>
            {s.color && <span className="sw" style={{ background: s.color }} aria-hidden="true" />}
            {s.label} <span className="k">{s.cuenta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
