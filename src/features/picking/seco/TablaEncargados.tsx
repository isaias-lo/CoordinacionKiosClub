'use client';

import React, { useState } from 'react';
import type { PickerGroup, SectionFilter } from '../picking-types';
import type { PickerGroupCard } from '../components/PickerGroupCard';
import type { ClaveUnidad } from '../tiposUnidad';
import {
  COLOR_SECCION, colorAvatar, iniciales, estadoOdoo, estadoEtiquetas, sinImprimir, totalesPorTipo,
} from './filaEncargado';

export type PropsTarjeta = React.ComponentProps<typeof PickerGroupCard>;

export interface FilaSeco {
  group: PickerGroup;
  tarjeta: PropsTarjeta;
  nombre: string;
  subNombre: string;
  categorias: string[];
  secciones: SectionFilter[];
  unidades: ClaveUnidad[];
  nota: string | null;
}

interface Props {
  filas: FilaSeco[];
  nombreTienda: string;
  opsConEncargado: { con: number; total: number };
  abierta: string | null;
  onAbrir: (stateKey: string) => void;
}

/** «WH/PICK/01001 · 01002»: el nombre completo una vez y el resto solo su número. */
export function nombresOps(nombres: string[]): string {
  if (nombres.length === 0) return '—';
  const [primero, ...resto] = nombres;
  return [primero, ...resto.map(n => n.split('/').pop() ?? n)].join(' · ');
}

