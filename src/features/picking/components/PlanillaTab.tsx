'use client';

// La planilla de Picking: la hoja del día, en dos vistas.
//
// ── LA HOJA CAMBIA CON EL DÍA ─────────────────────────────────────────────────────────────────
//
// Hoy muestra las tiendas de hoy. No hay selector de fecha, igual que el papel. La fecha se toma
// LOCAL (`fechaISOLocal`), no con `todayISO()`, que usa UTC y rueda cerca de las 20:00 en Chile: a
// esa hora la planilla habría saltado al día siguiente con el CD todavía abierto.
//
// ── POR QUÉ SE PIDEN VARIOS DÍAS A ODOO ───────────────────────────────────────────────────────
//
// Una tienda de apertura tiene sus movimientos fechados en otro día. `agruparConsultasPorDia` ya
// sabe qué día pide cada tienda; de ahí salen las fechas que se le piden a Odoo y el mapa
// `cod → día` con el que `movimientosDesdeOdoo` descarta lo que no corresponde.
//
// Imprimir usa el mismo patrón que `CalendarioColumnas.handlePrint`: se arma el HTML y se abre una
// ventana. Cada vista imprime en SU formato, porque el botón imprime la vista en la que estás.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, Download, Loader2, RotateCcw } from 'lucide-react';
import { AUTO_REFRESH_MS } from '../picking-types';
import { fechaISOLocal } from '@/features/despacho/shared/fechaLocal';
import { agruparConsultasPorDia } from '@/features/despacho/shared/consultasPorDia';
import { armarPlanilla, SECCIONES, porAsignacion, type CeldaPlanilla, type MovimientoPlanilla, type Planilla, type SeccionPlanilla } from '../planilla/armarPlanilla';
import { conCorrecciones, type FilaGuardada } from '../planilla/conCorrecciones';
import { validarCorreccion, textoConfirmacion, type PedidoCorreccion } from '../planilla/correccionPicker';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../planilla/desdeOdoo';
import { COLOR_ZONA, ZONAS, zonaPlanilla, type ZonaPlanilla } from '../planilla/zonaPlanilla';
import { horaChile, duracionMinutos, formatearDuracion } from '../planilla/horasPlanilla';
import { csvVistaPlanilla, csvVistaDetalle } from '../planilla/csvPlanilla';

export interface PlanillaTabProps {
  /** Los códigos de las tiendas del día, en el orden del calendario. */
  cods: string[];
  /** `cod → día de sus movimientos en Odoo`, solo para las tiendas de apertura. */
  aperturas: ReadonlyMap<string, string>;
}

type Vista = 'planilla' | 'detalle';
interface FichaTienda { codigo: string; sector_comuna?: string | null; tipo?: string | null; lat?: number | null }

