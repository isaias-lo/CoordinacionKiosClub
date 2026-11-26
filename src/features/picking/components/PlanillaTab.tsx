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
import { Printer, Download, Loader2, RotateCcw, Search, X, ClipboardCheck } from 'lucide-react';
import { AUTO_REFRESH_MS } from '../picking-types';
import { fechaISOLocal } from '@/features/despacho/shared/fechaLocal';
import { refreshCalendario } from '@/features/despacho/utils/useCalendario';
import { codsDelDia } from '../planilla/codsDelDia';
import { diasPendientes, detallePendiente, type DiaPendiente } from '../planilla/diasPendientes';
import { agruparConsultasPorDia } from '@/features/despacho/shared/consultasPorDia';
import { armarPlanilla, SECCIONES, porAsignacion, type CeldaPlanilla, type MovimientoPlanilla, type Planilla, type SeccionPlanilla } from '../planilla/armarPlanilla';
import { avanceAsignacion, type AvanceAsignacion } from '../planilla/avanceAsignacion';
import { conCorrecciones, type FilaGuardada } from '../planilla/conCorrecciones';
import { validarCorreccion, textoConfirmacion, type PedidoCorreccion, type SeccionCorreccion } from '../planilla/correccionPicker';
import { extrasDesdeOdoo, extrasConCorrecciones, seccionDeCorreccion, DESTINOS_NO_TIENDA,
         type ExtraPlanilla, type ExtrasDelDia } from '../planilla/extrasPlanilla';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../planilla/desdeOdoo';
import { auditoresPorCelda, claveCelda, seAuditoSolo, type AuditorCelda }
  from '../planilla/auditores';
import { COLOR_ZONA, ZONAS, zonaPlanilla, type ZonaPlanilla } from '../planilla/zonaPlanilla';
import { contarPorZona, describirFiltro, filtrarMovimientos, filtrarPlanilla, sinFiltro,
         type FiltroPlanilla } from '../planilla/filtrarPlanilla';
import { marcaBackorder, textoBackorder, tituloBackorder } from '../planilla/backorders';
import { horaChile, duracionMinutos, formatearDuracion, relojDe } from '../planilla/horasPlanilla';
import { csvVistaPlanilla, csvVistaDetalle } from '../planilla/csvPlanilla';
import type { Aviso, Escritura } from '../planilla/registroOlas';

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