/** La tabla de encargados de una tienda: una fila por encargado, Mixto incluido. */
export function TablaEncargados({ filas, nombreTienda, opsConEncargado, abierta, onAbrir }: Props) {
  // Bajar un contador ya impreso, o el último de su tipo, pide confirmación (la misma regla que la
  // tarjeta): sin esto, un toque de más borraba la unidad sin vuelta atrás.
  const [confirmar, setConfirmar] = useState<{ stateKey: string; clave: ClaveUnidad; texto: string } | null>(null);

  const total = filas.reduce((acc, f) => {
    const t = totalesPorTipo(f.tarjeta.palletsByTipo);
    return { P: acc.P + t.P, B: acc.B + t.B, CH: acc.CH + t.CH, etiquetas: acc.etiquetas + f.tarjeta.assignedNums.length };
  }, { P: 0, B: 0, CH: 0, etiquetas: 0 });

  const paso = (f: FilaSeco, clave: ClaveUnidad) => {
    if (!f.unidades.includes(clave)) return <span className="pk-na" aria-label="No aplica">—</span>;
    const { palletsByTipo, onTipoPalletsChange, isPrinted } = f.tarjeta;
    const n = palletsByTipo[clave] ?? 0;
    const nombre = clave === 'P' ? 'pallet' : 'bulto';
    return (
      <span className={`pk-step${n === 0 ? ' z' : ''}`}>
        <button type="button" aria-label={`Quitar un ${nombre} a ${f.nombre}`}
          onClick={e => {
            e.stopPropagation();
            if (n > 0 && (isPrinted || n === 1)) {
              setConfirmar({ stateKey: f.group.stateKey, clave, texto: isPrinted
                ? `Las etiquetas de ${f.nombre} ya se imprimieron. ¿Eliminar el ${nombre} igual?`
                : `Es el último ${nombre} de ${f.nombre}: se elimina por completo. ¿Eliminar igual?` });
            } else if (n > 0) onTipoPalletsChange(clave, n - 1);
          }}>−</button>
        <span aria-label={`${n} ${nombre}${n !== 1 ? 's' : ''}`}>{n}</span>
        <button type="button" aria-label={`Agregar un ${nombre} a ${f.nombre}`}
          onClick={e => { e.stopPropagation(); onTipoPalletsChange(clave, n + 1); }}>+</button>
      </span>
    );
  };

  return (
    <div className="pk-card tabla">
      <table className="pk-tabla">
        <thead>
          <tr>
            <th>ENCARGADO</th><th>SECCIONES</th><th>OPERACIONES EN ODOO</th><th>ESTADO</th>
            <th>PALLETS</th><th>BULTOS</th><th>CHOCOLATE</th><th>ETIQUETAS</th><th aria-label="Detalle" />
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const t = f.tarjeta;
            const est = estadoOdoo(f.group.operations);
            const tot = totalesPorTipo(t.palletsByTipo);
            const bloqueada = f.group.operations.length > 0 && !f.group.operations.every(o => o.state === 'done');
            const etq = estadoEtiquetas({
              unidades: tot.total, pendientes: sinImprimir(t.slots), bloqueadaPorOdoo: bloqueada,
              enOtraSeccion: !!t.avisoOtraSeccion,
            });
            const lineas = f.group.operations.reduce((a, o) => a + (o.lineCount || 0), 0);
            const tieneCH = f.unidades.some(u => u.startsWith('CH'));
            const abrir = () => onAbrir(f.group.stateKey);
            return (
              <React.Fragment key={f.group.stateKey}>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions --
                    toda la fila abre el detalle con el mouse; con teclado lo abren el nombre y la flecha. */}
                <tr className={`fila${abierta === f.group.stateKey ? ' sel' : ''}`} onClick={abrir}>
                  <td>
                    <button type="button" className="pk-link pk-pname" onClick={e => { e.stopPropagation(); abrir(); }}>
                      <span className="pk-av" style={{ background: colorAvatar(f.group.key) }} aria-hidden="true">{iniciales(f.nombre)}</span>
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <b>{f.nombre}</b>
                        <span className="pk-sub">{f.subNombre}</span>
                        {t.otroDia && <span className="pk-sub" style={{ color: '#8A4A06' }}>Documento de otro día</span>}
                      </span>
                    </button>
                  </td>
                  <td style={{ maxWidth: 130 }}>
                    {f.categorias.map(c => (
                      <span key={c} className="pk-chip"><i style={{ background: COLOR_SECCION[c] ?? '#8A91A1' }} />{c}</span>
                    ))}
                  </td>
                  <td>
                    <span className="pk-mono">{nombresOps(f.group.operations.map(o => o.name))}</span>
                    <div className="pk-sub">{f.group.operations.length === 0 ? 'Sin operaciones de Odoo' : `${lineas} línea${lineas !== 1 ? 's' : ''}`}</div>
                  </td>
                  <td className="nw"><span className={`pk-pill ${est.tono}`}>{est.texto}</span></td>
                  <td className="nw">{paso(f, 'P')}</td>
                  <td className="nw">{paso(f, 'B')}</td>
                  <td>
                    {tieneCH
                      ? <span className="pk-num" title="Las cajas de chocolate (negra o cartón) se cuentan en el detalle">{tot.CH}</span>
                      : <span className="pk-na" aria-label="No aplica">—</span>}
                  </td>
                  <td className="nw"><span className={`pk-pill ${etq.tono}`}>{etq.texto}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="pk-link" style={{ color: '#6B7280', fontSize: 16, padding: '0 4px' }}
                      onClick={e => { e.stopPropagation(); abrir(); }} aria-label={`Ver el detalle de ${f.nombre}`}>›</button>
                  </td>
                </tr>
                {confirmar?.stateKey === f.group.stateKey && (
                  <tr className="conf">
                    <td colSpan={9}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} role="alertdialog" aria-label="Confirmar eliminación">
                        <span style={{ flex: 1, color: '#5C1A12' }}>{confirmar.texto}</span>
                        <button type="button" className="pk-btn" onClick={() => setConfirmar(null)}>Cancelar</button>
                        <button type="button" className="pk-btn peligro" onClick={() => {
                          const n = t.palletsByTipo[confirmar.clave] ?? 0;
                          t.onTipoPalletsChange(confirmar.clave, Math.max(0, n - 1));
                          setConfirmar(null);
                        }}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          <tr className="tot">
            <td>Total {nombreTienda}</td>
            <td className="pk-sub" colSpan={3} style={{ fontWeight: 600 }}>{opsConEncargado.con} de {opsConEncargado.total} operaciones con encargado</td>
            <td className="pk-num" style={{ paddingLeft: 22 }}>{total.P}</td>
            <td className="pk-num" style={{ paddingLeft: 22 }}>{total.B}</td>
            <td className="pk-num" style={{ paddingLeft: 22 }}>{total.CH}</td>
            <td>{total.etiquetas} etiqueta{total.etiquetas !== 1 ? 's' : ''}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
