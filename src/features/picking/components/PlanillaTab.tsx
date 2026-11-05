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
import { createPortal } from 'react-dom';
import { Printer, Download, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { AUTO_REFRESH_MS } from '../picking-types';
import { fechaISOLocal } from '@/features/despacho/shared/fechaLocal';
import { agruparConsultasPorDia } from '@/features/despacho/shared/consultasPorDia';
import { armarPlanilla, SECCIONES, porAsignacion, type CeldaPlanilla, type MovimientoPlanilla, type Planilla, type SeccionPlanilla } from '../planilla/armarPlanilla';
import { conCorrecciones, type FilaGuardada } from '../planilla/conCorrecciones';
import { validarCorreccion, textoConfirmacion, type PedidoCorreccion } from '../planilla/correccionPicker';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../planilla/desdeOdoo';
import { COLOR_ZONA, ZONAS, zonaPlanilla, type ZonaPlanilla } from '../planilla/zonaPlanilla';
import { contarPorZona, describirFiltro, filtrarMovimientos, filtrarPlanilla, sinFiltro,
         type FiltroPlanilla } from '../planilla/filtrarPlanilla';
import { marcaBackorder, textoBackorder, tituloBackorder } from '../planilla/backorders';
import { horaChile, duracionMinutos, formatearDuracion } from '../planilla/horasPlanilla';
import { csvVistaPlanilla, csvVistaDetalle } from '../planilla/csvPlanilla';

export interface PlanillaTabProps {
  /** Los códigos de las tiendas del día, en el orden del calendario. */
  cods: string[];
  /** `cod → día de sus movimientos en Odoo`, solo para las tiendas de apertura. */
  aperturas: ReadonlyMap<string, string>;
}

type Vista = 'planilla' | 'detalle';
interface FichaTienda {
  codigo: string; sector_comuna?: string | null; tipo?: string | null; lat?: number | null;
  /** Para el buscador: escribir «peñalolen» encuentra 23PEÑ sin saberse el código. */
  nombre?: string | null;
}

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
  // El buscador y las zonas elegidas. `zonas` vacío = todas (ver `filtrarPlanilla`).
  const [texto, setTexto] = useState('');
  const [zonas, setZonas] = useState<ReadonlySet<ZonaPlanilla>>(() => new Set());
  // El cuadro va por PORTAL a document.body. Sin eso queda DENTRO de la pestaña, y el AppShell
  // tiene `overflow: hidden` y un `transform`: un transform en un ancestro rompe el
  // `position: fixed` —el elemento se posiciona contra ese ancestro, no contra la ventana— así
  // que el cuadro se abría recortado y no se veía. Es el mismo motivo por el que PickingScreen
  // portea sus etiquetas de impresión; su comentario lo dice.
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);

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

  const zonaPorCod = useMemo(
    () => new Map(tiendas.map(t => [t.cod, t.zona])),
    [tiendas]);

  const nombrePorCod = useMemo(() => {
    const m = new Map<string, string>();
    for (const [cod, ficha] of Object.entries(fichas)) {
      if (ficha.nombre) m.set(cod, String(ficha.nombre));
    }
    return m;
  }, [fichas]);

  const movimientos: MovimientoPlanilla[] = useMemo(() => {
    if (!crudos) return [];
    const vivos = movimientosDesdeOdoo(crudos, nombres, diaPorTienda);
    // `conCorrecciones` necesita la referencia de Odoo para cruzar: las que no la tienen no se
    // pueden corregir y pasan tal cual.
    const conRef = vivos.filter((m): m is MovimientoPlanilla & { ref: string } => !!m.ref);
    const sinRef = vivos.filter(m => !m.ref);
    return [...conCorrecciones(conRef, guardados), ...sinRef];
  }, [crudos, nombres, diaPorTienda, guardados]);

  const planillaCompleta = useMemo(() => armarPlanilla(movimientos, tiendas), [movimientos, tiendas]);

  const filtro: FiltroPlanilla = useMemo(() => ({ texto, zonas }), [texto, zonas]);
  const filtrando = !sinFiltro(filtro);

  const planilla = useMemo(
    () => filtrarPlanilla(planillaCompleta, filtro, nombrePorCod),
    [planillaCompleta, filtro, nombrePorCod]);

  // Las pastillas cuentan sobre la hoja COMPLETA. Si contaran sobre la filtrada, al elegir Ruta
  // Norte las otras cuatro dirían 0 y no habría forma de volver a ellas.
  const porZona = useMemo(() => contarPorZona(planillaCompleta), [planillaCompleta]);
  const limpiar = useCallback(() => { setTexto(''); setZonas(new Set()); }, []);

  // Tocar una zona la suma o la saca. Varias a la vez son la unión: así se puede mirar Norte y
  // Costa juntas, que es como salen los camiones.
  const alternarZona = useCallback((z: ZonaPlanilla) => {
    setZonas(prev => {
      const n = new Set(prev);
      if (n.has(z)) n.delete(z); else n.add(z);
      return n;
    });
  }, []);

  // Cuántos nombres se cambiaron a mano hoy. Va al pie: si no, habría que buscarlos a ojo.
  const corregidos = useMemo(
    () => movimientos.filter(m => m.origen === 'corregido').length,
    [movimientos]);

  // Cuántas líneas de la hoja son el resto de un movimiento ya validado. Se cuenta sobre los que
  // ENTRAN a la hoja, no sobre todos: el 05/11 había 92 backorders en Odoo y solo 15 llegaban a
  // la pantalla —el resto eran `cancel` o `confirmed`—, así que el 92 no diría nada de lo que
  // se está mirando.
  const restos = useMemo(
    () => movimientos.filter(m =>
      m.backorderDe && (m.estado === 'done' || m.estado === 'assigned')).length,
    [movimientos]);

  // Solo lo que está en la hoja: los descartados no van al detalle. Y el mismo filtro que la
  // matriz: las dos vistas tienen que mostrar el mismo recorte del día.
  const delDia = useMemo(
    () => filtrarMovimientos(
      movimientos.filter(m => m.estado === 'done' || m.estado === 'assigned'),
      filtro, zonaPorCod, nombrePorCod),
    [movimientos, filtro, zonaPorCod, nombrePorCod]);

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
    // «parcial» en el nombre: un archivo al que le faltan tiendas y no lo dice se abre en una
    // semana como si fuera el día completo. El texto buscado no va en el nombre —puede traer
    // cualquier caracter—, pero el aviso sí.
    a.download = `planilla-${vista}-${fecha}${filtrando ? '-parcial' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [vista, planilla, delDia, fecha, filtrando]);

  const imprimir = useCallback(() => {
    const recorte = describirFiltro(filtro);
    const html = vista === 'planilla'
      ? htmlPlanilla(planilla, fecha, recorte)
      : htmlDetalle(delDia, fecha, recorte);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [vista, planilla, delDia, fecha, filtro]);

  // Un refresco fallido NO borra la hoja. Antes cualquier error reemplazaba todo por un mensaje
  // rojo: una sesión que caducó un momento, y el coordinador perdía la planilla que estaba
  // mirando. Si hay datos, se siguen mostrando y el aviso va arriba diciendo de cuándo son.
  if (error && !crudos) return <div style={{ padding: 20, color: '#B91C1C' }}>{error}</div>;
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
      {/* La leyenda va en ESTA fila y no en una propia: una fila sola para cinco pastillas chicas
          costaba unos 30 px de alto que las tiendas necesitan. Con `flexWrap` baja sola si la
          ventana es angosta. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, flexShrink: 0, background: '#fff',
                    borderBottom: '1px solid #E2E8F0', padding: '9px 16px 8px',
                    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1.5px solid #CBD5E1', borderRadius: 9, overflow: 'hidden' }}>
          {(['planilla', 'detalle'] as Vista[]).map(v => (
            <button key={v} type="button" onClick={() => setVista(v)} style={{
              minHeight: 36, padding: '0 14px', fontSize: 13, fontWeight: 700, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              background: vista === v ? '#1E40AF' : '#fff',
              color: vista === v ? '#fff' : '#475569',
            }}>{v === 'planilla' ? 'Planilla' : 'Detalle'}</button>
          ))}
        </div>
        {/* El buscador calza contra el código y el nombre, y sin acentos: escribir «pen»
            encuentra 23PEÑ. Escape lo limpia sin tener que ir al botón. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            type="text" value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setTexto(''); }}
            placeholder="Buscar tienda…" aria-label="Buscar tienda por código o nombre"
            style={{ minHeight: 36, width: 168, padding: texto ? '0 28px 0 28px' : '0 10px 0 28px',
                     fontSize: 13, fontFamily: 'inherit', borderRadius: 9,
                     border: `1.5px solid ${texto ? '#1E40AF' : '#CBD5E1'}` }} />
          {texto && (
            <button type="button" onClick={() => setTexto('')} aria-label="Limpiar la búsqueda"
                    style={{ position: 'absolute', right: 5, display: 'flex', padding: 3,
                             border: 'none', background: 'transparent', cursor: 'pointer',
                             color: '#64748B', borderRadius: 5 }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando}
                style={{ ...BTN_SEC, opacity: cargando ? 0.6 : 1 }}
                title="Volver a pedirle el día a Odoo">
          <RotateCcw size={15} style={cargando ? { animation: 'spin 1s linear infinite' } : undefined} />
          Actualizar
        </button>
        {actualizado && (
          <span style={{ fontSize: 11.5, color: error ? '#B91C1C' : '#64748B', whiteSpace: 'nowrap' }}
                title="Se actualiza sola cada 3 minutos con la pestaña a la vista. Odoo cachea 30 segundos, así que un cambio puede tardar hasta unos 3 minutos y medio en verse.">
            Datos de las {horaChile(actualizado.toISOString())}
            {error ? ' · sin actualizar' : ' · cada 3 min'}
          </span>
        )}
        <button type="button" onClick={bajar} style={BTN_SEC}><Download size={15} /> Bajar archivo</button>
        <button type="button" onClick={imprimir} style={BTN_PRI}>
          <Printer size={15} /> {vista === 'planilla' ? 'Imprimir planilla' : 'Imprimir detalle'}
        </button>

        <span style={{ width: 1, alignSelf: 'stretch', background: '#E2E8F0', margin: '0 3px' }} />

        {/* Las cinco zonas son la leyenda Y el filtro: el color ya enseña qué es cada una, así
            que agregarles el clic no cuesta ninguna fila más de pantalla. Se pueden tocar
            varias —Norte y Costa juntas, como salen los camiones— y «Todas» las suelta.

            Las cinco están siempre, incluso en cero: una zona que desaparece se leería como un
            dato que falta. En cero va apagada y sin clic, porque filtrar por ella dejaría la
            hoja vacía sin que se entienda por qué. */}
        <button type="button" onClick={() => setZonas(new Set())}
                aria-pressed={zonas.size === 0}
                title="Ver las cinco zonas del día"
                style={{
                  ...PASTILLA, cursor: 'pointer',
                  background: zonas.size === 0 ? '#0F172A' : '#fff',
                  color: zonas.size === 0 ? '#fff' : '#475569',
                  border: `1px solid ${zonas.size === 0 ? '#0F172A' : '#CBD5E1'}`,
                }}>
          Todas <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.6 }}>{planillaCompleta.filas.length}</span>
        </button>
        {ZONAS.map(z => {
          const n = porZona[z];
          const c = COLOR_ZONA[z];
          const on = zonas.has(z);
          return (
            <button key={z} type="button" onClick={() => alternarZona(z)}
                    disabled={n === 0} aria-pressed={on}
                    title={n === 0 ? `Hoy no hay tiendas de ${c.label}`
                                   : on ? `Dejar de filtrar por ${c.label}`
                                        : `Ver solo ${c.label}`}
                    style={{
                      ...PASTILLA, background: c.bg, color: c.text,
                      cursor: n === 0 ? 'default' : 'pointer',
                      border: `1px solid ${on ? c.text : c.border}`,
                      boxShadow: on ? `inset 0 0 0 1px ${c.text}` : undefined,
                      opacity: n === 0 ? 0.4 : 1,
                    }}>
              {c.label} <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.6 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Mientras hay filtro, lo que se ve NO es el día: eso tiene que estar dicho en pantalla
          y no deducirse de que faltan filas. Dice cuántas de cuántas, y suelta el filtro de un
          clic. */}
      {filtrando && (
        <div role="status" style={{ flexShrink: 0, margin: '9px 16px 0', padding: '7px 12px',
                                    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                                    borderRadius: 9, fontSize: 12.5, color: '#1E3A8A' }}>
          <span>
            Filtrado por <strong>{describirFiltro(filtro)}</strong>:{' '}
            <strong>{planilla.filas.length}</strong> de {planillaCompleta.filas.length} tiendas
            {vista === 'detalle' && <> · <strong>{delDia.length}</strong> movimientos</>}
          </span>
          <button type="button" onClick={limpiar}
                  style={{ ...PASTILLA, marginLeft: 'auto', cursor: 'pointer', background: '#fff',
                           color: '#1E40AF', border: '1px solid #93C5FD' }}>
            Ver el día completo
          </button>
        </div>
      )}

      {error && crudos && (
        <div role="status" style={{ flexShrink: 0, margin: '11px 16px 0', padding: '9px 13px',
                                    background: '#FEF2F2', border: '1px solid #FECACA',
                                    borderRadius: 10, fontSize: 12.5, color: '#991B1B',
                                    lineHeight: 1.5 }}>
          <strong>No se pudo actualizar.</strong> {error} Lo que ves es de las{' '}
          {actualizado ? horaChile(actualizado.toISOString()) : '—'} y puede estar desactualizado:
          un movimiento anulado o recién asignado todavía no se refleja.
        </div>
      )}

      {/* La tabla scrollea adentro para que su cabecera pueda quedar fija. `minHeight` es el piso
          que impide que se comprima a cero cuando la ventana es corta: ese fue el bug del 04/11. */}
      <div style={{ flex: 1, minHeight: 220, display: 'flex', padding: '9px 16px 0' }}>
        {filtrando && (vista === 'planilla' ? planilla.filas.length : delDia.length) === 0
          ? (
            // Una tabla con la cabecera y ninguna fila no dice por qué está vacía, y con un
            // filtro puesto la explicación es justamente el filtro.
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10,
                          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
                          padding: 24, color: '#475569' }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>
                Ninguna tienda del día calza con {describirFiltro(filtro)}
              </div>
              <div style={{ fontSize: 12.5, maxWidth: 420, lineHeight: 1.55 }}>
                El día tiene {planillaCompleta.filas.length}{' '}
                {planillaCompleta.filas.length === 1 ? 'tienda' : 'tiendas'}. El buscador mira el
                código y el nombre, sin importar acentos ni mayúsculas.
              </div>
              <button type="button" onClick={limpiar} style={BTN_PRI}>Ver el día completo</button>
            </div>
          )
          : vista === 'planilla'
            ? <TablaPlanilla planilla={planilla} onCorregir={abrirCorreccion} />
            : <TablaDetalle movimientos={delDia} onCorregir={abrirCorreccion} />}
      </div>

      <div style={{ flexShrink: 0, margin: '9px 16px 12px',
                    fontSize: 12.5, color: '#78350F', background: '#FFFBEB',
                    border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px' }}>
        Fuera de la hoja: <strong>{planilla.descartados.anulados}</strong> anulados y{' '}
        <strong>{planilla.descartados.sinLiberar}</strong> sin stock liberado.
        {corregidos > 0 && (
          <> · <strong>{corregidos}</strong> {corregidos === 1 ? 'picker corregido' : 'pickers corregidos'} a mano.</>
        )}
        {restos > 0 && (
          // Dicho al pie porque la marca ↳ de la celda no alcanza para contarlas de un vistazo.
          <> · <strong>{restos}</strong> {restos === 1 ? 'línea es' : 'líneas son'} el resto de un
          movimiento ya validado (↳), no trabajo sin empezar.</>
        )}
      </div>

      {montado && corrigiendo && createPortal(
        <CuadroCorreccion
          pedido={corrigiendo}
          personas={personas}
          guardando={guardandoCorr}
          onElegir={n => setCorrigiendo(c => (c ? { ...c, pickerNuevo: n } : c))}
          onCancelar={() => setCorrigiendo(null)}
          onConfirmar={() => void guardarCorreccion()}
        />,
        document.body,
      )}
    </div>
  );
}

// 36 px y no 44: los 44 son la guía para dedos, y esta pantalla se opera con mouse. Debajo de 32
// ya cuesta apuntar. Los 8 px que se ahorran por botón son alto para las tiendas.
const BTN_BASE = {
  minHeight: 36, padding: '0 13px', borderRadius: 9, fontSize: 13, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
} as const;
const BTN_SEC = { ...BTN_BASE, background: '#fff', color: '#334155', border: '1.5px solid #CBD5E1' };
// Las pastillas de zona. Son botones, así que les toca el reset que los `<span>` no necesitaban:
// sin `font` heredado un botón sale con la tipografía del sistema y la fila de zonas se desalinea.
const PASTILLA = {
  display: 'inline-flex', gap: 5, alignItems: 'center', padding: '2px 8px', borderRadius: 6,
  fontSize: 11, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1.6,
} as const;
const BTN_PRI = { ...BTN_BASE, background: '#0F172A', color: '#fff', border: 'none' };

/** La matriz: una fila por tienda; una celda con varios movimientos los apila. */
function TablaPlanilla({ planilla, onCorregir }: {
  planilla: Planilla;
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
}) {
  return (
    // `pk-hoja` trae el resalte de la fila al pasar el mouse (marco.css). Los fondos de celda van
    // por clase y no en línea: un estilo en línea le gana a cualquier selector, así que en línea
    // tapaban el resalte justo en las celdas grises.
    <div className="pk-hoja" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
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
              <tr key={f.cod} className="fila" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={TD_NUM}>{i + 1}</td>
                <td style={{ padding: '4px 10px', verticalAlign: 'top' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700,
                    opacity: f.sinCarga ? 0.45 : 1,
                  }}>{f.cod}</span>
                </td>
                {SECCIONES.map(s => {
                  const celda = f.celdas[s];
                  const clase = celda.length === 0 ? 'vacia' : celda.length > 1 ? 'doble' : undefined;
                  return (
                    <Fragment key={s}>
                      <td className={clase} style={TD_DER}>
                        {celda.map((x, k) => <div key={k}>{x.registros}</div>)}
                      </td>
                      <td className={clase} style={TD}>
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
function TablaDetalle({ movimientos, onCorregir }: {
  movimientos: MovimientoPlanilla[];
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
}) {
  const filas = [...movimientos].sort(porAsignacion);
  return (
    <div className="pk-hoja" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
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
              <tr key={`${m.cod}-${m.seccion}-${i}`} className="fila"
                  style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#1E40AF' }}>{m.cod}</td>
                <td style={TD}>{m.seccion}</td>
                <td style={TD}>
                  {/* El mismo botón que en la matriz: el picker se corrige desde las dos vistas. */}
                  <CeldaPicker
                    celda={{ registros: m.registros, picker: m.picker, ref: m.ref,
                             id: m.id, origen: m.origen, pickerOdoo: m.pickerOdoo }}
                    cod={m.cod} seccion={m.seccion} onCorregir={onCorregir} />
                </td>
                <td style={{ ...TD_DER, fontWeight: 700 }}>{m.registros}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.asignadoEn) || '—'}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.validadoEn) || '—'}</td>
                <td className={largo ? 'largo' : undefined}
                    style={{ ...TD_DER, color: largo ? '#92400E' : '#475569' }}>
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
  const bo = celda.backorderDe;
  // Un backorder sin picker NO es trabajo sin empezar: es lo que quedó de un movimiento que ya se
  // validó, y Odoo lo creó solo. Mostrarlo como «— sin asignar» en naranja era leerlo al revés.
  const texto = celda.picker || (bo ? `↳ ${textoBackorder(bo)}` : '— sin asignar');
  const estiloTexto = celda.picker ? undefined : bo ? ESTILO_RESTO : ESTILO_SIN_ASIGNAR;
  if (!celda.ref) return <div style={estiloTexto}>{texto}</div>;
  return (
    <div>
      {/* Se ve que se puede tocar: borde punteado y fondo al pasar por encima. Antes era un
          subrayado fino que se leía como texto común y nadie adivinaba que era un botón. */}
      <button type="button" onClick={() => onCorregir(celda, cod, seccion)}
              title={bo
                // Las dos cosas: qué es esta línea Y que se puede tocar. Dejando solo la
                // explicación del resto, la celda perdía la única señal de que es un botón.
                ? `${tituloBackorder(bo)} · Tocar para corregir quién lo hizo.`
                : 'Tocar para corregir quién hizo este movimiento'}
              style={{
                font: 'inherit', cursor: 'pointer', textAlign: 'left',
                padding: '1px 5px', marginLeft: -5, borderRadius: 5,
                border: `1px dashed ${corregido ? '#FCD34D' : '#CBD5E1'}`,
                background: corregido ? '#FFFBEB' : 'transparent',
                ...(celda.picker ? { color: corregido ? '#92400E' : '#334155' } : estiloTexto),
                ...(corregido ? { fontWeight: 700 } : null),
              }}>
        {texto}
      </button>
      {bo && celda.picker && (
        // Con picker, el nombre manda y la marca va debajo: igual hay que saber que esta línea
        // es el resto de otra y no un segundo movimiento entero.
        <div title={tituloBackorder(bo)} style={{ fontSize: 10.5, color: '#1E40AF' }}>
          ↳ {textoBackorder(bo)}
        </div>
      )}
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
// 4 px de relleno y no 6: son 4 px menos por tienda y con 29 filas se nota al scrollear. El alto
// de la celda lo sigue fijando el botón del picker, que tiene su propio borde.
const TD       = { padding: '4px 10px', color: '#334155', verticalAlign: 'top' } as const;
const TD_DER   = { padding: '4px 6px', textAlign: 'right', color: '#0F172A', verticalAlign: 'top',
                   fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as const;
const TD_NUM   = { padding: '4px 4px', textAlign: 'center', color: '#94A3B8', fontSize: 10.5,
                   verticalAlign: 'top' } as const;
const ESTILO_SIN_ASIGNAR = { color: '#B45309', fontStyle: 'italic', fontWeight: 600 } as const;
// Azul y no el naranja de «sin asignar»: el naranja es la alarma de trabajo que nadie tomó, y un
// resto de un movimiento ya validado no es eso.
const ESTILO_RESTO = { color: '#1E40AF', fontWeight: 600 } as const;

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
  /* Una hoja filtrada se firma igual que una completa: si no dice que le faltan tiendas, el
     que la recibe no tiene cómo saberlo. Por eso el aviso es una banda y no una nota al pie. */
  .recorte { background: #FEF3C7; border: 1.5px solid #D97706; border-radius: 3px;
             padding: 3px 7px; margin-bottom: 7px; font-size: 9.5px; letter-spacing: .02em; }
`;

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function cabecera(fecha: string, titulo: string, resumen: string, recorte = ''): string {
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
  </div>
  ${recorte ? `<div class="recorte"><strong>HOJA PARCIAL</strong> · solo ${esc(recorte)} ·
    no es el día completo</div>` : ''}`;
}

const FIRMAS = `<div class="firmas">
  <div style="flex:1;font-size:8.5px;line-height:1.45">Una fila por tienda. Cuando una sección tiene
  dos movimientos van apilados en la misma celda. El color de la tienda es su zona, el mismo del
  calendario impreso. Las celdas en gris no llevan carga.
  <strong>↳4</strong> = esa línea es el resto de un movimiento que ya se validó con 4 registros;
  Odoo lo creó solo al validar, no es trabajo sin empezar.</div>
  <div class="firma"><div class="linea"></div><div class="rot">Supervisor de Picking</div></div>
  <div class="firma"><div class="linea"></div><div class="rot">Coordinador</div></div>
</div>`;

/** La hoja horizontal de la vista PLANILLA. */
function htmlPlanilla(p: Planilla, fecha: string, recorte = ''): string {
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
        celda.map(x => {
          // La marca ↳4 va ANTES del nombre: en papel la columna es angosta y lo primero que se
          // lee tiene que ser que esta línea quedó de otra.
          const m = x.backorderDe ? esc(marcaBackorder(x.backorderDe)) + ' ' : '';
          return m + esc(x.picker ? corto(x.picker) : x.backorderDe ? '' : '—');
        }).join('<br>')}</td>`);
    }
    return '<tr>' + tds.join('') + '</tr>';
  });

  const tot = ['<td></td>', '<td style="font-size:8px;font-weight:800">TOTAL</td>'];
  for (const s of SECCIONES) { tot.push(`<td class="der">${p.totales[s]}</td>`); tot.push('<td></td>'); }

  const conCarga = p.filas.filter(f => !f.sinCarga).length;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Planilla ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco', `${p.filas.length} tiendas · ${conCarga} con carga`, recorte)}
    <table><thead><tr>${th.join('')}</tr></thead><tbody>${trs.join('')}
      <tr style="background:#E8EDF3">${tot.join('')}</tr></tbody></table>
    ${FIRMAS}</body></html>`;
}

/** La lista con horas de la vista DETALLE. */
function htmlDetalle(movs: MovimientoPlanilla[], fecha: string, recorte = ''): string {
  const trs = [...movs].sort(porAsignacion).map(m => `<tr>
      <td class="cod">${esc(m.cod)}</td>
      <td>${esc(m.seccion)}</td>
      <td>${m.backorderDe ? esc(marcaBackorder(m.backorderDe)) + ' ' : ''}${esc(m.picker || (m.backorderDe ? '' : '—'))}</td>
      <td class="der">${m.registros}</td>
      <td>${esc(horaChile(m.asignadoEn) || '—')}</td>
      <td>${esc(horaChile(m.validadoEn) || '—')}</td>
      <td class="der">${esc(formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)))}</td>
    </tr>`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Detalle ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco · detalle', `${movs.length} movimientos`, recorte)}
    <table><thead><tr><th>Tienda</th><th>Sección</th><th>Usuario</th><th class="der">Registros</th>
      <th>Inicio</th><th>Validado</th><th class="der">Duración</th></tr></thead>
      <tbody>${trs.join('')}</tbody></table>
    ${FIRMAS}</body></html>`;
}