export function PlanillaTab({ cods: codsHoy, aperturas }: PlanillaTabProps) {
  // El día que se está mirando. Arranca SIEMPRE en hoy: abrir en otro día sería el peor
  // resultado posible, porque la pantalla se parece demasiado a la de hoy. Solo se mueve
  // desde el aviso de días sin registrar, que es una acción explícita.
  const hoy = useMemo(() => fechaISOLocal(), []);
  const [fecha, setFecha] = useState(hoy);
  const esHoy = fecha === hoy;
  /** Los días con trabajo que la hoja de olas no tiene, o tiene a medio llenar. */
  const [pendientes, setPendientes] = useState<DiaPendiente[]>([]);
  /** Las tiendas del día que se mira. Para hoy llegan de la pantalla; para un día pasado se
   *  arman del calendario de ese día de la semana. Ver `codsDelDia`. */
  const [codsOtroDia, setCodsOtroDia] = useState<string[] | null>(null);
  // Memoizado, y no es decoración: el `?? []` crea un arreglo NUEVO en cada render, y con eso
  // `consultas` y `fechas` también cambian aunque digan lo mismo. El efecto que carga el día
  // depende de esa clave y se dispararía en bucle contra Odoo — el mismo problema que ya está
  // documentado unas líneas más abajo, en `claveFechas`.
  const VACIO = useMemo<string[]>(() => [], []);
  const cods = esHoy ? codsHoy : (codsOtroDia ?? VACIO);
  const [vista, setVista]     = useState<Vista>('planilla');
  const [crudos, setCrudos]   = useState<MovimientoOdoo[] | null>(null);
  // Las auditorías van aparte de los movimientos: la consulta de la planilla las excluye en
  // Odoo —no son trabajo de picking— y acá solo sirven para poner el nombre de quien revisó.
  const [auditorias, setAuditorias] = useState<MovimientoOdoo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [fichas, setFichas]   = useState<Record<string, FichaTienda>>({});
  const [error, setError]     = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [cargando, setCargando]       = useState(false);
  const [guardados, setGuardados]     = useState<FilaGuardada[]>([]);
  // La celda que se está corrigiendo. `null` = no hay cuadro abierto.
  const [corrigiendo, setCorrigiendo] = useState<PedidoCorreccion | null>(null);
  const [guardandoCorr, setGuardandoCorr] = useState(false);
  // El registro en «Abastecimiento por Olas». `null` = el cuadro está cerrado.
  const [registro, setRegistro] = useState<RespuestaOlas | null>(null);
  const [consultandoOlas, setConsultandoOlas] = useState(false);
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

  // ── EL RELOJ DEL CONTADOR ──────────────────────────────────────────────────────────────────
  //
  // Uno solo para toda la hoja, no uno por celda: con 29 tiendas × 4 secciones serían más de cien
  // intervalos corriendo a la vez y cada uno redibujando su rama.
  //
  // Arranca en `null` y se llena en el primer efecto, igual que `montado`: `new Date()` en el
  // render inicial daría un valor distinto en el servidor y en el navegador, que es exactamente
  // el aviso de hidratación que ya arrastra esta pantalla por otro lado.
  //
  // Cada 30 s y no cada segundo: el contador se muestra en minutos, así que un tick por segundo
  // redibujaría 59 veces de más para mostrar lo mismo.
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

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
        const [rOdoo, rNombres, rTiendas, rCorr, rAud] = await Promise.all([
          fetch('/api/odoo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'planilla_dia', fechas }),
          }),
          fetch('/api/picker-canonical-names'),
          fetch('/api/tiendas'),
          fetch(`/api/planilla-picker?fecha=${fecha}`),
          fetch('/api/odoo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'auditorias_dia', fechas }),
          }),
        ]);
        const jOdoo = await rOdoo.json();
        if (!vivo) return;
        if (!jOdoo?.ok) { setError('No se pudo traer el día de Odoo'); return; }
        setCrudos(jOdoo.movimientos ?? []);

        // Si las auditorías fallan, la planilla igual sirve: sale sin la columna de auditor.
        const jAud = await rAud.json().catch(() => null);
        if (vivo) setAuditorias(jAud?.ok ? (jAud.auditorias ?? []) : []);

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
            seccion: String(r.seccion ?? '') as SeccionCorreccion,
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

  // ── Días que quedaron sin registrar ───────────────────────────────────────────────────────
  //
  // Se barren los últimos 12 días: cubre dos semanas de trabajo y alcanza para que un olvido de
  // un lunes se vea el lunes siguiente. Mirar más atrás no sirve — un día de hace un mes ya no
  // se registra, se arregla a mano.
  //
  // Son dos preguntas en paralelo: qué días TUVO trabajo (Odoo) y qué tiene la hoja de cada uno.
  // El cruce lo hace `diasPendientes`, que es puro y está testeado contra los días reales.
  const buscarPendientes = useCallback(async () => {
    const desde = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
    try {
      // En dos pasos y no en paralelo a propósito: a la hoja se le pregunta por las fechas que
      // Odoo acaba de decir que tuvieron trabajo, no por un rango. Así se lee una sola vez y no
      // se pregunta por días que nunca existieron.
      const rOdoo = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dias_con_trabajo', dateFrom: desde, dateTo: hoy }),
      }).then(r => r.json()).catch(() => null);

      const conTrabajo = (rOdoo?.dias ?? []) as { fecha: string; movimientos: number; tiendas: number }[];
      if (conTrabajo.length === 0) { setPendientes([]); return; }

      const fechas = conTrabajo.map(d => d.fecha).join(',');
      const jHoja = await fetch(`/api/planilla-olas?resumen=${encodeURIComponent(fechas)}`)
        .then(r => r.json()).catch(() => null);
      setPendientes(diasPendientes(conTrabajo, jHoja?.dias ?? [], hoy));
    } catch {
      // Un fallo acá no puede romper la pantalla: el aviso es un extra, no el contenido.
      setPendientes([]);
    }
  }, [hoy]);
  useEffect(() => { void buscarPendientes(); }, [buscarPendientes]);

  // Las tiendas de un día pasado: del calendario de ESE día de la semana, más las que tuvieron
  // carga y no estaban (las de adelanto). Ver `codsDelDia`.
  useEffect(() => {
    if (esHoy) { setCodsOtroDia(null); return; }
    let vivo = true;
    refreshCalendario()
      .then(cal => { if (vivo) setCodsOtroDia(codsDelDia(cal as never, fecha, movimientos)); })
      .catch(() => { if (vivo) setCodsOtroDia(codsDelDia(null, fecha, movimientos)); });
    return () => { vivo = false; };
    // `movimientos` a propósito NO está en las dependencias: entra en la primera vuelta con lo
    // que haya y volver a correr esto en cada carga reharía la lista mientras se mira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esHoy, fecha]);

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

  // Agregados, Extra y Solicitudes: se ven acá y NO van a la hoja de olas, que se arma solo con
  // `movimientos`. Una tienda es una del catálogo; si el catálogo no cargó, todo menos los destinos
  // que se sabe que no son tiendas. Ver `extrasPlanilla.ts`.
  const extras: ExtrasDelDia = useMemo(() => {
    if (!crudos) return { porTienda: new Map(), fueraDelDia: [] };
    const catalogo = new Set(Object.keys(fichas));
    const esTienda = (cod: string) => (catalogo.size > 0 ? catalogo.has(cod) : !DESTINOS_NO_TIENDA.has(cod));
    return extrasConCorrecciones(extrasDesdeOdoo(crudos, nombres, diaPorTienda, fecha, esTienda), guardados);
  }, [crudos, nombres, diaPorTienda, fecha, fichas, guardados]);

  // Quién auditó cada celda. Se empareja por tienda, sección y FECHA DEL ORIGEN: una auditoría
  // se cierra cuando se cierra, y la del 17 puede quedar registrada el 18. Ver `auditores.ts`.
  const auditores = useMemo(
    () => auditoresPorCelda(auditorias, nombres, diaPorTienda),
    [auditorias, nombres, diaPorTienda]);

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

  // Cuánto del día ya tiene dueño.
  //
  // Cuenta el DÍA COMPLETO aunque haya un filtro puesto, y es la MISMA razón que las pastillas
  // de zona: con «Ruta Norte» elegido, un «3 por asignar» se leería como que falta poco cuando
  // puede faltar mucho fuera de la vista. Lo que hay que repartir es el día, no la pantalla.
  const avance = useMemo(
    () => avanceAsignacion(movimientos.filter(m => m.estado === 'done' || m.estado === 'assigned')),
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

  const abrirCorreccionExtra = useCallback((x: ExtraPlanilla) => {
    setError(null);
    setCorrigiendo({
      ref: x.ref, fecha, cod: x.cod, seccion: seccionDeCorreccion(x),
      pickerActual: x.picker,
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

  // La vista previa y la escritura son la misma llamada con `confirmar` distinto, para que lo
  // que se muestra sea literalmente lo que se va a escribir.
  const llamarOlas = useCallback(async (confirmar: boolean, crear = false) => {
    setConsultandoOlas(true);
    try {
      const r = await fetch('/api/planilla-olas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, confirmar, crear,
          // Las tiendas del día EN EL ORDEN DEL CALENDARIO: si el día todavía no está en la
          // hoja, es con esto que se arma el bloque, y el orden de la hoja tiene que ser el
          // mismo que el de la planilla para que se puedan comparar a ojo.
          cods,
          // Se mandan los movimientos que la PANTALLA muestra, con sus correcciones a mano
          // aplicadas: registrar algo distinto de lo que el coordinador está mirando sería el
          // peor resultado posible. El nombre con que se escribe lo resuelve el servidor.
          movimientos: movimientos
            .filter(m => m.estado === 'done' || m.estado === 'assigned')
            .map(m => ({ cod: m.cod, seccion: m.seccion, picker: m.picker,
                         cuenta: m.cuenta, registros: m.registros, estado: m.estado })),
        }),
      });
      const j = await r.json().catch(() => null);
      setRegistro(j ?? { ok: false, error: 'No se pudo hablar con el servidor' });
      // Si se escribió, el aviso de días pendientes puede haber quedado viejo: el día que
      // acabamos de registrar ya no lo está. Sin esto seguiría avisando de algo ya resuelto,
      // que es la forma más rápida de que un aviso deje de leerse.
      if (j?.modo === 'escrito') void buscarPendientes();
    } catch {
      setRegistro({ ok: false, error: 'No se pudo hablar con el servidor' });
    } finally {
      setConsultandoOlas(false);
    }
  }, [fecha, movimientos, cods, buscarPendientes]);

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
      ? htmlPlanilla(planilla, fecha, auditores, recorte)
      : htmlDetalle(delDia, fecha, recorte);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    // `auditores` va en las dependencias y no es un detalle: la hoja imprime lo que haya al
    // momento del clic, así que con el mapa viejo saldrían los auditores de hace tres minutos.
  }, [vista, planilla, delDia, fecha, filtro, auditores]);

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
        {/* Busca en tres campos: código de tienda, nombre de tienda y picker. Son las tres
            preguntas que se hacen mirando la hoja —«dónde está la 38SP2», «cuál es Peñalolén»,
            «qué hizo hoy Marcelo»— y un solo campo las responde. Sin acentos: «pen» encuentra
            23PEÑ y «simon» a «Simón Sabathier». Escape lo limpia sin ir al botón. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, color: '#94A3B8', pointerEvents: 'none' }} />
          <input
            type="text" value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setTexto(''); }}
            placeholder="Buscar tienda o picker…"
            aria-label="Buscar por código de tienda, nombre de tienda o nombre del picker"
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
          // `nowrap` sin `flexShrink` hacía que este texto —lo más largo de la barra— empujara a
          // los filtros a la línea de abajo antes de tiempo. Ahora cede el ancho él primero.
          <span style={{ fontSize: 11.5, color: error ? '#B91C1C' : '#64748B',
                         minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                         whiteSpace: 'nowrap' }}
                title="Se actualiza sola cada 3 minutos con la pestaña a la vista. Odoo cachea 30 segundos, así que un cambio puede tardar hasta unos 3 minutos y medio en verse.">
            {/* Sin «Datos de las»: son 60 px al lado de un botón «Actualizar», que ya dice qué
                es esta hora. El `title` de arriba lo explica entero. */}
            {horaChile(actualizado.toISOString())}
            {error ? ' · sin actualizar' : ' · cada 3 min'}
          </span>
        )}
        <button type="button" onClick={bajar} style={BTN_SEC}><Download size={15} /> Bajar archivo</button>
        {/* Registrar es la acción que CAMBIA algo afuera, así que va separada de las que solo
            miran o imprimen, y nunca escribe de una: abre el cuadro con lo que haría. */}
        <button type="button" onClick={() => void llamarOlas(false)} disabled={consultandoOlas}
                title="Dejar el día escrito en la hoja PICKING de «Abastecimiento por Olas»"
                style={{ ...BTN_SEC, borderColor: '#A7F3D0', background: '#ECFDF5',
                         color: '#065F46', opacity: consultandoOlas ? 0.6 : 1 }}>
          <ClipboardCheck size={15} /> {consultandoOlas ? 'Revisando…' : 'Registrar en olas'}
        </button>

        {/* «Imprimir» a secas y la vista en el `title`: el par Planilla/Detalle está tres
            botones más a la izquierda y ya dice cuál se va a imprimir. Son 45 px que necesitan
            los filtros para entrar en la misma línea. */}
        <button type="button" onClick={imprimir} style={BTN_PRI}
                title={vista === 'planilla' ? 'Imprimir la planilla del día' : 'Imprimir el detalle del día'}>
          <Printer size={15} /> Imprimir
        </button>

        {/* ── LOS FILTROS SON UN SOLO BLOQUE ────────────────────────────────────────────────
            Estaban sueltos en la misma fila flex que los botones, así que al angostarse la
            ventana envolvían DE A UNA: en un MacBook quedaban «Todas» y «Ruta Norte» arriba con
            los botones y las otras cuatro abajo, separadas de su grupo y leyéndose como una fila
            cortada. Metidas en su propio contenedor son un único item del flex de afuera: o
            entran todas en la primera línea, o bajan todas juntas a la segunda. */}
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
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
      </div>

      {/* El aviso de días sin registrar y la banda de «no estás en hoy». Van ARRIBA de la barra
          de avance: son lo primero que hay que leer, porque los dos cambian el significado de
          todo lo que viene abajo. Ver `diasPendientes`. */}
      {esHoy && pendientes.length > 0 && (
        <div style={{ margin: '0 0 10px', border: '1.5px solid #8A4A06', background: '#FFFAF0',
                      color: '#5C3A06', borderRadius: 10, padding: '10px 13px',
                      display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#8A4A06', fontSize: 14 }}>
            ⚠ {pendientes.length === 1 ? 'Hay un día sin registrar' : `Hay ${pendientes.length} días sin registrar`} en la hoja de olas
          </span>
          {/* Tope de 5. Aunque el cruce falle y devuelva una lista larga, el aviso sigue
              siendo un aviso y no una pantalla: el 16/11 un error de agrupado llenó esto con
              decenas de filas de «1 movimiento · 0 tiendas» y tapó todo lo demás. */}
          {pendientes.slice(0, 5).map(d => (
            <div key={d.fecha} style={{ display: 'flex', alignItems: 'center', gap: 10,
                                        background: '#fff', border: '1px solid #E2E8F0',
                                        borderRadius: 8, padding: '7px 10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 150 }}>{textoFechaLarga(d.fecha)}</span>
              <span style={{ fontSize: 12.5, color: '#64748B', fontFamily: 'ui-monospace, monospace' }}>
                {detallePendiente(d)}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                             fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
                             background: d.motivo === 'sin-bloque' ? 'rgba(185,28,28,.09)' : '#FFFAF0',
                             color: d.motivo === 'sin-bloque' ? '#B91C1C' : '#8A4A06' }}>
                {d.motivo === 'sin-bloque' ? 'sin bloque' : 'a medio llenar'}
              </span>
              <button type="button" onClick={() => setFecha(d.fecha)}
                style={{ ...BTN_SEC, background: '#8A4A06', color: '#fff', borderColor: '#8A4A06' }}>
                {d.motivo === 'sin-bloque' ? 'Revisar y registrar' : 'Revisar y completar'}
              </button>
            </div>
          ))}
          {/* El bloque se agrega al FINAL de la hoja: si se registra hoy primero, el día viejo
              queda escrito DESPUÉS y la hoja pierde el orden cronológico. */}
          {pendientes.length > 5 && (
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              y {pendientes.length - 5} día{pendientes.length - 5 === 1 ? '' : 's'} más.
            </span>
          )}
          <span style={{ fontSize: 12.5 }}>
            Conviene cargarlos <b>antes</b> de cerrar hoy: el bloque se agrega al final de la hoja.
          </span>
        </div>
      )}
      {!esHoy && (
        <div style={{ margin: '0 0 10px', border: '1.5px solid #8A4A06', background: '#FFFAF0',
                      color: '#5C3A06', borderRadius: 10, padding: '9px 13px',
                      display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <b style={{ color: '#8A4A06' }}>Estás viendo el {textoFechaLarga(fecha)}, no hoy.</b>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => setFecha(hoy)}
            style={{ ...BTN_SEC, borderColor: '#8A4A06', color: '#8A4A06' }}>Volver a hoy</button>
        </div>
      )}
      <BarraAvance a={avance} />

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
                código de la tienda, su nombre y el picker, sin importar acentos ni mayúsculas.
              </div>
              <button type="button" onClick={limpiar} style={BTN_PRI}>Ver el día completo</button>
            </div>
          )
          : vista === 'planilla'
            ? <TablaPlanilla planilla={planilla} auditores={auditores} onCorregir={abrirCorreccion} ahora={ahora}
                            extras={extras.porTienda} fueraDelDia={extras.fueraDelDia}
                            onCorregirExtra={abrirCorreccionExtra} />
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

      {montado && registro && createPortal(
        <CuadroOlas
          r={registro} fecha={fecha} trabajando={consultandoOlas}
          onCerrar={() => setRegistro(null)}
          onConfirmar={() => void llamarOlas(true)}
          onCrear={() => void llamarOlas(true, true)}
        />,
        document.body,
      )}

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

/**
 * Cuánto del día ya tiene dueño, y qué falta repartir.
 *
 * Es lo primero que se mira al abrir la planilla. Antes esa pregunta —«¿me queda algo por
 * asignar?»— se contestaba recorriendo la matriz a ojo, celda por celda, buscando las que no
 * tienen nombre. En un día de 30 tiendas son 90 celdas.
 *
 * La barra no es decoración: en un vistazo distingue «falta un movimiento» de «falta medio
 * día», que es la diferencia entre seguir y parar a repartir. Y el desglose por sección dice
 * DÓNDE falta, que es lo único accionable del contador.
 */
function BarraAvance({ a }: { a: AvanceAsignacion }) {
  // Sin movimientos no hay nada que contar, y la tabla ya explica por qué está vacía.
  if (a.total === 0) return null;

  const listo = a.sinAsignar === 0;
  const tono = listo
    ? { fg: '#065F46', borde: '#A7F3D0', fondo: '#ECFDF5', barra: '#10B981' }
    : { fg: '#92400E', borde: '#FDE68A', fondo: '#FFFBEB', barra: '#F59E0B' };

  return (
    <div role="status" aria-live="polite"
         style={{ flexShrink: 0, margin: '9px 16px 0', padding: '8px 12px',
                  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                  background: tono.fondo, border: `1px solid ${tono.borde}`,
                  borderRadius: 9, fontSize: 12.5, color: tono.fg }}>

      {/* El número grande es lo que FALTA, no lo que se hizo: es la pregunta que trae a
          alguien a mirar esta barra. Cuando no falta nada, el grande pasa a ser el total. */}
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
        <strong style={{ fontSize: 21, fontWeight: 800, lineHeight: 1,
                         fontVariantNumeric: 'tabular-nums' }}>
          {listo ? a.total : a.sinAsignar}
        </strong>
        <span style={{ fontWeight: 700 }}>
          {listo
            ? `movimiento${a.total === 1 ? '' : 's'}, todo asignado`
            : `por asignar${a.tiendas ? ` en ${a.tiendas} ${a.tiendas === 1 ? 'tienda' : 'tiendas'}` : ''}`}
        </span>
      </span>

      {/* La barra y el «X de Y» dicen lo mismo de dos formas: una se lee de un vistazo y la
          otra se puede repetir en voz alta. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                     minWidth: 150, flex: 1 }}>
        <span aria-hidden="true"
              style={{ flex: 1, minWidth: 70, height: 7, borderRadius: 4,
                       background: 'rgba(15,23,42,0.10)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${a.pct}%`, height: '100%',
                         background: tono.barra, borderRadius: 4 }} />
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', opacity: 0.9 }}>
          {a.asignados} de {a.total} · {a.pct}%
        </span>
      </span>

      {/* Dónde falta. Sin esto el contador dice que hay trabajo pero no por dónde empezar. */}
      {!listo && a.porSeccion.length > 0 && (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {a.porSeccion.map(({ seccion, faltan }) => (
            <span key={seccion}
                  title={`${faltan} de ${seccion} sin asignar`}
                  style={{ ...PASTILLA, background: '#fff', color: tono.fg,
                           border: `1px solid ${tono.borde}` }}>
              {seccion}
              <span style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.65 }}>{faltan}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** La matriz: una fila por tienda; una celda con varios movimientos los apila. */
function TablaPlanilla({ planilla, auditores, onCorregir, ahora, extras, fueraDelDia, onCorregirExtra }: {
  planilla: Planilla;
  /** `cod|seccion` → quién auditó esa celda. Ver `planilla/auditores.ts`. */
  auditores: ReadonlyMap<string, AuditorCelda[]>;
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
  /** El reloj compartido. `null` hasta el primer efecto: ver el comentario en `PlanillaTab`. */
  ahora: Date | null;
  /** Agregados, Extra y Solicitudes por tienda: van en una franja bajo su fila. */
  extras: ReadonlyMap<string, ExtraPlanilla[]>;
  /** Trabajo del día para tiendas que hoy no despachan. */
  fueraDelDia: ExtraPlanilla[];
  onCorregirExtra: (x: ExtraPlanilla) => void;
}) {
  const totalExtras = planilla.filas.reduce(
    (s, f) => s + (extras.get(f.cod) ?? []).reduce((t, x) => t + x.registros, 0), 0);
  return (
    // `pk-hoja` trae el resalte de la fila al pasar el mouse (marco.css). Los fondos de celda van
    // por clase y no en línea: un estilo en línea le gana a cualquier selector, así que en línea
    // tapaban el resalte justo en las celdas grises.
    <div className="pk-hoja" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11,
                  flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* ── UNA COLUMNA POR SECCIÓN, NO DOS ───────────────────────────────────────────────
          Antes había «Comida» y «Usuario Comida» como columnas separadas, y el número quedaba
          lejos del nombre: para saber quién hizo los 136 había que cruzar la vista. Ahora el
          par va junto en una celda, con el número en tipografía tabular para que las unidades
          se comparen entre filas aunque el nombre de al lado sea más largo o más corto.
          Son cuatro columnas menos, que es el ancho que necesitaba el contador. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1180 }}>
        <thead>
          {/* Dos filas de encabezado, igual que la hoja impresa: cada sección abre su par
              «Usuario / Auditor». El auditor AL LADO y no debajo — apilado, el nombre que cobra
              y el que revisa se leen como dos pickers de la misma celda, que es justo la
              confusión que esto viene a sacar. */}
          <tr style={{ background: '#F8FAFC' }}>
            <th style={TH_NUM} rowSpan={2}>#</th>
            <th style={TH} rowSpan={2}>Tienda</th>
            {SECCIONES.map(s => (
              <th key={s} colSpan={2}
                  style={{ ...TH, textAlign: 'center', borderLeft: '1px solid #E2E8F0' }}>
                {s === 'Chocolates' ? 'Choc.' : s}
              </th>
            ))}
          </tr>
          <tr style={{ background: '#F8FAFC' }}>
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <th style={{ ...TH, fontSize: 10, color: '#94A3B8', borderLeft: '1px solid #E2E8F0' }}>Usuario</th>
                <th style={{ ...TH, fontSize: 10, color: '#94A3B8' }}>Auditor</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {planilla.filas.map((f, i) => {
            const c = COLOR_ZONA[f.zona];
            return (
              <Fragment key={f.cod}>
              <tr className="fila" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={TD_NUM}>{i + 1}</td>
                <td style={{ padding: '4px 10px', verticalAlign: 'top' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700,
                    opacity: f.sinCarga ? 0.45 : 1,
                  }}>{f.cod}</span>
                </td>
                {SECCIONES.map((s, j) => {
                  const celda = f.celdas[s];
                  // La banda alterna por SECCIÓN y no por fila: separa las cuatro columnas sin
                  // pelearse con el rayado por tienda ni con el resalte del mouse.
                  const clase = celda.length === 0 ? 'vacia' : j % 2 ? 'banda' : undefined;
                  const quienes = auditores.get(claveCelda(f.cod, s)) ?? [];
                  return (
                    <Fragment key={s}>
                    <td className={clase} style={{ ...TD_SEC, borderLeft: '1px solid #F1F5F9' }}>
                      {celda.length === 0
                        ? <span style={{ color: '#CBD5E1' }}>·</span>
                        : celda.map((x, k) => (
                            <CeldaPicker key={k} celda={x} cod={f.cod} seccion={s}
                                         onCorregir={onCorregir} ahora={ahora} />
                          ))}
                    </td>
                    <td className={clase} style={TD_SEC}>
                      <CeldaAuditor quienes={quienes}
                        cuentasDelPicker={celda.map(x => x.cuenta ?? '').filter(Boolean)} />
                    </td>
                    </Fragment>
                  );
                })}
              </tr>
              {(extras.get(f.cod)?.length ?? 0) > 0 && (
                <FranjaExtras extras={extras.get(f.cod) ?? []} onCorregir={onCorregirExtra} ahora={ahora} />
              )}
              </Fragment>
            );
          })}
          <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
            <td />
            <td style={{ ...TH, padding: '7px 10px' }}>Total</td>
            {/* Dos celdas por sección, como el encabezado: el total va bajo «Usuario». */}
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <td style={{ ...TD_SEC, fontWeight: 800, fontFamily: 'ui-monospace, monospace',
                             fontVariantNumeric: 'tabular-nums', paddingTop: 7, paddingBottom: 7 }}>
                  {planilla.totales[s]}
                </td>
                <td />
              </Fragment>
            ))}
          </tr>
          {totalExtras > 0 && (
            <tr>
              <td />
              <td />
              <td className="extra" colSpan={SECCIONES.length * 2}
                  style={{ padding: '6px 10px', borderLeft: '2px solid #5EEAD4' }}>
                <span style={ETIQUETA_FRANJA}>Total Agregados, Extra y Solicitudes</span>
                <span style={{ ...NUM_EXTRA, marginLeft: 10 }}>{totalExtras}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {fueraDelDia.length > 0 && (
        <BloqueFueraDelDia extras={fueraDelDia} onCorregir={onCorregirExtra} />
      )}
    </div>
  );
}

/**
 * La franja bajo una tienda: sus Agregados, Extra y Solicitudes del día.
 *
 * Va en una fila propia y no en una columna más: la tabla ya necesita 1.180 px, y una columna
 * de 250 la llevaba a unos 1.430, más que una pantalla de notebook común. La franja solo agrega
 * alto, y solo en las tiendas que tienen algo (el 13/11/2026, 8 de 27).
 */
function FranjaExtras({ extras, onCorregir, ahora }: {
  extras: ExtraPlanilla[];
  onCorregir: (x: ExtraPlanilla) => void;
  ahora: Date | null;
}) {
  return (
    <tr className="fila" style={{ borderBottom: '1px solid #E2E8F0' }}>
      <td className="extra" />
      <td className="extra" />
      <td className="extra" colSpan={SECCIONES.length * 2}
          style={{ padding: '5px 10px', borderLeft: '2px solid #5EEAD4' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px', alignItems: 'baseline' }}>
          <span style={ETIQUETA_FRANJA}>
            Agregados, Extra y Solicitudes<span style={PILL_OLAS}>no va a olas</span>
          </span>
          {extras.map(x => <ItemExtra key={x.ref} x={x} onCorregir={onCorregir} ahora={ahora} />)}
        </div>
      </td>
    </tr>
  );
}

/** Un movimiento de la franja: productos, qué es, quién lo hizo y cuánto tardó. */
function ItemExtra({ x, onCorregir, ahora }: {
  x: ExtraPlanilla;
  onCorregir: (x: ExtraPlanilla) => void;
  ahora: Date | null;
}) {
  const r = ahora ? relojDe(x.asignadoEn, x.validadoEn, ahora) : null;
  return (
    <div style={{ display: 'inline-flex', gap: 7, alignItems: 'baseline' }} title={x.origin}>
      <span style={NUM_EXTRA}>{x.registros}</span>
      <span style={CHIP_EXTRA}>{x.etiqueta}</span>
      <BotonPickerExtra x={x} onCorregir={onCorregir} />
      <Contador r={r} />
    </div>
  );
}

/** El nombre, como botón para corregirlo. Igual que `CeldaPicker`, pero para un extra. */
function BotonPickerExtra({ x, onCorregir }: { x: ExtraPlanilla; onCorregir: (x: ExtraPlanilla) => void }) {
  const corregido = x.origen === 'corregido';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <button type="button" className="pk-pick" onClick={() => onCorregir(x)}
              title="Tocar para corregir quién hizo este movimiento"
              style={{
                font: 'inherit', cursor: 'pointer', textAlign: 'left',
                padding: '1px 5px', marginLeft: -5, borderRadius: 5,
                border: corregido ? '1px dashed #FCD34D' : '1px dashed transparent',
                background: corregido ? '#FFFBEB' : 'transparent',
                ...(x.picker ? { color: corregido ? '#92400E' : '#334155' } : ESTILO_SIN_ASIGNAR),
                ...(corregido ? { fontWeight: 700 } : null),
              }}>
        {x.picker || '— sin asignar'}
      </button>
      {corregido && x.pickerOdoo && (
        <span style={{ fontSize: 10.5, color: '#B45309' }}>Odoo decía: {x.pickerOdoo}</span>
      )}
    </span>
  );
}

/**
 * Lo que se pickeó hoy para tiendas que hoy no despachan: Extra, aperturas, adelantos. Antes se
 * descartaba sin aviso (`movimientosDesdeOdoo` solo toma cada tienda en su día). Tampoco va a olas.
 */
function BloqueFueraDelDia({ extras, onCorregir }: {
  extras: ExtraPlanilla[];
  onCorregir: (x: ExtraPlanilla) => void;
}) {
  const total = extras.reduce((s, x) => s + x.registros, 0);
  return (
    <div style={{ borderTop: '2px solid #CBD5E1', padding: '12px 0 4px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '0 10px 8px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Tiendas que hoy no despachan</span>
        <span style={PILL_OLAS}>no va a olas</span>
        <span style={{ fontSize: 11.5, color: '#64748B' }}>
          Trabajo de hoy para tiendas que no están en el calendario: Extra, aperturas, adelantos.
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={TH}>Tienda</th><th style={TH}>Qué es</th><th style={TH}>Usuario</th>
            <th style={TH_DER}>Registros</th><th style={TH}>Inicio</th><th style={TH}>Validado</th>
            <th style={TH_DER}>Duración</th>
          </tr>
        </thead>
        <tbody>
          {extras.map((x, i) => {
            const nueva = i === 0 || extras[i - 1].cod !== x.cod;
            return (
              <tr key={x.ref} className="fila"
                  style={{ borderBottom: '1px solid #F1F5F9', borderTop: nueva && i > 0 ? '1px solid #E2E8F0' : undefined }}>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#1E40AF' }}>
                  {nueva ? x.cod : ''}
                </td>
                <td style={TD}><span style={CHIP_EXTRA} title={x.origin}>{x.etiqueta}</span></td>
                <td style={TD}><BotonPickerExtra x={x} onCorregir={onCorregir} /></td>
                <td style={TD_DER}>{x.registros}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(x.asignadoEn) || '—'}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(x.validadoEn) || '—'}</td>
                <td style={{ ...TD_DER, color: '#475569' }}>{formatearDuracion(duracionMinutos(x.asignadoEn, x.validadoEn))}</td>
              </tr>
            );
          })}
          <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
            <td style={{ ...TH, padding: '7px 10px' }}>Total</td><td /><td />
            <td style={TD_DER}>{total}</td><td /><td /><td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * La celda de la columna «Auditor».
 *
 * Vacía cuando nadie auditó, que son siete de cada diez: un «sin auditar» repetido sería más
 * tinta que dato, y la planilla ya usa el punto gris para «acá no hay nada».
 *
 * El cartel ámbar cuando el auditor es la misma cuenta que pickeó NO es un error del sistema:
 * pasa poco y puede pasar. Solo conviene que se vea.
 */
function CeldaAuditor({ quienes, cuentasDelPicker }: {
  quienes: readonly AuditorCelda[];
  cuentasDelPicker: readonly string[];
}) {
  if (quienes.length === 0) return <span style={{ color: '#CBD5E1' }}>·</span>;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {quienes.map(a => {
        const solo = seAuditoSolo(cuentasDelPicker, a);
        return (
          <div key={a.cuenta} style={{ display: 'grid', gap: 1 }}>
            <span style={{ color: solo ? '#B45309' : '#6D28D9', fontSize: 12.5 }}>{a.nombre}</span>
            {a.hora && (
              <span style={{ color: '#94A3B8', fontSize: 11,
                             fontVariantNumeric: 'tabular-nums' }}>{a.hora}</span>
            )}
            {solo && (
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
                             textTransform: 'uppercase', color: '#B45309', background: '#FEF3C7',
                             borderRadius: 4, padding: '1px 5px', justifySelf: 'start' }}>
                mismo que pickeó
              </span>
            )}
          </div>
        );
      })}
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
function CeldaPicker({ celda, cod, seccion, onCorregir, ahora }: {
  celda: CeldaPlanilla;
  cod: string;
  seccion: SeccionPlanilla;
  onCorregir: (celda: CeldaPlanilla, cod: string, seccion: SeccionPlanilla) => void;
  /** El reloj compartido. `null` = todavía no montó, y entonces no se dibuja contador. */
  ahora?: Date | null;
}) {
  const corregido = celda.origen === 'corregido';
  const bo = celda.backorderDe;
  // Un backorder sin picker NO es trabajo sin empezar: es lo que quedó de un movimiento que ya se
  // validó, y Odoo lo creó solo. Mostrarlo como «— sin asignar» en naranja era leerlo al revés.
  const texto = celda.picker || (bo ? `↳ ${textoBackorder(bo)}` : '— sin asignar');
  const estiloTexto = celda.picker ? undefined : bo ? ESTILO_RESTO : ESTILO_SIN_ASIGNAR;
  const r = ahora ? relojDe(celda.asignadoEn, celda.validadoEn, ahora) : null;

  // El número y el nombre en la MISMA línea, alineados por su base. El número va en tipografía
  // tabular y con ancho mínimo para que las unidades de todas las filas queden en columna
  // aunque el nombre de al lado sea más largo.
  const numero = (
    <span style={{ fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums',
                   fontWeight: 700, color: '#0F172A', minWidth: 30, textAlign: 'right',
                   flex: 'none' }}>{celda.registros}</span>
  );

  if (!celda.ref) return (
    <div className="mov">
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        {numero}<span style={estiloTexto}>{texto}</span>
      </div>
      <Contador r={r} />
    </div>
  );
  return (
    <div className="mov" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      {numero}
      <div style={{ minWidth: 0 }}>
      {/* El borde aparece al pasar el mouse, no antes. Con 29 tiendas × 4 secciones, cien
          recuadros punteados fijos eran más tinta que datos — por eso el estilo B los saca.
          La afordancia no se pierde: `pk-pick:hover` pone el borde y el fondo, y
          `:focus-visible` hace lo mismo para quien llega con el teclado. */}
      <button type="button" className="pk-pick" onClick={() => onCorregir(celda, cod, seccion)}
              title={bo
                // Las dos cosas: qué es esta línea Y que se puede tocar. Dejando solo la
                // explicación del resto, la celda perdía la única señal de que es un botón.
                ? `${tituloBackorder(bo)} · Tocar para corregir quién lo hizo.`
                : 'Tocar para corregir quién hizo este movimiento'}
              style={{
                font: 'inherit', cursor: 'pointer', textAlign: 'left',
                padding: '1px 5px', marginLeft: -5, borderRadius: 5,
                // Corregido SÍ lleva borde siempre: es una marca de que ese nombre no es el que
                // dijo Odoo, y eso tiene que verse sin pasar el mouse por encima.
                border: corregido ? '1px dashed #FCD34D' : '1px dashed transparent',
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
      <Contador r={r} />
      </div>
    </div>
  );
}

/**
 * El contador de la celda: corre desde que se asignó y se detiene al validar.
 *
 * El punto que late dice «esto sigue en curso» sin leer el número, y la tilde dice «terminó».
 * Son dos símbolos distintos además de dos colores: el naranja y el verde no se distinguen para
 * una de cada doce personas, y en la hoja impresa no hay color en absoluto.
 *
 * No se dibuja nada cuando no hay hora de asignación. Un «0 min» ahí sería mentira: el
 * movimiento no tardó nada, todavía no se le dio a nadie.
 */
function Contador({ r }: { r: ReturnType<typeof relojDe> | null }) {
  if (!r || r.estado === 'sin-datos') return null;
  const corre = r.estado === 'corre';
  return (
    <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace, monospace', fontWeight: 600,
                  display: 'flex', gap: 4, alignItems: 'center',
                  color: corre ? '#B45309' : '#15803D' }}
         title={corre ? `En curso desde hace ${r.texto}`
                      : `Validado — tardó ${r.texto}`}>
      {corre
        ? <span className="pk-latido" style={{ width: 6, height: 6, borderRadius: '50%',
                                               background: 'currentColor', flex: 'none' }} />
        : <span aria-hidden="true">✓</span>}
      {r.texto}
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
const TH_DER   = { ...TH, textAlign: 'right', padding: '7px 6px' } as const;
const TH_NUM   = { ...TH, textAlign: 'center', padding: '7px 4px', color: '#64748B' } as const;
// 4 px de relleno y no 6: son 4 px menos por tienda y con 29 filas se nota al scrollear. El alto
// de la celda lo sigue fijando el botón del picker, que tiene su propio borde.
const TD       = { padding: '4px 10px', color: '#334155', verticalAlign: 'top' } as const;
const TD_DER   = { padding: '4px 6px', textAlign: 'right', color: '#0F172A', verticalAlign: 'top',
                   fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as const;
const TD_NUM   = { padding: '4px 4px', textAlign: 'center', color: '#94A3B8', fontSize: 10.5,
                   verticalAlign: 'top' } as const;
// La celda de una sección: lleva el número Y el nombre. La línea fina a la izquierda es lo que
// separa las cuatro secciones ahora que cada una es una sola columna.
const TD_SEC   = { padding: '4px 10px', color: '#334155', verticalAlign: 'top',
                   borderLeft: '1px solid #F1F5F9' } as const;
const ESTILO_SIN_ASIGNAR = { color: '#B45309', fontStyle: 'italic', fontWeight: 600 } as const;
// Azul y no el naranja de «sin asignar»: el naranja es la alarma de trabajo que nadie tomó, y un
// resto de un movimiento ya validado no es eso.
const ESTILO_RESTO = { color: '#1E40AF', fontWeight: 600 } as const;
// Agregados, Extra y Solicitudes: un verde azulado tenue, para que se lean como algo aparte de las
// cuatro secciones sin competir con ellas. El fondo va por la clase `extra` (marco.css).
const ETIQUETA_FRANJA = { fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
                          color: '#0F766E', whiteSpace: 'nowrap' } as const;
const PILL_OLAS = { display: 'inline-block', marginLeft: 6, padding: '1px 6px', borderRadius: 999, fontSize: 9,
                    fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#0F766E',
                    border: '1px solid #5EEAD4', background: '#fff' } as const;
const CHIP_EXTRA = { fontSize: 11, fontWeight: 700, color: '#0F766E', background: '#F0FDFA',
                     border: '1px solid #99F6E4', borderRadius: 4, padding: '0 5px', whiteSpace: 'nowrap' } as const;
const NUM_EXTRA = { fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                    color: '#0F172A' } as const;

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
  /* table-layout fixed: las columnas obedecen su ancho y un nombre largo se parte en dos líneas
     en vez de empujar la tabla fuera del margen. La cuenta está en htmlPlanilla. */
  table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
  th, td { border: 1px solid #9CA3AF; padding: 1px 4px; text-align: left; vertical-align: top; }
  th { background: #DBEAFE; font-size: 7.5px; font-weight: 800; text-transform: uppercase;
       letter-spacing: .03em; border-color: #111827; }
  .der { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cod { font-family: ui-monospace, monospace; font-weight: 700; }
  .nada { background: #E5E7EB; }
  /* Para escribir a mano: se deja más alta que una celda de texto y con el rótulo en gris, para
     que se lea como «esto lo completás vos» y no como un dato que el sistema no trajo. */
  td.aud { height: 15px; }
  th.aud { color: #4B5563; background: #EEF2F7; }
  /* Las palabras largas se parten antes que desbordar: con el layout fijo, el ancho manda. */
  /* Partir palabras tiene sentido en un nombre; en un número es un defecto: «10» se leía
     «1 0». Por eso la regla vive SOLO en las columnas de nombre, y las de número llevan
     nowrap para que no se partan pase lo que pase. */
  td.nom, td.aud { overflow-wrap: anywhere; }
  td.idx, td.cod, td.der { white-space: nowrap; }
  /* Un encabezado que no entre se RECORTA en su celda en vez de pisar la columna vecina: un
     recorte se ve y se arregla, una línea pisada parece un defecto de impresión. */
  th { overflow: hidden; white-space: nowrap; }
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

/**
 * «viernes 13 de noviembre». Para los avisos, donde la fecha tiene que leerse de un vistazo:
 * «2026-11-13» obliga a traducir mentalmente qué día de la semana fue, y es justo el dato que
 * dice si ese día se trabajó.
 *
 * Mediodía para que el día no se corra por zona horaria, igual que en `cabecera`.
 */
function textoFechaLarga(fechaISO: string): string {
  const d = new Date(fechaISO + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return fechaISO;
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

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
/**
 * La hoja que se imprime y se firma.
 *
 * ── POR QUÉ `table-layout: fixed` Y ANCHOS EXPLÍCITOS ─────────────────────────────────────────
 *
 * Con el layout automático, un nombre largo ensancha su columna y empuja la tabla fuera del
 * margen: la hoja sale cortada y nadie se entera hasta que está impresa. Con `fixed` las columnas
 * obedecen el ancho declarado y el peor caso es un nombre en dos líneas.
 *
 * La cuenta, para que se pueda rehacer si cambia algo (carta apaisada, margen de 10 mm):
 *
 *     ancho útil .................................... 980 px
 *     fijas: # 26 + Tienda 50 + 4 secciones × 40 .... 236 px
 *     quedan para las 8 columnas de nombre .......... 744 px → 93 px cada una
 *     lo más largo que puede caer ahí:
 *       «↳118 B. Montecinos», 18 caracteres .........  ~76 px
 *
 * Medido el 16/11/2026 contra `picker_canonical_names`: las 31 cuentas tienen nombres de DOS
 * palabras, y el más largo abreviado son 13 caracteres («B. Montecinos», «D. Echeverria»).
 *
 * ── DE DÓNDE SALE CADA ANCHO (y los dos que estuvieron mal) ──────────────────────────────────
 *
 * Ninguno es redondo: los tres se midieron contra lo que de verdad va adentro.
 *
 *   #        26 px  Dos dígitos a 7,5 px. Estuvo en 18 y el «10» se partía en «1 / 0»: con 8 px
 *                   de relleno quedaban 10 px de texto, y en la ventana de impresión **Barlow no
 *                   está cargada**, así que el sistema usa una fuente más ancha que la medida.
 *   Tienda   50 px  «41ANA» en monoespaciada ocupa ~38 px.
 *   Sección  40 px  No lo manda el número sino el ENCABEZADO: «COMIDA» son 6 letras a 7,5 px en
 *                   negrita mayúscula, ~32 px + 8 de relleno. Estuvo en 30 y el rótulo se salía
 *                   por encima de la línea de la columna vecina.
 *
 * Los dos defectos son de la misma causa: antes de fijar el ancho, la tabla se ensanchaba sola
 * para que todo entrara, y al fijarlo esos dos casos dejaron de caber. Por eso ahora los
 * encabezados llevan `overflow: hidden`: si alguien cambia una etiqueta por una más larga, se
 * recorta en su celda en vez de pisar a la vecina.
 *
 * ── LA COLUMNA «AUDITOR» ──────────────────────────────────────────────────────────────────────
 *
 * Hasta el 19/11/2026 iba VACÍA a propósito, y el motivo escrito acá era: «el sistema no tiene de
 * dónde sacarla — en Odoo no hay un auditor por movimiento». **Esa premisa resultó falsa.** Al
 * auditar, Odoo crea un movimiento gemelo del original con la palabra AUDITORIA delante del
 * origen y el auditor como responsable; el origen dice tienda, sección y fecha. Ver
 * `planilla/auditores.ts`, donde está medido.
 *
 * Así que ahora imprime **lo que haya al momento de dar clic**, y lo que todavía no se auditó
 * sigue saliendo en blanco para escribir a mano. Importa cuándo se imprime: el 19/11/2026 las
 * auditorías se cerraron entre las 13:12 y las 19:07, así que una hoja de media mañana sale casi
 * toda en blanco y una del cierre, casi toda llena. Decisión del coordinador, 19/11/2026.
 */
function htmlPlanilla(p: Planilla, fecha: string,
                      auditores: ReadonlyMap<string, AuditorCelda[]>, recorte = ''): string {
  const th = ['<th style="width:26px">#</th>', '<th style="width:50px">Tienda</th>'];
  for (const s of SECCIONES) {
    th.push(`<th class="der" style="width:40px">${esc(s === 'Chocolates' ? 'Choc.' : s)}</th>`);
    th.push('<th>Usuario</th>');
    th.push('<th class="aud">Auditor</th>');
  }

  const trs = p.filas.map((f, i) => {
    const c = COLOR_ZONA[f.zona];
    const tds = [
      `<td class="idx" style="text-align:center;font-size:7.5px;color:#6B7280">${i + 1}</td>`,
      `<td class="cod" style="background:${c.bg};color:${c.text};border-left:3px solid ${c.border}">${esc(f.cod)}</td>`,
    ];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      const clase = celda.length === 0 ? 'nada' : '';
      tds.push(`<td class="der ${clase}">${celda.map(x => esc(x.registros)).join('<br>')}</td>`);
      tds.push(`<td class="nom ${clase}" style="font-size:9px">${
        celda.map(x => {
          // La marca ↳4 va ANTES del nombre: en papel la columna es angosta y lo primero que se
          // lee tiene que ser que esta línea quedó de otra.
          const m = x.backorderDe ? esc(marcaBackorder(x.backorderDe)) + ' ' : '';
          return m + esc(x.picker ? corto(x.picker) : x.backorderDe ? '' : '—');
        }).join('<br>')}</td>`);
      // Lo que ya se auditó sale impreso; lo que no, en blanco para escribir a mano. Una sección
      // sin carga lleva el mismo gris que su «Usuario»: no hay nada que auditar ahí y pedir una
      // firma sobre una celda vacía confunde.
      const quienes = auditores.get(claveCelda(f.cod, s)) ?? [];
      tds.push(`<td class="aud ${clase}" style="font-size:8px">${
        quienes.map(a => esc(corto(a.nombre))).join('<br>')}</td>`);
    }
    return '<tr>' + tds.join('') + '</tr>';
  });

  const tot = ['<td></td>', '<td style="font-size:8px;font-weight:800">TOTAL</td>'];
  for (const s of SECCIONES) {
    tot.push(`<td class="der">${p.totales[s]}</td>`);
    tot.push('<td></td>');
    tot.push('<td class="aud"></td>');
  }

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

/** Lo que devuelve `/api/planilla-olas`, en sus dos modos y en sus fallas. */
interface RespuestaOlas {
  ok: boolean;
  modo?: 'previo' | 'escrito';
  motivo?: 'sin-bloque' | 'sin-permiso';
  error?: string;
  fecha?: string;
  celdas?: number;
  bloque?: { desde: number; hasta: number; filas: number };
  escrituras?: Escritura[];
  avisos?: Aviso[];
  filasAEscribir?: number;
  /** El día no está en la hoja pero se puede armar con las tiendas del calendario. */
  puedeCrear?: boolean;
  /** En palabras, qué se crearía: «91 filas: 29 tiendas × 3 secciones…». */
  aCrear?: string | null;
}

/**
 * El cuadro del registro en «Abastecimiento por Olas».
 *
 * Muestra PRIMERO lo que no se va a poder hacer y después lo que sí. Al revés, un «87 celdas
 * listas» en grande haría que nadie leyera los tres avisos de abajo, que son justamente las
 * filas que van a quedar sin registrar y que alguien tiene que escribir a mano.
 */
function CuadroOlas({ r, fecha, trabajando, onCerrar, onConfirmar, onCrear }: {
  r: RespuestaOlas;
  fecha: string;
  trabajando: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
  /** Armar el bloque del día y registrarlo en la misma pasada. */
  onCrear: () => void;
}) {
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [onCerrar]);

  const escrito = r.modo === 'escrito';
  const n = r.filasAEscribir ?? 0;
  const celdas = r.escrituras?.length ?? 0;
  const avisos = r.avisos ?? [];

  return (
    <div role="dialog" aria-modal="true" aria-label="Registrar en Abastecimiento por Olas"
         style={{ position: 'fixed', inset: 0, zIndex: 50,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <button type="button" onClick={onCerrar} aria-label="Cerrar sin registrar"
              style={{ position: 'absolute', inset: 0, border: 'none', cursor: 'default',
                       background: 'rgba(15,23,42,0.45)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: '20px 22px',
                    width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto',
                    boxShadow: '0 20px 50px rgba(15,23,42,0.3)' }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A', lineHeight: 1.25 }}>
          {escrito ? 'Registrado en «Abastecimiento por Olas»' : 'Registrar el día en «Abastecimiento por Olas»'}
        </div>
        <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
          Hoja PICKING · {fecha}
          {r.bloque && <> · filas {r.bloque.desde} a {r.bloque.hasta}</>}
        </div>

        {/* Las fallas duras: no hay nada que confirmar. */}
        {!r.ok && (
          <div style={{ margin: '14px 0', padding: '12px 14px', background: '#FEF2F2',
                        border: '1px solid #FECACA', borderRadius: 10, fontSize: 13,
                        color: '#991B1B', lineHeight: 1.6 }}>
            {r.error}
          </div>
        )}

        {/* El día no está en la hoja y se puede armar. Es un paso aparte y explícito: crear
            filas en una planilla de otro equipo no puede pasar de callado dentro de «registrar». */}
        {!r.ok && r.motivo === 'sin-bloque' && r.puedeCrear && (
          <div style={{ margin: '14px 0', padding: '12px 14px', background: '#EFF6FF',
                        border: '1px solid #BFDBFE', borderRadius: 10, fontSize: 13,
                        color: '#1E3A8A', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Puedo armar el día</div>
            Al final de la hoja, con <strong>{r.aCrear}</strong>. Lleva el color que le toca
            —alterna con el día de arriba— y copia el formato y las listas desplegables de la
            última fila, así queda igual que los días que se arman a mano.
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={onCrear} disabled={trabajando} style={BTN_PRI}>
                {trabajando ? 'Armando…' : 'Armar el día y registrar'}
              </button>
            </div>
          </div>
        )}

        {r.ok && (
          <>
            {/* Lo que NO se va a hacer, primero y sin esconder. */}
            {avisos.length > 0 && (
              <div style={{ margin: '14px 0', padding: '11px 13px', background: '#FFFBEB',
                            border: '1px solid #FDE68A', borderRadius: 10, fontSize: 12.5,
                            color: '#78350F', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 5 }}>
                  {avisos.length} {avisos.length === 1 ? 'fila queda' : 'filas quedan'} sin registrar
                  {escrito ? '' : ' — hay que escribirlas a mano'}
                </div>
                <ul style={{ margin: 0, paddingLeft: 17, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {avisos.map((a, i) => <li key={i}>{a.detalle}</li>)}
                </ul>
              </div>
            )}

            <div style={{ margin: '14px 0', padding: '12px 14px', background: '#F0FDF4',
                          border: '1px solid #BBF7D0', borderRadius: 10, fontSize: 13,
                          color: '#14532D', lineHeight: 1.6 }}>
              {escrito
                ? <><strong>{r.celdas}</strong> celdas escritas en <strong>{n}</strong>{' '}
                    {n === 1 ? 'fila' : 'filas'}.</>
                : n === 0
                  ? 'No hay nada nuevo que escribir: las filas del día ya están completas o vacías por buena razón.'
                  : <><strong>{n}</strong> {n === 1 ? 'fila' : 'filas'} a completar
                      ({celdas} celdas: el nombre en <strong>F</strong> y la cuenta de Odoo en{' '}
                      <strong>S</strong>). No se toca ninguna otra columna.</>}
            </div>

            {/* Las primeras filas, con nombre y todo: confirmar a ciegas no es confirmar. */}
            {!escrito && celdas > 0 && (
              <details style={{ marginBottom: 14, fontSize: 12.5, color: '#334155' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#1E40AF' }}>
                  Ver las {celdas} celdas, una por una
                </summary>
                <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', fontFamily:
                              'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.7 }}>
                  {(r.escrituras ?? []).map((e, i) => (
                    <div key={i}>
                      {e.columna}{e.fila} <span style={{ color: '#94A3B8' }}>←</span>{' '}
                      <span style={{ color: '#0F172A' }}>{JSON.stringify(e.valor)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} style={BTN_SEC}>
            {escrito ? 'Cerrar' : 'Cancelar'}
          </button>
          {r.ok && !escrito && n > 0 && (
            <button type="button" onClick={onConfirmar} disabled={trabajando}
                    style={{ ...BTN_PRI, opacity: trabajando ? 0.5 : 1 }}>
              {trabajando ? 'Escribiendo…' : `Sí, escribir ${celdas} celdas`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
