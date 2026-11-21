'use client';

// Estadísticas de pickers en escritorio: totales, barras de unidades y tabla ordenable.
// Diseño: /mnt/project-files/disenos/picking/Estadisticas.dc.html. Los datos salen de Odoo igual
// que antes (StatsTab); esta vista solo los presenta.

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PickerStatRow } from '../picking-types';
import {
  rangoDe, periodoDe, totales, unidadesPorOp, miles, textoMinutos, textoSegundos, textoRango, type Periodo,
  diaLocal, mismoDia,
} from './estadisticas';
import { compararPeriodos, resumen, type Direccion, type Tendencia } from './tendencia';
import { textoCuentasFuera } from './filtroPickers';
import { ESPECIALIDADES, NOMBRE_ESPECIALIDAD, type Especialidad } from './especialidad';
import { buscadorDeNombres } from './nombreDeCuenta';
import { desacuerdoConLaPlanilla, explicacionDesacuerdo } from './desacuerdoPlanilla';
import type { RendimientoPicker } from './rendimiento';

type Orden = 'name' | 'ops' | 'lineCount' | 'units' | 'porOp' | 'avgMinutesPerOp'
  | 'avgSecondsPerLine' | 'totalMinutes' | 'cph';

/** `132.2` a partir de los minutos. Una hora con decimal es como la jefatura lee el tiempo. */
const textoHoras = (min: number): string =>
  min > 0 ? (min / 60).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';

const valor = (r: PickerStatRow, o: Orden): number | string =>
  o === 'porOp' ? unidadesPorOp(r) : r[o];

const COLUMNAS: { key: Orden; label: string; hint: string; celda: (r: PickerStatRow) => string }[] = [
  { key: 'ops', label: 'OPERACIONES', hint: 'Operaciones completadas', celda: r => miles(r.ops) },
  { key: 'lineCount', label: 'SKU', hint: 'Líneas o SKU escaneados en el período', celda: r => miles(r.lineCount) },
  { key: 'units', label: 'UNIDADES', hint: 'Unidades movidas', celda: r => miles(r.units) },
  { key: 'porOp', label: 'PROM. / OP.', hint: 'Unidades promedio por operación', celda: r => miles(unidadesPorOp(r)) },
  { key: 'avgMinutesPerOp', label: 'T. PROM. / PEDIDO', hint: 'Tiempo promedio por pedido completo', celda: r => textoMinutos(r.avgMinutesPerOp) },
  { key: 'avgSecondsPerLine', label: 'T. PROM. / SKU', hint: 'Tiempo promedio entre pistolazos', celda: r => textoSegundos(r.avgSecondsPerLine) },
  { key: 'totalMinutes', label: 'HORAS',
    hint: 'Horas de RELOJ: cada tanda se cuenta una vez y los lapsos que se pisan se unen. Donde dice «planilla», la hoja del bono cuenta otro número porque los suma en vez de unirlos.',
    celda: r => textoHoras(r.totalMinutes) },
  // La métrica de productividad. El sistema la calculaba desde siempre para la flecha de
  // tendencia y nunca la mostró: es la única columna que compara justo a quien hizo 154
  // operaciones chicas con quien hizo 51 grandes. Es la «CPH_Real» de la planilla del bono.
  { key: 'cph', label: 'U / HORA',
    hint: 'Unidades por hora. Es la métrica de productividad, y la misma «CPH_Real» con la que se paga el bono — calculada sobre las horas de reloj.',
    celda: r => miles(r.cph) },
];

interface Props {
  rows: PickerStatRow[];
  /** El período anterior, del mismo largo (ver `periodoAnterior`). `null` = sin tendencia que mostrar. */
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
  /** El período alcanzó el tope de Odoo y los números están cortados. */
  truncado?: boolean;
  /** Odoo no devolvió la cantidad en ningún grupo: las unidades que se ven son ceros falsos. */
  unidadesDudosas?: boolean;
  /** Lo que el filtro de pickers dejó afuera. Se MUESTRA: un filtro silencioso es lo que hizo
   *  que la pantalla dijera 72 operaciones teniendo Odoo 868 y nadie pudiera notarlo. */
  fueraDeLista?: { opsFuera: number; cuentasFuera: string[] };
  /** Lleva a Ajustes → Configuración desde el aviso de cuentas fuera de la lista. Sin esto el
   *  aviso dice qué hacer pero no lleva, y hay que ir a buscarlo a mano. */
  onAbrirConfig?: () => void;
  /** Las mismas filas calculadas DENTRO de cada especialidad. Con un chip puesto, la tabla
   *  muestra estas: las operaciones, las unidades Y las horas de esa especialidad, no un
   *  recorte del total. Ver `especialidad.ts`. */
  porEspecialidad?: Record<string, PickerStatRow[]>;
}

