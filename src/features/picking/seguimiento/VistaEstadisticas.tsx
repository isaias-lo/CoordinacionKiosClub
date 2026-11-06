'use client';

// Estadísticas de pickers en escritorio: totales, barras de unidades y tabla ordenable.
// Diseño: /mnt/project-files/disenos/picking/Estadisticas.dc.html. Los datos salen de Odoo igual
// que antes (StatsTab); esta vista solo los presenta.

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { PickerStatRow } from '../picking-types';
import {
  rangoDe, periodoDe, totales, unidadesPorOp, miles, textoMinutos, textoSegundos, textoRango, type Periodo,
} from './estadisticas';
import { compararPeriodos, resumen, type Direccion, type Tendencia } from './tendencia';
import type { RendimientoPicker } from './rendimiento';

type Orden = 'name' | 'ops' | 'lineCount' | 'units' | 'porOp' | 'avgMinutesPerOp' | 'avgSecondsPerLine';

const valor = (r: PickerStatRow, o: Orden): number | string =>
  o === 'porOp' ? unidadesPorOp(r) : r[o];

const COLUMNAS: { key: Orden; label: string; hint: string; celda: (r: PickerStatRow) => string }[] = [
  { key: 'ops', label: 'OPERACIONES', hint: 'Operaciones completadas', celda: r => miles(r.ops) },
  { key: 'lineCount', label: 'SKU', hint: 'Líneas o SKU escaneados en el período', celda: r => miles(r.lineCount) },
  { key: 'units', label: 'UNIDADES', hint: 'Unidades movidas', celda: r => miles(r.units) },
  { key: 'porOp', label: 'PROM. / OP.', hint: 'Unidades promedio por operación', celda: r => miles(unidadesPorOp(r)) },
  { key: 'avgMinutesPerOp', label: 'T. PROM. / PEDIDO', hint: 'Tiempo promedio por pedido completo', celda: r => textoMinutos(r.avgMinutesPerOp) },
  { key: 'avgSecondsPerLine', label: 'T. PROM. / SKU', hint: 'Tiempo promedio entre pistolazos', celda: r => textoSegundos(r.avgSecondsPerLine) },
];

interface Props {
  rows: PickerStatRow[];
  /** El período inmediatamente anterior, del mismo largo. `null` = sin tendencia que mostrar. */
  rowsPrevio: PickerStatRow[] | null;
  canonicalNames: Record<string, string>;
  desde: string;
  hasta: string;
  /** Cambia el período y vuelve a pedir los datos a Odoo. */
  onPeriodo: (desde: string, hasta: string) => void;
  onActualizar: () => void;
  onImprimir: () => void;
  cargando: boolean;
  hayDatos: boolean;
  actualizado: string | null;
  error: string | null;
  /** Aviso cuando Odoo no está; null si está. */
  sinOdoo: { titulo: string; detalle: string } | null;
  /** Operaciones sin hora de asignación en Odoo: se cuentan en «Ops» pero no en los promedios.
   *  Se muestra para que el promedio se lea sabiendo sobre cuántas está hecho. */
  sinMedir: number;
}

