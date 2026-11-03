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
import { Printer, Download, Loader2 } from 'lucide-react';
import { fechaISOLocal } from '@/features/despacho/shared/fechaLocal';
import { agruparConsultasPorDia } from '@/features/despacho/shared/consultasPorDia';
import { armarPlanilla, SECCIONES, porAsignacion, type MovimientoPlanilla, type Planilla } from '../planilla/armarPlanilla';
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

  useEffect(() => {
    if (!claveFechas) { setCrudos([]); return; }
    const fechas = claveFechas.split(',');
    let vivo = true;
    (async () => {
      try {
        const [rOdoo, rNombres, rTiendas] = await Promise.all([
          fetch('/api/odoo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'planilla_dia', fechas }),
          }),
          fetch('/api/picker-canonical-names'),
          fetch('/api/tiendas'),
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
      } catch {
        if (vivo) setError('No se pudo traer el día de Odoo');
      }
    })();
    return () => { vivo = false; };
  }, [claveFechas]);

  const tiendas = useMemo(
    () => cods.map(cod => {
      const f = fichas[cod];
      return { cod, zona: zonaPlanilla({ sector: f?.sector_comuna, lat: f?.lat, tipo: f?.tipo }) as ZonaPlanilla };
    }),
    [cods, fichas]);

  const movimientos: MovimientoPlanilla[] = useMemo(
    () => (crudos ? movimientosDesdeOdoo(crudos, nombres, diaPorTienda) : []),
    [crudos, nombres, diaPorTienda]);

  const planilla = useMemo(() => armarPlanilla(movimientos, tiendas), [movimientos, tiendas]);

  // Solo lo que está en la hoja: los descartados no van al detalle.
  const delDia = useMemo(
    () => movimientos.filter(m => m.estado === 'done' || m.estado === 'assigned'),
    [movimientos]);

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
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <button type="button" onClick={bajar} style={BTN_SEC}><Download size={15} /> Bajar archivo</button>
        <button type="button" onClick={imprimir} style={BTN_PRI}>
          <Printer size={15} /> {vista === 'planilla' ? 'Imprimir planilla' : 'Imprimir detalle'}
        </button>
      </div>

      {/* Las cinco zonas siempre: una que no aparece se leería como un dato que falta. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {vista === 'planilla'
        ? <TablaPlanilla planilla={planilla} />
        : <TablaDetalle movimientos={delDia} />}

      <div style={{ fontSize: 12.5, color: '#78350F', background: '#FFFBEB',
                    border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px' }}>
        Fuera de la hoja: <strong>{planilla.descartados.anulados}</strong> anulados y{' '}
        <strong>{planilla.descartados.sinLiberar}</strong> sin stock liberado.
      </div>
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
function TablaPlanilla({ planilla }: { planilla: Planilla }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11, overflowX: 'auto' }}>
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
                          <div key={k} style={x.picker ? undefined : ESTILO_SIN_ASIGNAR}>
                            {x.picker || '— sin asignar'}
                          </div>
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
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11, overflowX: 'auto' }}>
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

const TH       = { padding: '7px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                   letterSpacing: '.06em', color: '#475569', textAlign: 'left' } as const;
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