/**
 * La fecha de hoy, que se vuelve a leer cuando cambia el día. Era `useMemo(() => new Date(), [])`:
 * con la pantalla abierta de un día para otro, «Hoy», «Esta semana» y «Este mes» seguían
 * calculándose con el día en que se abrió.
 */
function useHoy(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const revisar = () => setAhora(antes => (mismoDia(antes, new Date()) ? antes : new Date()));
    const reloj = window.setInterval(revisar, 60_000);
    document.addEventListener('visibilitychange', revisar);
    return () => { window.clearInterval(reloj); document.removeEventListener('visibilitychange', revisar); };
  }, []);
  return ahora;
}

export function VistaEstadisticas({
  rows: rowsTodas, rowsPrevio, canonicalNames, desde, hasta, onPeriodo, onActualizar, onImprimir, cargando, hayDatos, actualizado, error, sinOdoo,
  sinMedir, truncado, unidadesDudosas, fueraDeLista, onAbrirConfig, porEspecialidad,
}: Props) {
  /** Qué especialidad se está mirando. `todas` junta el trabajo de cada persona en una fila,
   *  que es lo que se veía siempre. */
  const [esp, setEsp] = useState<Especialidad | 'todas'>('todas');
  const ahora = useHoy();
  /** El tope de «Elegir»: un día que todavía no pasa no tiene nada que medir. */
  const hoy = diaLocal(ahora);
  const periodo = periodoDe(desde, hasta, ahora);
  const [eligiendo, setEligiendo] = useState(false);
  const [d1, setD1] = useState(desde);
  const [d2, setD2] = useState(hasta);
  const [orden, setOrden] = useState<Orden>('units');
  const [asc, setAsc] = useState(false);
  /** El panel de barras ocupa 420 px fijos y repite lo que «Unidades» ya dice, ordenada igual.
   *  Cerrarlo le da el ancho completo a la tabla, que es donde están las siete columnas. */
  const [verBarras, setVerBarras] = useState(true);
  /** Qué significa cada columna. Existía solo como `title` del encabezado: hay que saber que
   *  está para encontrarlo, y en una tablet no hay hover. */
  const [verAyuda, setVerAyuda] = useState(false);

  // Con un chip puesto, las filas son las de ESA especialidad. Si el servidor todavía no las
  // manda —un cache viejo, por ejemplo—, se cae a «todas» en vez de mostrar una tabla vacía.
  const delChip = esp === 'todas' ? null : porEspecialidad?.[esp];
  const rows = delChip ?? rowsTodas;
  /** En qué especialidades trabajó cada persona, para la etiqueta de la fila. */
  const espsDe = useMemo(() => {
    const m = new Map<string, Especialidad[]>();
    for (const e of ESPECIALIDADES)
      for (const f of porEspecialidad?.[e] ?? [])
        m.set(f.name, [...(m.get(f.name) ?? []), e]);
    return m;
  }, [porEspecialidad]);

  const ordenadas = useMemo(() => [...rows].sort((a, b) => {
    const x = valor(a, orden), y = valor(b, orden);
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return asc ? c : -c;
  }), [rows, orden, asc]);
  const porUnidades = useMemo(() => [...rows].sort((a, b) => b.units - a.units), [rows]);
  const t = useMemo(() => totales(rows), [rows]);
  const max = porUnidades[0]?.units || 1;
  // Tolerante a mayúsculas y espacios, igual que el filtro y que el resto del flujo: un cache
  // guardado antes del #788 trae la CUENTA en `name`, y «Control Interno» no calzaba con la
  // clave «control interno» de la tabla. Ver `nombreDeCuenta.ts`.
  const buscarNombre = useMemo(() => buscadorDeNombres(canonicalNames), [canonicalNames]);
  const nombre = (r: PickerStatRow) => buscarNombre(r.name) || r.name;

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
          {/* El de la ayuda y el del gráfico van en la barra fija y NO dentro del panel: si
              el de «Ocultar» viviera adentro, al cerrarlo se iría con él y no habría cómo
              volver a abrirlo. Lo encontró el coordinador en el mockup. */}
          {rows.length > 0 && (
            <button type="button" className="pk-btn" aria-pressed={verAyuda}
              onClick={() => setVerAyuda(v => !v)}>
              {verAyuda ? 'Ocultar la ayuda' : '¿Qué es cada columna?'}
            </button>
          )}
          {rows.length > 0 && (
            <button type="button" className="pk-btn" aria-pressed={!verBarras}
              onClick={() => setVerBarras(v => !v)}
              title={verBarras ? 'La tabla pasa a ocupar el ancho completo' : undefined}>
              {verBarras ? 'Ocultar gráfico' : 'Ver gráfico'}
            </button>
          )}
          <button type="button" className="pk-btn" onClick={onImprimir} disabled={rows.length === 0}>Imprimir</button>
          <button type="button" className="pk-btn pri" onClick={onActualizar} disabled={cargando || sinConexion}
            title={sinConexion ? 'Las estadísticas salen de Odoo, que ahora no está disponible' : undefined}>
            {cargando ? 'Cargando…' : hayDatos ? 'Actualizar datos' : 'Cargar datos'}
          </button>
        </div>
        {eligiendo && (
          <div className="pk-hrow">
            <label className="pk-sub" htmlFor="stats-desde">Desde</label>
            <span className="pk-field" style={{ width: 170 }}><input id="stats-desde" type="date" value={d1} max={d2 && d2 < hoy ? d2 : hoy} onChange={e => setD1(e.target.value)} /></span>
            <label className="pk-sub" htmlFor="stats-hasta">hasta</label>
            <span className="pk-field" style={{ width: 170 }}><input id="stats-hasta" type="date" value={d2} min={d1} max={hoy} onChange={e => setD2(e.target.value)} /></span>
            <button type="button" className="pk-btn pri" disabled={!d1 || !d2 || d1 > d2 || d2 > hoy}
              onClick={() => { setEligiendo(false); onPeriodo(d1, d2); }}>Ver estas fechas</button>
            <button type="button" className="pk-btn" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
        )}
        {/* Los chips de especialidad. No son un recorte de la tabla: con uno puesto, las
            filas son el MISMO cálculo corrido sobre los movimientos de esa especialidad, con
            sus horas y su ritmo. Por eso Flores aparece en «Congelados» con 52 u/h y en «Seco»
            con 726, y no con su promedio mezclado. Ver `especialidad.ts`. */}
        {porEspecialidad && rowsTodas.length > 0 && (
          <div className="pk-esp" role="group" aria-label="Especialidad">
            <button type="button" aria-pressed={esp === 'todas'} onClick={() => setEsp('todas')}>
              Todas <span className="c">{rowsTodas.length}</span>
            </button>
            {ESPECIALIDADES.map(e => (
              <button key={e} className={e} aria-pressed={esp === e} onClick={() => setEsp(e)}
                disabled={!(porEspecialidad[e]?.length)}>
                <i aria-hidden="true" /> {NOMBRE_ESPECIALIDAD[e]}{' '}
                <span className="c">{porEspecialidad[e]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="pk-kpis cinco">
          <div className="pk-kpi"><span className="l">Operaciones</span><span className="v">{miles(t.ops)}</span></div>
          <div className="pk-kpi"><span className="l">SKU distintos</span><span className="v">{miles(t.sku)}</span></div>
          <div className="pk-kpi"><span className="l">Unidades</span><span className="v">{miles(t.unidades)}</span></div>
          <div className="pk-kpi"><span className="l">Horas de trabajo</span>
            <span className="v">{textoHoras(t.minutos)} <small>h</small></span></div>
          {/* La métrica de productividad del período, al lado de los volúmenes. */}
          <div className="pk-kpi"><span className="l">Unidades por hora</span>
            <span className="v">{t.cph > 0 ? <>{miles(t.cph)} <small>u/h</small></> : '—'}</span></div>
        </div>
      </div>

      <div className="pk-content">
        {truncado && (
          // El período alcanzó el tope de operaciones que Odoo devuelve, así que los números
          // están CORTADOS. Sin este aviso se leerían como completos y serían bajos.
          <div className="pk-alert warn" role="status"><span>
            <b>El período es demasiado largo y los números están cortados.</b>{' '}
            Odoo devuelve como máximo 8.000 operaciones por consulta y este período las alcanzó.
            Mirá un rango más corto —un mes entero son unas 3.300— para ver los totales completos.
          </span></div>
        )}
        {unidadesDudosas && (
          // Odoo dejó de devolver la cantidad agregada. Los ceros de «Unidades», «Prom./op.» y
          // la barra NO significan que no se movió nada: significan que el dato no llegó. Sin
          // este aviso son ceros perfectamente creíbles, que es como pasaron inadvertidos.
          <div className="pk-alert warn" role="status"><span>
            <b>Odoo no está devolviendo las unidades.</b>{' '}
            Los ceros de «Unidades» y «Prom./op.» no son el dato: es que el campo no llegó.
            Las operaciones, los SKU y los tiempos sí son correctos.
          </span></div>
        )}
        {fueraDeLista && fueraDeLista.opsFuera > 0 && (
          // No es un error: son cuentas de Odoo que no están en la lista de pickers de Config,
          // y la pantalla no las muestra a propósito. Lo que no puede pasar es que se vayan sin
          // decirlo, porque entonces el total de la pantalla no calza con Odoo y no se sabe por qué.
          <div className="pk-alert" role="status"><span>
            <b>{miles(fueraDeLista.opsFuera)} {fueraDeLista.opsFuera === 1 ? 'operación' : 'operaciones'} fuera de la tabla.</b>{' '}
            Son de {fueraDeLista.cuentasFuera.length === 1 ? 'una cuenta de Odoo que no está' : 'cuentas de Odoo que no están'}{' '}
            en la lista de pickers: {textoCuentasFuera(fueraDeLista.cuentasFuera)}.
            {' '}Se agregan en Ajustes → Configuración.
          </span>
          {/* El aviso decía qué hacer pero no llevaba. */}
          {onAbrirConfig && (
            <button type="button" className="pk-btn" style={{ marginLeft: 'auto', flexShrink: 0 }}
              onClick={onAbrirConfig}>Abrir Configuración</button>
          )}</div>
        )}
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
          <>
          {verAyuda && (
            // Las mismas definiciones que el `title` del encabezado, pero desplegadas: hay que
            // saber que el tooltip está para encontrarlo, y en una tablet no hay hover.
            <div className="pk-ayuda">
              <div><b>PICKER</b><span>La persona. Debajo, la cuenta de Odoo con la que trabajó;
                si usó dos pistolas, la fila es la suma de las dos.</span></div>
              {COLUMNAS.map(c => <div key={c.key}><b>{c.label}</b><span>{c.hint}</span></div>)}
              <div><b>VS. PERÍODO ANTERIOR</b><span>Unidades por hora comparadas con el período
                anterior, del mismo largo; si es de menos de una semana, los mismos días de la semana
                pasada. Menos de 5% de diferencia se considera igual.</span></div>
              {/* Sin esto, el «planilla 238,8» de una fila no se puede interpretar. */}
              <div><b>PLANILLA</b><span>Cuando aparece debajo de las horas o del ritmo, es el
                número que da la hoja del bono de la jefatura. Difiere porque esa hoja SUMA los
                lapsos de trabajo y acá se unen los que se pisan: quien arma varias tandas en
                paralelo —chocolate y congelados— sale con horas que no existen. Pasa en 6 de 30
                cuentas; en las otras los dos números son iguales y no se muestra.</span></div>
            </div>
          )}
          <div className={`pk-dos stats${verBarras ? '' : ' ancho'}`}>
            {verBarras && (
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
            )}
            <div className="pk-card tabla">
              <table className="pk-tabla" aria-label="Estadísticas por picker">
                <thead>
                  <tr>
                    {encabezado('name', 'PICKER', 'Responsable en Odoo y nombre configurado', false)}
                    {COLUMNAS.map(c => <Fragment key={c.key}>{encabezado(c.key, c.label, c.hint)}</Fragment>)}
                    {porNombre && (
                      <th className="r" title="Unidades por hora comparadas con el período anterior, del mismo largo (si es de menos de una semana, los mismos días de la semana pasada). Menos de 5% de diferencia se considera igual.">
                        VS. PERÍODO ANTERIOR
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((r, i) => (
                    <tr key={r.name}>
                      <td>
                        {/* El puesto en la columna por la que está ordenada la tabla. Se
                            recalcula al cambiar de columna a propósito: ordenar por u/hora da
                            otro ranking que ordenar por unidades, y esa es la gracia. */}
                        <span className="pk-puesto" aria-hidden="true">{i + 1}</span>
                        <b style={{ fontWeight: 600 }}>{nombre(r)}</b>
                        {/* La etiqueta de lo que se está mirando va encendida y las otras
                            apagadas: así se lee que esta fila es «la parte de congelados de
                            Flores» y no todo Flores. */}
                        {(espsDe.get(r.name) ?? []).map(e => (
                          <span key={e} className={`pk-tag ${e}${esp === e ? ' on' : ''}${esp !== 'todas' && esp !== e ? ' off' : ''}`}>
                            {NOMBRE_ESPECIALIDAD[e].toLowerCase()}
                          </span>
                        ))}
                        {buscarNombre(r.name) && <div className="pk-sub">{r.name}</div>}
                      </td>
                      {COLUMNAS.map(c => {
                        // El número de la hoja del bono va DEBAJO del de reloj, y solo en las
                        // filas donde se separan: repetirlo en las que coinciden es ruido que
                        // esconde las que importan. Ver `desacuerdoPlanilla.ts`.
                        const d = c.key === 'totalMinutes' || c.key === 'cph'
                          ? desacuerdoConLaPlanilla(r) : null;
                        return (
                          <td key={c.key} className="pk-n">
                            {c.celda(r)}
                            {d && (
                              <span className="pk-plan" title={explicacionDesacuerdo(d)}>
                                planilla {c.key === 'totalMinutes' ? textoHoras(d.minutos) : miles(d.cph)}
                              </span>
                            )}
                          </td>
                        );
                      })}
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
                    <td className="pk-n">{textoHoras(t.minutos)}</td>
                    <td className="pk-n">{miles(t.cph)}</td>
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
          </>
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