export function VistaEstadisticas({
  rows, rowsPrevio, canonicalNames, desde, hasta, onPeriodo, onActualizar, onImprimir, cargando, hayDatos, actualizado, error, sinOdoo,
  sinMedir,
}: Props) {
  const ahora = useMemo(() => new Date(), []);
  const periodo = periodoDe(desde, hasta, ahora);
  const [eligiendo, setEligiendo] = useState(false);
  const [d1, setD1] = useState(desde);
  const [d2, setD2] = useState(hasta);
  const [orden, setOrden] = useState<Orden>('units');
  const [asc, setAsc] = useState(false);

  const ordenadas = useMemo(() => [...rows].sort((a, b) => {
    const x = valor(a, orden), y = valor(b, orden);
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return asc ? c : -c;
  }), [rows, orden, asc]);
  const porUnidades = useMemo(() => [...rows].sort((a, b) => b.units - a.units), [rows]);
  const t = useMemo(() => totales(rows), [rows]);
  const max = porUnidades[0]?.units || 1;
  const nombre = (r: PickerStatRow) => canonicalNames[r.name] || r.name;

  // La tendencia se indexa por el nombre QUE SE MUESTRA, que es el mismo con el que el servidor
  // agrupó las filas. Indexar por `r.name` crudo fallaría justo en quien usó dos pistolas.
  const porNombre = useMemo(() => {
    if (!rowsPrevio) return null;
    const comparadas = compararPeriodos(
      rows as RendimientoPicker[], rowsPrevio as RendimientoPicker[]);
    return new Map(comparadas.map(t => [t.nombre, t]));
  }, [rows, rowsPrevio]);
  const conteo = useMemo(
    () => (porNombre ? resumen([...porNombre.values()]) : null), [porNombre]);

  const ordenar = (o: Orden) => {
    if (o === orden) setAsc(v => !v);
    else { setOrden(o); setAsc(o === 'name'); }
  };
  const encabezado = (o: Orden, label: ReactNode, hint: string, derecha = true) => (
    <th className={derecha ? 'r' : undefined} title={hint}
      aria-sort={orden === o ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="pk-orden" onClick={() => ordenar(o)}>
        {label}{orden === o && <span className="f" aria-hidden="true">{asc ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
  const elegirPeriodo = (p: Exclude<Periodo, 'elegir'>) => {
    setEligiendo(false);
    const r = rangoDe(p, ahora);
    if (r.desde !== desde || r.hasta !== hasta) onPeriodo(r.desde, r.hasta);
  };
  const sinConexion = !!sinOdoo;

  return (
    <main className="pk-main pk-seguimiento" aria-label="Estadísticas de pickers">
      <div className="pk-head">
        <div className="pk-hrow">
          <span className="pk-h1">Estadísticas de pickers</span>
          <span className="pk-sp" />
          <span className="pk-seg" role="group" aria-label="Período">
            {([['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']] as const).map(([k, l]) => (
              <button key={k} type="button" className={periodo === k && !eligiendo ? 'on' : ''} aria-pressed={periodo === k && !eligiendo}
                disabled={sinConexion || cargando} onClick={() => elegirPeriodo(k)}>{l}</button>
            ))}
            <button type="button" className={periodo === 'elegir' || eligiendo ? 'on' : ''} aria-pressed={periodo === 'elegir' || eligiendo}
              disabled={sinConexion || cargando} onClick={() => { setD1(desde); setD2(hasta); setEligiendo(true); }}>Elegir</button>
          </span>
          <button type="button" className="pk-btn" onClick={onImprimir} disabled={rows.length === 0}>Imprimir</button>
          <button type="button" className="pk-btn pri" onClick={onActualizar} disabled={cargando || sinConexion}
            title={sinConexion ? 'Las estadísticas salen de Odoo, que ahora no está disponible' : undefined}>
            {cargando ? 'Cargando…' : hayDatos ? 'Actualizar datos' : 'Cargar datos'}
          </button>
        </div>
        {eligiendo && (
          <div className="pk-hrow">
            <label className="pk-sub" htmlFor="stats-desde">Desde</label>
            <span className="pk-field" style={{ width: 170 }}><input id="stats-desde" type="date" value={d1} max={d2} onChange={e => setD1(e.target.value)} /></span>
            <label className="pk-sub" htmlFor="stats-hasta">hasta</label>
            <span className="pk-field" style={{ width: 170 }}><input id="stats-hasta" type="date" value={d2} min={d1} onChange={e => setD2(e.target.value)} /></span>
            <button type="button" className="pk-btn pri" disabled={!d1 || !d2 || d1 > d2}
              onClick={() => { setEligiendo(false); onPeriodo(d1, d2); }}>Ver estas fechas</button>
            <button type="button" className="pk-btn" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
        )}
        <div className="pk-kpis">
          <div className="pk-kpi"><span className="l">Operaciones</span><span className="v">{miles(t.ops)}</span></div>
          <div className="pk-kpi"><span className="l">SKU distintos</span><span className="v">{miles(t.sku)}</span></div>
          <div className="pk-kpi"><span className="l">Unidades</span><span className="v">{miles(t.unidades)}</span></div>
          <div className="pk-kpi"><span className="l">Tiempo promedio por pedido</span>
            <span className="v">{t.minPorPedido > 0 ? <>{Math.round(t.minPorPedido)} <small>min</small></> : '—'}</span></div>
        </div>
      </div>

      <div className="pk-content">
        {sinMedir > 0 && (
          <div className="pk-alert warn" role="status"><span>
            <b>{sinMedir} {sinMedir === 1 ? 'operación' : 'operaciones'} sin hora de asignación en Odoo.</b>{' '}
            Cuentan en «Ops» pero no en los promedios de tiempo, porque no se sabe cuándo empezaron.
          </span></div>
        )}
        {sinOdoo && (
          <div className="pk-alert warn" role="status"><span><b>{sinOdoo.titulo}</b> {sinOdoo.detalle}</span></div>
        )}
        {error && <div className="pk-alert" role="alert"><span><b>No se pudieron cargar:</b> {error}</span></div>}

        {!hayDatos && !cargando && !error ? (
          <div className="pk-vacio">
            <b>Sin datos cargados</b>
            <span>{sinOdoo ? 'Cuando Odoo vuelva, se cargan desde acá.' : 'Toca «Cargar datos» para traer las estadísticas del período desde Odoo.'}</span>
          </div>
        ) : cargando && rows.length === 0 ? (
          <div className="pk-vacio"><span>Cargando desde Odoo…</span></div>
        ) : hayDatos && rows.length === 0 ? (
          <div className="pk-vacio"><b>Sin operaciones en el período</b></div>
        ) : rows.length > 0 && (
          <div className="pk-dos stats">
            <div className="pk-card pk-barras">
              <span className="pk-ttl">Unidades por picker</span>
              {porUnidades.map(r => (
                <div key={r.name} className="pk-barra">
                  <span className="nm" title={nombre(r)}>{nombre(r)}</span>
                  <span className="bg"><i style={{ width: `${Math.max(2, (r.units / max) * 100)}%` }} /></span>
                  <span className="n">{miles(r.units)}</span>
                </div>
              ))}
              <span className="pk-sub">
                {textoRango(desde, hasta)} · desde Odoo{actualizado ? ` · actualizado ${actualizado}` : ''}
              </span>
            </div>
            <div className="pk-card tabla">
              <table className="pk-tabla" aria-label="Estadísticas por picker">
                <thead>
                  <tr>
                    {encabezado('name', 'PICKER', 'Responsable en Odoo y nombre configurado', false)}
                    {COLUMNAS.map(c => <Fragment key={c.key}>{encabezado(c.key, c.label, c.hint)}</Fragment>)}
                    {porNombre && (
                      <th className="r" title="Unidades por hora comparadas con el período anterior, del mismo largo. Menos de 5% de diferencia se considera igual.">
                        VS. PERÍODO ANTERIOR
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map(r => (
                    <tr key={r.name}>
                      <td>
                        <b style={{ fontWeight: 600 }}>{nombre(r)}</b>
                        {canonicalNames[r.name] && <div className="pk-sub">{r.name}</div>}
                      </td>
                      {COLUMNAS.map(c => <td key={c.key} className="pk-n">{c.celda(r)}</td>)}
                      {porNombre && (
                        <td className="pk-n"><Flecha t={porNombre.get(nombre(r))} /></td>
                      )}
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Total / promedio</td>
                    <td className="pk-n">{miles(t.ops)}</td>
                    <td className="pk-n">{miles(t.sku)}</td>
                    <td className="pk-n">{miles(t.unidades)}</td>
                    <td className="pk-n">{miles(t.unidadesPorOp)}</td>
                    <td className="pk-n">{textoMinutos(t.minPorPedido)}</td>
                    <td className="pk-n">{textoSegundos(t.segPorSku)}</td>
                    {porNombre && conteo && (
                      <td className="pk-n" style={{ fontWeight: 600 }}>
                        {conteo.sube > 0 && <span style={{ color: '#15803D' }}>▲{conteo.sube} </span>}
                        {conteo.baja > 0 && <span style={{ color: '#B91C1C' }}>▼{conteo.baja} </span>}
                        {conteo.igual > 0 && <span style={{ color: '#64748B' }}>={conteo.igual}</span>}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * La variación de una persona contra el período anterior.
 *
 * Lleva flecha Y número Y palabra, no solo color: una de cada doce personas no distingue el rojo
 * del verde, y esta columna decide conversaciones sobre el desempeño de alguien. Con el texto
 * también funciona impresa en blanco y negro, que es como se mira en el CD.
 *
 * Cuando no se puede comparar, el `title` dice por qué. Un guion sin explicación hace pensar que
 * la pantalla está rota.
 */
function Flecha({ t }: { t: Tendencia | undefined }) {
  if (!t) return <span style={{ color: '#CBD5E1' }}>—</span>;

  const estilo: Record<Direccion, { signo: string; texto: string; color: string }> = {
    sube:         { signo: '▲', texto: 'sube',  color: '#15803D' },
    baja:         { signo: '▼', texto: 'baja',  color: '#B91C1C' },
    igual:        { signo: '=', texto: 'igual', color: '#64748B' },
    nuevo:        { signo: '·', texto: 'nuevo', color: '#1E40AF' },
    'sin-datos':  { signo: '—', texto: '',      color: '#94A3B8' },
  };
  const e = estilo[t.direccion];

  if (t.deltaCph === null) {
    return (
      <span style={{ color: e.color }} title={t.motivo ?? 'sin datos para comparar'}>
        {e.signo} {e.texto}
      </span>
    );
  }
  const antes = t.previo?.cph ?? 0, ahora = t.actual?.cph ?? 0;
  return (
    <span style={{ color: e.color, fontWeight: 600, whiteSpace: 'nowrap' }}
          title={`${antes} unidades por hora antes, ${ahora} ahora`}>
      {e.signo} {t.deltaCph > 0 ? '+' : ''}{t.deltaCph}%
    </span>
  );
}
