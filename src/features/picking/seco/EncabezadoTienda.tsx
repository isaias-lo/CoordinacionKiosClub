'use client';

import React from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';

/** Un indicador: «Operaciones realizadas 3 de 5». `destacado` lo pinta en azul (lo que falta hacer). */
export interface Kpi { etiqueta: string; valor: string | number; detalle?: string; destacado?: boolean }

export interface TabSeccion { key: string; label: string; color?: string; cuenta: number }

interface Props {
  cod: string;
  nombre: string;
  tipo?: { label: string } | null;
  /** Píldora fija junto al nombre en vez del tipo de tienda (Congelados). */
  marca?: { texto: string; fondo: string; color: string } | null;
  /** Color del borde superior del encabezado (Congelados). */
  acento?: string;
  /** Las tiendas elegidas, para pasar de una a otra. Con una sola no se muestra. */
  tiendas: { cod: string; nombre: string }[];
  onElegirTienda: (cod: string) => void;
  onManual: () => void;
  onActualizar: () => void;
  actualizando: boolean;
  actualizadoA?: string | null;
  imprimir: { n: number; armado: boolean; onClick: () => void } | null;
  kpis: Kpi[];
  /** Pestañas de sección (Seco). Sin ellas queda un espacio, como en el diseño de Congelados. */
  secciones?: TabSeccion[];
  seccion?: string;
  onSeccion?: (key: string) => void;
}

/** Encabezado de la tienda: nombre, acciones, 4 indicadores y las secciones con su conteo. */
export function EncabezadoTienda(p: Props) {
  return (
    <div className="pk-head print:hidden" style={p.acento ? { borderTop: `3px solid ${p.acento}` } : undefined}>
      <div className="pk-hrow">
        <span className="pk-code">{p.cod}</span>
        <span className="pk-h1">{p.nombre}</span>
        {p.marca
          ? <span className="pk-pill" style={{ background: p.marca.fondo, color: p.marca.color }}>{p.marca.texto}</span>
          : p.tipo?.label && p.tipo.label !== 'Otro' && <span className="pk-pill mute">{p.tipo.label.replace(' Center', '')}</span>}
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
        {p.kpis.map(k => (
          <div key={k.etiqueta} className="pk-kpi">
            <span className="l">{k.etiqueta}</span>
            <span className="v" style={k.destacado ? { color: '#2B4BC8' } : undefined}>{k.valor} {k.detalle && <small>{k.detalle}</small>}</span>
          </div>
        ))}
      </div>
      {p.secciones ? (
        <div className="pk-tabs" role="tablist" aria-label="Sección">
          {p.secciones.map(s => (
            <button key={s.key} type="button" role="tab" aria-selected={p.seccion === s.key}
              className={`pk-tab${p.seccion === s.key ? ' on' : ''}`} onClick={() => p.onSeccion?.(s.key)}>
              {s.color && <span className="sw" style={{ background: s.color }} aria-hidden="true" />}
              {s.label} <span className="k">{s.cuenta}</span>
            </button>
          ))}
        </div>
      ) : <div style={{ height: 0 }} />}
    </div>
  );
}