export function PlanillaTab({ cods, aperturas }: PlanillaTabProps) {
  const fecha = fechaISOLocal();
  const [vista, setVista]     = useState<Vista>('planilla');
  const [crudos, setCrudos]   = useState<MovimientoOdoo[] | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [fichas, setFichas]   = useState<Record<string, FichaTienda>>({});
  const [error, setError]     = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [cargando, setCargando]       = useState(false);
  const [guardados, setGuardados]     = useState<FilaGuardada[]>([]);
  // La celda que se está corrigiendo. `null` = no hay cuadro abierto.
  const [corrigiendo, setCorrigiendo] = useState<PedidoCorreccion | null>(null);
  const [guardandoCorr, setGuardandoCorr] = useState(false);

  // Qué día pide cada tienda: hoy, salvo las aperturas.
  const consultas = useMemo(
    () => agruparConsultasPorDia(cods, aperturas, fecha),
    [cods, aperturas, fecha]);

  const diaPorTienda = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of consultas) for (const cod of c.cods) m.set(cod, c.dia);
    return m;
  }, [consultas]);

  const fechas = useMemo(() => consultas.map(c => c.dia), [consultas]);
  // El efecto depende de un TEXTO, no del arreglo. `cods` llega como un arreglo nuevo en cada
  // render de la pantalla, así que `consultas` y `fechas` también son nuevos aunque digan lo
  // mismo: con `fechas` en las dependencias el efecto se dispara en bucle y le pega a Odoo sin
  // parar. La clave cambia solo cuando cambian los días de verdad.
  const claveFechas = fechas.join(',');

  // La carga es una función aparte para poder repetirla: la hoja se mira todo el día y los
  // movimientos se van asignando y validando mientras tanto. Sin esto, una celda que ya tiene
  // picker seguía diciendo «sin asignar» hasta recargar la página entera.
  const cargar = useCallback(async () => {
    if (!claveFechas) { setCrudos([]); return; }
    const fechas = claveFechas.split(',');
    const vivo = true;
    setCargando(true);
    {
      try {
        const [rOdoo, rNombres, rTiendas, rCorr] = await Promise.all([
          fetch('/api/odoo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'planilla_dia', fechas }),
          }),
          fetch('/api/picker-canonical-names'),
          fetch('/api/tiendas'),
          fetch(`/api/planilla-picker?fecha=${fecha}`),
        ]);
        const jOdoo = await rOdoo.json();
        if (!vivo) return;
        if (!jOdoo?.ok) { setError('No se pudo traer el día de Odoo'); return; }
        setCrudos(jOdoo.movimientos ?? []);

        // Los nombres: el endpoint devuelve filas con `key` y `display_name`.
        const jNombres = await rNombres.json().catch(() => null);
        const mapa: Record<string, string> = {};
        for (const r of (jNombres?.rows ?? jNombres?.data ?? jNombres?.names ?? [])) {
          if (r?.key) mapa[String(r.key)] = String(r.display_name ?? '');
        }
        if (vivo) setNombres(mapa);

        // El catálogo: de acá salen `sector_comuna`, `tipo` y `lat` para la zona.
        const jTiendas = await rTiendas.json().catch(() => null);
        const porCod: Record<string, FichaTienda> = {};
        for (const t of (jTiendas?.tiendas ?? [])) {
          if (t?.codigo) porCod[String(t.codigo)] = t as FichaTienda;
        }
        if (vivo) setFichas(porCod);

        // Las correcciones a mano. Si fallan, la hoja igual sirve: muestra lo que dice Odoo.
        const jCorr = await rCorr.json().catch(() => null);
        if (vivo && jCorr?.ok) {
          setGuardados((jCorr.filas ?? []).map((r: Record<string, unknown>): FilaGuardada => ({
            id: Number(r.id),
            ref: r.ref ? String(r.ref) : null,
            cod: String(r.cod ?? ''),
            seccion: String(r.seccion ?? '') as SeccionPlanilla,
            registrosOdoo: r.registros_odoo == null ? null : Number(r.registros_odoo),
            pickerOdoo: r.picker_odoo == null ? null : String(r.picker_odoo),
            asignadoEn: r.asignado_en == null ? null : String(r.asignado_en),
            registros: r.registros == null ? null : Number(r.registros),
            picker: r.picker == null ? null : String(r.picker),
          })));
        }
        if (vivo) { setError(null); setActualizado(new Date()); }
      } catch {
        if (vivo) setError('No se pudo traer el día de Odoo');
      } finally {
        setCargando(false);
      }
    }
  }, [claveFechas, fecha]);

  // Primera carga, y después cada 3 minutos — la MISMA cadencia que ya usa el resto de Picking
  // (`AUTO_REFRESH_MS`). No le agrega carga a Odoo: `getDayPickings` tiene caché de 30 s y dedup
  // en vuelo, así que varias pestañas abiertas comparten la misma consulta.
  //
  // Solo con la pestaña a la vista: refrescar contra Odoo una pantalla que nadie mira es gasto.
  useEffect(() => {
    void cargar();
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') void cargar();
    }, AUTO_REFRESH_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const tiendas = useMemo(
    () => cods.map(cod => {
      const f = fichas[cod];
      return { cod, zona: zonaPlanilla({ sector: f?.sector_comuna, lat: f?.lat, tipo: f?.tipo }) as ZonaPlanilla };
    }),
    [cods, fichas]);

  const movimientos: MovimientoPlanilla[] = useMemo(() => {
    if (!crudos) return [];
    const vivos = movimientosDesdeOdoo(crudos, nombres, diaPorTienda);
    // `conCorrecciones` necesita la referencia de Odoo para cruzar: las que no la tienen no se
    // pueden corregir y pasan tal cual.
    const conRef = vivos.filter((m): m is MovimientoPlanilla & { ref: string } => !!m.ref);
    const sinRef = vivos.filter(m => !m.ref);
    return [...conCorrecciones(conRef, guardados), ...sinRef];
  }, [crudos, nombres, diaPorTienda, guardados]);

  const planilla = useMemo(() => armarPlanilla(movimientos, tiendas), [movimientos, tiendas]);

  // Cuántos nombres se cambiaron a mano hoy. Va al pie: si no, habría que buscarlos a ojo.
  const corregidos = useMemo(
    () => movimientos.filter(m => m.origen === 'corregido').length,
    [movimientos]);

  // Solo lo que está en la hoja: los descartados no van al detalle.
  const delDia = useMemo(
    () => movimientos.filter(m => m.estado === 'done' || m.estado === 'assigned'),
    [movimientos]);

  // La lista de personas para elegir sale de Config · Pickers: escribir libre dejaría entrar dos
  // grafías del mismo nombre, y después esos dos no se pueden sumar en ninguna métrica.
  const personas = useMemo(
    () => [...new Set(Object.values(nombres).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [nombres]);

  const abrirCorreccion = useCallback(
    (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => {
      if (!celda.ref) return;
      setError(null);
      setCorrigiendo({
        ref: celda.ref, fecha, cod, seccion,
        pickerActual: celda.picker ?? '',
        pickerNuevo: '',
      });
    }, [fecha]);

  const guardarCorreccion = useCallback(async () => {
    if (!corrigiendo) return;
    const v = validarCorreccion(corrigiendo);
    if (!v.ok) { setError(v.motivo); return; }
    setGuardandoCorr(true);
    try {
      const r = await fetch('/api/planilla-picker', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corrigiendo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setError(j?.error ?? 'No se pudo guardar la corrección'); return; }
      setCorrigiendo(null);
      await cargar();
    } catch {
      setError('No se pudo guardar la corrección');
    } finally {
      setGuardandoCorr(false);
    }
  }, [corrigiendo, cargar]);

  const bajar = useCallback(() => {
    const texto = vista === 'planilla'
      ? csvVistaPlanilla(planilla, fecha)
      : csvVistaDetalle(delDia, fecha);
    // El BOM hace que Excel abra los acentos bien.
    const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planilla-${vista}-${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [vista, planilla, delDia, fecha]);

  const imprimir = useCallback(() => {
    const html = vista === 'planilla' ? htmlPlanilla(planilla, fecha) : htmlDetalle(delDia, fecha);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [vista, planilla, delDia, fecha]);

  if (error) return <div style={{ padding: 20, color: '#B91C1C' }}>{error}</div>;
  if (!crudos) return (
    <div style={{ padding: 20, display: 'flex', gap: 8, alignItems: 'center', color: '#475569' }}>
      <Loader2 size={16} /> Trayendo el día…
    </div>
  );

  return (
    // ── EL SCROLL ES UNO SOLO: EL DE ESTA CAJA ────────────────────────────────────────────────
    //
    // Hubo dos intentos antes. El primero dejaba que la hoja creciera al alto de sus 29 filas y el
    // `overflow-hidden` del panel cortaba las últimas: no se podía pasar de 75PUC, aunque la
    // impresión salía completa. El segundo le dio `flex: 1` a la tabla para que scrolleara adentro,
    // y arregló ese caso pero creó otro: en una ventana corta —o cuando los botones se parten en
    // dos líneas y la cabecera crece— la tabla se comprimía hasta cero, porque en una columna flex
    // los hijos encogen por defecto y `minHeight: 0` la dejaba desaparecer.
    //
    // Ahora scrollea la hoja entera y nada puede colapsar. La barra de botones va `sticky` para
    // seguir a mano con la tabla corrida, y cada bloque lleva `flexShrink: 0`.
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, flexShrink: 0, background: '#fff',
                    borderBottom: '1px solid #E2E8F0', padding: '14px 16px 11px',
                    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1.5px solid #CBD5E1', borderRadius: 10, overflow: 'hidden' }}>
          {(['planilla', 'detalle'] as Vista[]).map(v => (
            <button key={v} type="button" onClick={() => setVista(v)} style={{
              minHeight: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 700, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              background: vista === v ? '#1E40AF' : '#fff',
              color: vista === v ? '#fff' : '#475569',
            }}>{v === 'planilla' ? 'Planilla' : 'Detalle'}</button>
          ))}
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando}
                style={{ ...BTN_SEC, opacity: cargando ? 0.6 : 1 }}
                title="Volver a pedirle el día a Odoo">
          <RotateCcw size={15} style={cargando ? { animation: 'spin 1s linear infinite' } : undefined} />
          Actualizar
        </button>
        {actualizado && (
          <span style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap' }}>
            {horaChile(actualizado.toISOString())} · se actualiza sola cada 3 min
          </span>
        )}
        <button type="button" onClick={bajar} style={BTN_SEC}><Download size={15} /> Bajar archivo</button>
        <button type="button" onClick={imprimir} style={BTN_PRI}>
          <Printer size={15} /> {vista === 'planilla' ? 'Imprimir planilla' : 'Imprimir detalle'}
        </button>
      </div>

      {/* Las cinco zonas siempre: una que no aparece se leería como un dato que falta. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center',
                    flexShrink: 0, padding: '11px 16px 0' }}>
        {ZONAS.map(z => {
          const n = planilla.filas.filter(f => f.zona === z).length;
          const c = COLOR_ZONA[z];
          return (
            <span key={z} style={{
              display: 'inline-flex', gap: 5, alignItems: 'center', padding: '3px 9px',
              borderRadius: 6, fontSize: 11.5, fontWeight: 700,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
              opacity: n === 0 ? 0.4 : 1,
            }}>{c.label} <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.6 }}>{n}</span></span>
          );
        })}
      </div>

      {/* La tabla scrollea adentro para que su cabecera pueda quedar fija. `minHeight` es el piso
          que impide que se comprima a cero cuando la ventana es corta: ese fue el bug del 04/11. */}
      <div style={{ flex: 1, minHeight: 220, display: 'flex', padding: '11px 16px 0' }}>
        {vista === 'planilla'
          ? <TablaPlanilla planilla={planilla} onCorregir={abrirCorreccion} />
          : <TablaDetalle movimientos={delDia} />}
      </div>

      <div style={{ flexShrink: 0, margin: '11px 16px 16px',
                    fontSize: 12.5, color: '#78350F', background: '#FFFBEB',
                    border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px' }}>
        Fuera de la hoja: <strong>{planilla.descartados.anulados}</strong> anulados y{' '}
        <strong>{planilla.descartados.sinLiberar}</strong> sin stock liberado.
        {corregidos > 0 && (
          <> · <strong>{corregidos}</strong> {corregidos === 1 ? 'picker corregido' : 'pickers corregidos'} a mano.</>
        )}
      </div>

      {corrigiendo && (
        <CuadroCorreccion
          pedido={corrigiendo}
          personas={personas}
          guardando={guardandoCorr}
          onElegir={n => setCorrigiendo(c => (c ? { ...c, pickerNuevo: n } : c))}
          onCancelar={() => setCorrigiendo(null)}
          onConfirmar={() => void guardarCorreccion()}
        />
      )}
    </div>
  );
}

const BTN_BASE = {
  minHeight: 44, padding: '0 15px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
} as const;
const BTN_SEC = { ...BTN_BASE, background: '#fff', color: '#334155', border: '1.5px solid #CBD5E1' };
const BTN_PRI = { ...BTN_BASE, background: '#0F172A', color: '#fff', border: 'none' };

/** La matriz: una fila por tienda; una celda con varios movimientos los apila. */
function TablaPlanilla({ planilla, onCorregir }: {
  planilla: Planilla;
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
                  flex: 1, minHeight: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1020 }}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={TH_NUM}>#</th>
            <th style={TH}>Tienda</th>
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <th style={TH_DER}>{s === 'Chocolates' ? 'Choc.' : s}</th>
                <th style={TH_TENUE}>Usuario</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {planilla.filas.map((f, i) => {
            const c = COLOR_ZONA[f.zona];
            return (
              <tr key={f.cod} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={TD_NUM}>{i + 1}</td>
                <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700,
                    opacity: f.sinCarga ? 0.45 : 1,
                  }}>{f.cod}</span>
                </td>
                {SECCIONES.map(s => {
                  const celda = f.celdas[s];
                  const fondo = celda.length === 0 ? '#F8FAFC' : celda.length > 1 ? '#EFF6FF' : undefined;
                  return (
                    <Fragment key={s}>
                      <td style={{ ...TD_DER, background: fondo }}>
                        {celda.map((x, k) => <div key={k}>{x.registros}</div>)}
                      </td>
                      <td style={{ ...TD, background: fondo }}>
                        {celda.map((x, k) => (
                          <CeldaPicker key={k} celda={x} cod={f.cod} seccion={s}
                                       onCorregir={onCorregir} />
                        ))}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
          <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
            <td />
            <td style={{ ...TH, padding: '7px 10px' }}>Total</td>
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <td style={{ ...TD_DER, fontWeight: 800 }}>{planilla.totales[s]}</td>
                <td />
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** El detalle: una fila por movimiento, con horas y duración. */
function TablaDetalle({ movimientos }: { movimientos: MovimientoPlanilla[] }) {
  const filas = [...movimientos].sort(porAsignacion);
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
                  flex: 1, minHeight: 0, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            <th style={TH}>Tienda</th><th style={TH}>Sección</th><th style={TH}>Usuario</th>
            <th style={TH_DER}>Registros</th>
            <th style={TH}>Inicio</th><th style={TH}>Validado</th>
            <th style={TH_DER}>Duración</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m, i) => {
            const dur = duracionMinutos(m.asignadoEn, m.validadoEn);
            const largo = dur !== null && dur >= 180;
            return (
              <tr key={`${m.cod}-${m.seccion}-${i}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#1E40AF' }}>{m.cod}</td>
                <td style={TD}>{m.seccion}</td>
                <td style={m.picker ? TD : { ...TD, ...ESTILO_SIN_ASIGNAR }}>{m.picker || '— sin asignar'}</td>
                <td style={{ ...TD_DER, fontWeight: 700 }}>{m.registros}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.asignadoEn) || '—'}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.validadoEn) || '—'}</td>
                <td style={{ ...TD_DER, color: largo ? '#92400E' : '#475569',
                             background: largo ? '#FFFBEB' : undefined }}>
                  {formatearDuracion(dur)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// `sticky` va en cada celda y no en el `<thead>`: con `border-collapse: collapse` un thead
// pegado no funciona en todos los navegadores, y las celdas sí. El fondo es obligatorio, o las
// filas se ven por debajo al scrollear.
/**
 * El nombre de la celda, como botón.
 *
 * Es un botón y no un texto con onClick: así se llega con el teclado y los lectores de pantalla
 * dicen que se puede activar. Una celda sin referencia de Odoo —una línea agregada a mano— no se
 * puede corregir por acá y se muestra como texto.
 */
function CeldaPicker({ celda, cod, seccion, onCorregir }: {
  celda: CeldaPlanilla;
  cod: string;
  seccion: SeccionPlanilla;
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
}) {
  const corregido = celda.origen === 'corregido';
  const texto = celda.picker || '— sin asignar';
  if (!celda.ref) return <div style={celda.picker ? undefined : ESTILO_SIN_ASIGNAR}>{texto}</div>;
  return (
    <div>
      <button type="button" onClick={() => onCorregir(celda, cod, seccion)}
              title="Corregir quién hizo este movimiento"
              style={{
                background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
                textAlign: 'left', textDecorationLine: 'underline',
                textDecorationStyle: corregido ? 'solid' : 'dotted',
                textDecorationColor: corregido ? '#B45309' : '#CBD5E1',
                textUnderlineOffset: 3,
                ...(celda.picker ? { color: corregido ? '#92400E' : '#334155' } : ESTILO_SIN_ASIGNAR),
                ...(corregido ? { fontWeight: 700 } : null),
              }}>
        {texto}
      </button>
      {corregido && celda.pickerOdoo && (
        // El nombre original queda A LA VISTA: la hoja no reemplaza en silencio lo que dijo Odoo.
        <div style={{ fontSize: 10.5, color: '#B45309' }}>Odoo decía: {celda.pickerOdoo}</div>
      )}
    </div>
  );
}

/** El cuadro que pregunta antes de cambiar quién hizo un movimiento. */
function CuadroCorreccion({ pedido, personas, guardando, onElegir, onCancelar, onConfirmar }: {
  pedido: PedidoCorreccion;
  personas: string[];
  guardando: boolean;
  onElegir: (nombre: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const t = textoConfirmacion(pedido);
  const v = validarCorreccion(pedido);

  // Escape cierra. Un cuadro del que solo se sale con el mouse deja atrapado a quien usa teclado.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [onCancelar]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t.titulo}
         style={{ position: 'fixed', inset: 0, zIndex: 50,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* El fondo es un BOTÓN y no un div con onClick: así se alcanza con el teclado y los
          lectores de pantalla dicen qué hace. */}
      <button type="button" onClick={onCancelar} aria-label="Cerrar sin cambiar nada"
              style={{ position: 'absolute', inset: 0, border: 'none', cursor: 'default',
                       background: 'rgba(15,23,42,0.45)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: '20px 22px',
                    width: 420, maxWidth: '100%', boxShadow: '0 20px 50px rgba(15,23,42,0.3)' }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A', lineHeight: 1.25 }}>{t.titulo}</div>

        <div style={{ margin: '13px 0', padding: '11px 13px', background: '#F8FAFC',
                      border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13.5,
                      color: '#334155', lineHeight: 1.65 }}>
          {t.lineas.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 700, color: '#0F172A' } : undefined}>{l}</div>)}
        </div>

        <label htmlFor="pk-correccion-persona"
               style={{ display: 'block', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '.06em', color: '#64748B', marginBottom: 5 }}>
          Quién lo hizo de verdad
        </label>
        <select id="pk-correccion-persona" value={pedido.pickerNuevo} onChange={e => onElegir(e.target.value)}
                style={{ width: '100%', minHeight: 44, padding: '0 10px', fontSize: 14,
                         fontFamily: 'inherit', borderRadius: 10, border: '1.5px solid #CBD5E1' }}>
          <option value="">Elegir persona…</option>
          {personas.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div style={{ margin: '13px 0 16px', padding: '10px 13px', background: '#FFFBEB',
                      border: '1px solid #FDE68A', borderRadius: 10, fontSize: 12.5,
                      color: '#78350F', lineHeight: 1.55 }}>
          {t.aviso}
        </div>

        {!v.ok && pedido.pickerNuevo.trim() !== '' && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: '#B91C1C' }}>{v.motivo}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancelar} style={BTN_SEC}>Cancelar</button>
          <button type="button" onClick={onConfirmar} disabled={!v.ok || guardando}
                  style={{ ...BTN_PRI, opacity: (!v.ok || guardando) ? 0.5 : 1 }}>
            {guardando ? 'Guardando…' : 'Sí, cambiarlo'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TH       = { position: 'sticky', top: 0, zIndex: 1, background: '#F8FAFC',
                   padding: '7px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                   letterSpacing: '.06em', color: '#475569', textAlign: 'left',
                   boxShadow: 'inset 0 -2px 0 #E2E8F0' } as const;
const TH_TENUE = { ...TH, color: '#94A3B8' } as const;
const TH_DER   = { ...TH, textAlign: 'right', padding: '7px 6px' } as const;
const TH_NUM   = { ...TH, textAlign: 'center', padding: '7px 4px', color: '#64748B' } as const;
const TD       = { padding: '6px 10px', color: '#334155', verticalAlign: 'top' } as const;
const TD_DER   = { padding: '6px', textAlign: 'right', color: '#0F172A', verticalAlign: 'top',
                   fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as const;
const TD_NUM   = { padding: '6px 4px', textAlign: 'center', color: '#94A3B8', fontSize: 10.5,
                   verticalAlign: 'top' } as const;
const ESTILO_SIN_ASIGNAR = { color: '#B45309', fontStyle: 'italic', fontWeight: 600 } as const;

/** Escapa lo que va al HTML de impresión: los nombres y los códigos vienen de Odoo. */
function esc(s: string | number): string {
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
}

/** En papel los nombres se abrevian: «Cristobal Labra» → «C. Labra». */
function corto(s: string): string {
  const p = s.trim().split(/\s+/);
  return p.length < 2 ? s : `${p[0][0]}. ${p.slice(1).join(' ')}`;
}

const CSS_IMPRESION = `
  @page { size: letter landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Barlow, system-ui, sans-serif; color: #111827; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #9CA3AF; padding: 1px 4px; text-align: left; vertical-align: top; }
  th { background: #DBEAFE; font-size: 7.5px; font-weight: 800; text-transform: uppercase;
       letter-spacing: .03em; border-color: #111827; }
  .der { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cod { font-family: ui-monospace, monospace; font-weight: 700; }
  .nada { background: #E5E7EB; }
  .cab { display: flex; align-items: flex-end; justify-content: space-between;
         border-bottom: 2px solid #111827; padding-bottom: 5px; margin-bottom: 7px; }
  .firmas { display: flex; gap: 22px; margin-top: 12px; }
  .firma { width: 180px; }
  .firma .linea { height: 22px; border-bottom: 1px solid #111827; }
  .firma .rot { font-size: 8px; font-weight: 700; text-transform: uppercase;
                letter-spacing: .06em; margin-top: 2px; }
`;

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function cabecera(fecha: string, titulo: string, resumen: string): string {
  // Mediodía para que el día no se corra por zona horaria, igual que `bandaApertura.ts`.
  const d = new Date(fecha + 'T12:00:00');
  const dia = DIAS[d.getDay()] ?? '';
  const largo = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="cab">
    <div><strong style="font-size:22px;letter-spacing:.04em">${esc(dia)}</strong>
      <span style="font-size:13px;margin-left:10px">${esc(largo)} · ${esc(titulo)}</span></div>
    <div style="text-align:right;font-size:9.5px">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:.07em">Kios Club · CD Recoleta</div>
      <div>${esc(resumen)}</div></div>
  </div>`;
}

const FIRMAS = `<div class="firmas">
  <div style="flex:1;font-size:8.5px;line-height:1.45">Una fila por tienda. Cuando una sección tiene
  dos movimientos van apilados en la misma celda. El color de la tienda es su zona, el mismo del
  calendario impreso. Las celdas en gris no llevan carga.</div>
  <div class="firma"><div class="linea"></div><div class="rot">Supervisor de Picking</div></div>
  <div class="firma"><div class="linea"></div><div class="rot">Coordinador</div></div>
</div>`;

/** La hoja horizontal de la vista PLANILLA. */
function htmlPlanilla(p: Planilla, fecha: string): string {
  const th = ['<th style="width:18px">#</th>', '<th style="width:52px">Tienda</th>'];
  for (const s of SECCIONES) {
    th.push(`<th class="der" style="width:32px">${esc(s === 'Chocolates' ? 'Choc.' : s)}</th>`);
    th.push('<th>Usuario</th>');
  }

  const trs = p.filas.map((f, i) => {
    const c = COLOR_ZONA[f.zona];
    const tds = [
      `<td style="text-align:center;font-size:7.5px;color:#6B7280">${i + 1}</td>`,
      `<td class="cod" style="background:${c.bg};color:${c.text};border-left:3px solid ${c.border}">${esc(f.cod)}</td>`,
    ];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      const clase = celda.length === 0 ? 'nada' : '';
      tds.push(`<td class="der ${clase}">${celda.map(x => esc(x.registros)).join('<br>')}</td>`);
      tds.push(`<td class="${clase}" style="font-size:9px">${
        celda.map(x => esc(x.picker ? corto(x.picker) : '—')).join('<br>')}</td>`);
    }
    return '<tr>' + tds.join('') + '</tr>';
  });

  const tot = ['<td></td>', '<td style="font-size:8px;font-weight:800">TOTAL</td>'];
  for (const s of SECCIONES) { tot.push(`<td class="der">${p.totales[s]}</td>`); tot.push('<td></td>'); }

  const conCarga = p.filas.filter(f => !f.sinCarga).length;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Planilla ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco', `${p.filas.length} tiendas · ${conCarga} con carga`)}
    <table><thead><tr>${th.join('')}</tr></thead><tbody>${trs.join('')}
      <tr style="background:#E8EDF3">${tot.join('')}</tr></tbody></table>
    ${FIRMAS}</body></html>`;
}

/** La lista con horas de la vista DETALLE. */
function htmlDetalle(movs: MovimientoPlanilla[], fecha: string): string {
  const trs = [...movs].sort(porAsignacion).map(m => `<tr>
      <td class="cod">${esc(m.cod)}</td>
      <td>${esc(m.seccion)}</td>
      <td>${esc(m.picker || '—')}</td>
      <td class="der">${m.registros}</td>
      <td>${esc(horaChile(m.asignadoEn) || '—')}</td>
      <td>${esc(horaChile(m.validadoEn) || '—')}</td>
      <td class="der">${esc(formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)))}</td>
    </tr>`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Detalle ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco · detalle', `${movs.length} movimientos`)}
    <table><thead><tr><th>Tienda</th><th>Sección</th><th>Usuario</th><th class="der">Registros</th>
      <th>Inicio</th><th>Validado</th><th class="der">Duración</th></tr></thead>
      <tbody>${trs.join('')}</tbody></table>
    ${FIRMAS}</body></html>`;
}
