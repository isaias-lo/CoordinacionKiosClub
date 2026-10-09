'use client';

// Seco y Congelados en teléfono y handheld (diseño «Picking, propuesta empresarial», Teléfono):
// la tienda arriba, las secciones como píldoras y una tarjeta por encargado con botones de 48 px.
// Recibe lo mismo que VistaSeco (la vista de escritorio), así las dos escriben igual.

import React, { useCallback } from 'react';
import { RefreshCw, UserPlus, ChevronRight } from 'lucide-react';
import type { VistaSecoProps } from '../seco/VistaSeco';
import { PanelEncargado } from '../seco/PanelEncargado';
import { TarjetaTelefono } from './TarjetaTelefono';

interface Props extends VistaSecoProps {
  /** Volver a la lista para elegir otras tiendas. */
  onElegirTiendas: () => void;
}

const OTRAS = '__otras__';

export function VistaTelefono(p: Props) {
  const e = p.encabezado;
  const i = p.filas.findIndex(f => f.group.stateKey === p.abierta);
  const fila = i >= 0 ? p.filas[i] : null;
  const { onAbrir } = p;
  const cerrar = useCallback(() => onAbrir(null), [onAbrir]);
  const otras = p.encabezado.tiendas.length - 1;

  return (
    <div className="pk-main pk-tel">
      <div className="pk-tel-head print:hidden">
        <label className="pk-tel-tienda">
          <span className="t"><span className="pk-mono">{e.cod}</span> {e.nombre}</span>
          <span className="pk-sp" />
          <span className="pk-sub">{otras > 0 ? `+${otras} tienda${otras !== 1 ? 's' : ''} ▾` : 'Cambiar ▾'}</span>
          <select value={e.cod} aria-label="Tienda"
            onChange={ev => { if (ev.target.value === OTRAS) p.onElegirTiendas(); else e.onElegirTienda(ev.target.value); }}>
            {e.tiendas.map(t => <option key={t.cod} value={t.cod}>{t.cod} {t.nombre}</option>)}
            <option value={OTRAS}>Elegir otras tiendas…</option>
          </select>
        </label>
        {e.secciones && e.secciones.length > 1 && (
          <div className="pk-tel-pills" role="tablist" aria-label="Sección">
            {e.secciones.map(s => (
              <button key={s.key} type="button" role="tab" aria-selected={e.seccion === s.key}
                className={e.seccion === s.key ? 'on' : ''} onClick={() => e.onSeccion?.(s.key)}>
                {s.label} {s.cuenta}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pk-tel-content">
        {p.formManual && <div className="pk-card">{p.formManual}</div>}
        {p.sinAsignar && (
          <div className="pk-alert print:hidden" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A3271A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></svg>
            <span><b>{p.sinAsignar.n} operación{p.sinAsignar.n !== 1 ? 'es' : ''} sin responsable</b> en Odoo. No {p.sinAsignar.n !== 1 ? 'generan' : 'genera'} etiqueta.</span>
          </div>
        )}
        {p.otroDia > 0 && (
          <div className="pk-alert warn print:hidden" role="status">
            <span><b>{p.otroDia} con fecha de origen distinta a hoy.</b> Revísa{p.otroDia !== 1 ? 'los' : 'lo'} antes de trabajar{p.otroDia !== 1 ? 'los' : 'lo'}.</span>
          </div>
        )}

        {p.cargando && p.filas.length === 0 ? (
          <div className="pk-vacio"><span>Cargando operaciones de Odoo…</span></div>
        ) : p.filas.length === 0 ? (
          <div className="pk-vacio"><b>{p.modo === 'congelados' ? 'Sin operaciones de congelados hoy' : 'Sin operaciones en esta sección hoy'}</b><span>Si alguien trabajó sin quedar en Odoo, usa «Encargado manual».</span></div>
        ) : (
          p.filas.map(f => <TarjetaTelefono key={f.group.stateKey} fila={f} onAbrir={() => onAbrir(f.group.stateKey)} />)
        )}

        <div className="pk-tel-acc print:hidden">
          <button type="button" className="pk-btn" onClick={e.onManual}><UserPlus size={15} aria-hidden="true" /> Encargado manual</button>
          <button type="button" className="pk-btn" onClick={e.onActualizar} disabled={e.actualizando}>
            <RefreshCw size={15} aria-hidden="true" className={e.actualizando ? 'animate-spin' : ''} /> {e.actualizando ? 'Cargando…' : 'Actualizar'}
          </button>
          {e.imprimir && (
            <button type="button" className={`pk-btn ${e.imprimir.armado ? 'armado' : ''}`} onClick={e.imprimir.onClick}>
              {e.imprimir.armado ? '¿Confirmar?' : `Imprimir la tienda · ${e.imprimir.n}`}
            </button>
          )}
          {p.imprimirTodas && (
            <button type="button" className="pk-btn" onClick={p.imprimirTodas.onClick}>
              Imprimir las {p.imprimirTodas.tiendas} tiendas · {p.imprimirTodas.etiquetas}
            </button>
          )}
        </div>
        {e.actualizadoA && <span className="pk-sub" style={{ textAlign: 'center' }}>Odoo actualizado a las {e.actualizadoA}</span>}
        <span className="pk-sub" style={{ textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          Toca el nombre para ver el detalle y las etiquetas <ChevronRight size={13} aria-hidden="true" />
        </span>
      </div>

      {fila && (
        <PanelEncargado fila={fila} nombreTienda={e.nombre} onCerrar={cerrar}
          onAnterior={i > 0 ? () => onAbrir(p.filas[i - 1].group.stateKey) : undefined}
          onSiguiente={i < p.filas.length - 1 ? () => onAbrir(p.filas[i + 1].group.stateKey) : undefined} />
      )}
    </div>
  );
}
