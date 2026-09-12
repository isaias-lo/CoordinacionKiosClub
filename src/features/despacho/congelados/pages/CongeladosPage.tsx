'use client';

import { useEffect, useState } from 'react';
import { X, ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados, type CalRecord } from '@/lib/calendarioCongeladosSync';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { pushCounts, fetchCounts, subscribeToSesion, type CountMap } from '@/lib/despachoSesion';
import { registradasDesdeSesion } from '../utils/registradasCongelados';
import { tiendasCongeladosDelDia, cajasCongeladosPorTienda } from '../utils/congeladosData';
import { esCongeladoContenido } from '../../shared/congeladosBodega';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { computeStoreStatus } from '../../shared/storeStatus';
import { gruposDeZona, perteneceAZona, tiendasGrillaCongelados, type ZonaCongelados } from '../utils/congeladosGrid';
import { formatCod } from '../../rutas/utils/helpers';
import { fechaDDMM } from '../../rutas/utils/flotaInterna';
import { TIENDAS as TIENDAS_NACIONAL } from '../../regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '../../santiago/data/tiendasSantiago';
import { CongeladosDetalle } from '../components/CongeladosDetalle';
import { CongeladosListaTiendas } from '../components/CongeladosListaTiendas';
import { CongeladosResumenPanel } from '../components/CongeladosResumenPanel';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { sheetsCongeladosWrite } from '../utils/sheetsCongelados';
import { construirItemsCongelados, type SlotCongelado } from '../utils/construirItemsCongelados';
import { fechaChile } from '@/lib/fechaChile';
import { resumenCongelados, textoTotalCongelados } from '../utils/resumenCongelados';
import { fechaLargaCL, conMayusculaInicial } from '@/lib/fechaTexto';

// Slot de picking_pallets ya filtrado a congelados (esCongeladoContenido). Superset de
// SlotCongelado (agrega `contenido`, que ya no hace falta una vez filtrado pero se conserva
// porque el fetch lo trae de todas formas).
type PickingSlotCongelado = SlotCongelado & { contenido: string };

// Reverse lookup cod → tienda (catálogo Nacional/Regiones), igual patrón que TiendasPage.
// [Bug 60PBL, 2026-09-10] `TIENDAS_NACIONAL` es el mismo objeto mutable `TIENDAS` de
// regiones/data/tiendas.ts (import con alias) — `registrarTiendasBD` le agrega tiendas en
// runtime (tras el fetch a /api/tiendas) que solo viven en Config. Tiendas, no en el
// SENDU_EXTRAS curado a mano. Un `const` calculado una sola vez al cargar el módulo tomaba la
// foto ANTES de esa hidratación y se quedaba ciego para siempre a esas tiendas — le pasó a 60PBL
// también acá. Ahora se recalcula fresco en cada llamada.
function codToNacional(): Record<string, typeof TIENDAS_NACIONAL[string]> {
  return Object.fromEntries(Object.values(TIENDAS_NACIONAL).map(t => [t.cod, t]));
}

function nombreDeTienda(cod: string, zona: ZonaCongelados): string {
  if (zona === 'nacional') return codToNacional()[cod]?.name ?? cod;
  return getTiendaSantiagoByCod(cod)?.tienda ?? cod;
}

interface Props {
  zona: ZonaCongelados;
}

/* ── Detalle de una tienda en celular: el mismo cuerpo del centro, dentro de un modal.
     En escritorio esto no se usa — ahí el detalle es la columna del medio. ── */
function CongeladoDetailModal({ cod, nombre, cc, cn, saving, registrada, onChangeCC, onChangeCN, onClose, onRegistrar }: {
  cod: string; nombre: string; cc: number; cn: number; saving: boolean; registrada: boolean;
  onChangeCC: (v: number) => void; onChangeCN: (v: number) => void;
  onClose: () => void; onRegistrar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/50 backdrop-blur-sm lg:hidden"
      onClick={saving ? undefined : onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-sm overflow-hidden"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ background: 'rgba(8,145,178,0.06)', borderColor: 'rgba(8,145,178,0.15)' }}>
          <div>
            <div className="font-barlow-condensed text-[13px] font-extrabold tracking-wide text-[#0891B2]">{formatCod(cod)}</div>
            <h3 className="font-barlow-condensed text-[19px] font-bold text-navy leading-tight">{nombre}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar"
            className="text-text-3 cursor-pointer p-1 disabled:opacity-30">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 pb-5">
          <CongeladosDetalle
            cod={cod} nombre={nombre} cc={cc} cn={cn}
            saving={saving} registrada={registrada}
            onChangeCC={onChangeCC} onChangeCN={onChangeCN} onRegistrar={onRegistrar}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Toast simple (sin AppContext: esta pantalla se monta fuera del Provider) ── */
function CongeladoToast({ msg, color }: { msg: string; color: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg text-white font-barlow-condensed text-[15px] font-bold shadow-lg"
      style={{ background: color }}>
      {msg}
    </div>
  );
}

/**
 * Pantalla CONGELADOS (Nacional / RM-Costa según `zona`) — grilla de tiendas con sus cajas de
 * picking congelados; al tocar una tienda se abre el detalle CC/CN (steppers) y el botón
 * "Registrar Congelados" escribe a la hoja DESPACHO CONGELADOS del jefe + Supabase (counts).
 */
export function CongeladosPage({ zona }: Props) {
  const { profile, accessToken } = useAuth();
  const [cal, setCal] = useState<CalRecord | null>(null);
  const [slotsPorTienda, setSlotsPorTienda] = useState<Record<string, PickingSlotCongelado[]>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const odooProgress = useOdooProgress();
  // [M-06] Congelados se ARMA un día y se despacha al día hábil siguiente, y la ruta se hace
  // después (lo del viernes se rutea el fin de semana). Con la pantalla clavada en "hoy", la carga
  // de otro día no se podía ni ver ni registrar. El calendario de congelados marca el día de
  // ARMADO, así que esta fecha es la del armado — la misma con la que se rutea en el Enrutador.
  const [fechaTrabajo, setFechaTrabajo] = useState(() => fechaChile());
  const [verSinCarga, setVerSinCarga] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Record<string, { cc: number; cn: number }>>({});
  // [Fase 3] Ya NO sale de localStorage. La marca era por dispositivo: alguien registraba desde el
  // computador y en la tablet del andén esas tiendas seguían apareciendo sin registrar, así que dos
  // personas podían registrar la misma tienda dos veces. El hecho ya está en `despacho_sesion` —
  // se deriva de ahí en vez de guardar otra copia que se desincronice.
  const [registradas, setRegistradas] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [verResumenMovil, setVerResumenMovil] = useState(false);

  /* ── Paneles redimensionables, igual que Bodega RM/Costa y Nacional ── */
  const { width: leftWidth, isDesktop, handleMouseDown: onDragLeft, handleTouchStart: onTouchLeft } =
    useResizablePanel({ storageKey: 'congelados_left_panel_width',  defaultWidth: 260 });
  const { width: rightWidth, handleMouseDown: onDragRight, handleTouchStart: onTouchRight } =
    useResizablePanel({ storageKey: 'congelados_right_panel_width', defaultWidth: 280, inverted: true });

  // Si cambia la zona (o cruza medianoche mientras la pantalla queda montada), recarga el set
  // de registradas desde la clave de localStorage correcta.
  // Se lee de la base al abrir y se mantiene al día con los cambios de los otros dispositivos.
  useEffect(() => {
    let vivo = true;
    const hoy = fechaTrabajo;
    const releer = () => {
      fetchCounts(hoy)
        .then(filas => { if (vivo) setRegistradas(registradasDesdeSesion(filas, zona)); })
        .catch(() => {});
    };
    releer();
    const unsub = subscribeToSesion(hoy, () => releer());
    return () => { vivo = false; unsub(); };
  }, [zona, fechaTrabajo]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Calendario de Congelados: fetch + realtime ── */
  useEffect(() => {
    let cancelled = false;
    // Si el calendario no llega, la grilla se queda esperando (ver `loaded`): mejor seguir con las
    // tiendas que tienen cajas que dejar la pantalla en blanco.
    fetchCalendarioCongelados()
      .then(c => { if (!cancelled) setCal(c); })
      .catch(() => { if (!cancelled) setCal({}); });
    const unsub = subscribeToCalendarioCongelados(c => setCal(c));
    return () => { cancelled = true; unsub(); };
  }, []);

  /* ── Slots de picking_pallets de hoy, solo congelados (CC/CN), agrupados por store_cod.
     Espeja el fetch de TiendasPage (mismo cliente, mismos filtros date/is_active/order) pero
     se queda solo con los slots cuyo contenido es congelados y agrupa por código de tienda
     directamente (no por nombre — CONGELADOS cruza los dos catálogos, Nacional y RM/Costa).
     Incluye id/canonical_id/seq (no solo tipo/contenido) para poder registrar cada caja. ── */
  useEffect(() => {
    const dateStr = fechaTrabajo;

    const load = async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id,store_cod,tipo,contenido,canonical_id,seq,peso_kg')
        .eq('date', dateStr)
        .eq('is_active', true)
        .order('id', { ascending: true });
      if (!data) return;
      const slots: Record<string, PickingSlotCongelado[]> = {};
      for (const row of data) {
        const contenido = (row.contenido as string) || '';
        if (!esCongeladoContenido(contenido)) continue;
        const cod = row.store_cod as string;
        if (!cod) continue;
        if (!slots[cod]) slots[cod] = [];
        slots[cod].push({
          id: row.id as number,
          tipo: (row.tipo as string) || 'CC',
          contenido,
          canonical_id: row.canonical_id as string | null,
          seq: row.seq as number | null,
          peso_kg: row.peso_kg as number | string | null,
        });
      }
      setSlotsPorTienda(slots);
      setSlotsLoaded(true);
    };

    void load();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const unsub = subscribeToPickingPallets(debounced, load);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [fechaTrabajo]);

  const cajasPorTienda = cajasCongeladosPorTienda(slotsPorTienda);

  const diaTrabajo = new Date(`${fechaTrabajo}T12:00:00`);
  const codsCalendario = cal ? gruposDeZona(zona).flatMap(g => tiendasCongeladosDelDia(cal, g, diaTrabajo)) : [];
  const codsConCajas = Object.keys(cajasPorTienda);
  const cods = tiendasGrillaCongelados(codsCalendario, codsConCajas, (cod) => perteneceAZona(cod, zona));

  const loaded = cal !== null && slotsLoaded;

  const showToast = (msg: string, color: string) => setToast({ msg, color });

  const abrirDetalle = (cod: string) => {
    setSelected(cod);
    setAjuste(prev => prev[cod] ? prev : {
      ...prev,
      [cod]: { cc: cajasPorTienda[cod]?.cc ?? 0, cn: cajasPorTienda[cod]?.cn ?? 0 },
    });
  };

  const cerrarDetalle = () => { if (!saving) setSelected(null); };

  const setCC = (cod: string, v: number) => setAjuste(prev => ({ ...prev, [cod]: { cc: v, cn: prev[cod]?.cn ?? 0 } }));
  const setCN = (cod: string, v: number) => setAjuste(prev => ({ ...prev, [cod]: { cc: prev[cod]?.cc ?? 0, cn: v } }));

  /* ── Datos de catálogo de una tienda para la fila de la planilla ── */
  const datosTienda = (cod: string) => {
    if (zona === 'nacional') {
      const t = codToNacional()[cod];
      // Nacional (Sendu) no trae ventana horaria en el catálogo estático.
      return { tienda: nombreDeTienda(cod, zona), region: t?.region ?? '', comuna: t?.comuna ?? '', ventana: '' };
    }
    const t = getTiendaSantiagoByCod(cod);
    return { tienda: nombreDeTienda(cod, zona), region: t?.region ?? '', comuna: t?.comuna ?? '', ventana: t?.ventanaHoraria ?? '' };
  };

  /**
   * Registra UNA o VARIAS tiendas en una sola escritura.
   *
   * Antes solo existía el registro de a una, metido dentro del modal — había que abrir cada tienda,
   * ajustar y guardar. Las bodegas de seco tienen un "Registrar" que manda todo junto, y acá no.
   * Mandar las filas de todas las tiendas en UN POST además evita el caso feo de la tanda a medias:
   * seis llamadas y la cuarta falla.
   *
   * Las cantidades salen de `ajuste` si alguien las tocó, y si no, de lo que hay en Picking. Así
   * "Registrar todo" no obliga a abrir tienda por tienda solo para confirmar lo que ya está bien.
   */
  const registrarTiendas = async (codsARegistrar: string[]) => {
    if (!codsARegistrar.length) return;
    setSaving(true);
    try {
      const fechaArmadoISO = fechaTrabajo;
      const fecha = fechaDDMM(fechaArmadoISO);
      // Ninguno de los dos catálogos trae tipo de comuna (urbano/extraurbano) para CONGELADOS
      // todavía — se deja vacío en vez de inventar una heurística nueva.
      const tipoComuna = '';

      const items = codsARegistrar.flatMap(cod => {
        const vals = ajuste[cod] ?? { cc: cajasPorTienda[cod]?.cc ?? 0, cn: cajasPorTienda[cod]?.cn ?? 0 };
        const { tienda, region, comuna, ventana } = datosTienda(cod);
        return construirItemsCongelados({
          cod, tienda, region, comuna, tipoComuna, ventana,
          fecha, fechaArmado: fechaArmadoISO,
          cuentaCC: vals.cc, cuentaCN: vals.cn,
          slots: slotsPorTienda[cod] ?? [],
        });
      });

      const tabla = zona === 'nacional' ? 'despacho_regiones' : 'despacho_rm';
      const res = await sheetsCongeladosWrite(items, { fecha, supervisor: profile?.full_name ?? '' }, tabla, accessToken ?? undefined);
      if (!res.ok) throw new Error(res.mirrorErrores.join('; '));

      // Refleja la carga congelada del día de TODAS las tiendas de la grilla (para el
      // Enrutador) — no solo las que se acaban de registrar.
      const registradasAhora = new Set(codsARegistrar);
      const countsMap: CountMap = {};
      for (const c of cods) {
        const vals = ajuste[c];
        const cajas = registradasAhora.has(c) && vals ? vals.cc + vals.cn : (cajasPorTienda[c]?.total ?? 0);
        countsMap[c] = { p: 0, b: cajas, c: 0, ch: 0 };
      }
      await pushCounts(zona === 'nacional' ? 'congelados-regiones' : 'congelados-santiago', countsMap, undefined, fechaTrabajo);

      // Optimista: se ve al instante. La base es la que manda y la corrige en el próximo evento.
      setRegistradas(prev => new Set([...prev, ...codsARegistrar]));

      // Si la planilla se escribió pero el espejo a la base no, decirlo: un "✓" mentiroso acá es
      // justo lo que hace que después falte carga en el Enrutador sin que nadie sepa por qué.
      if (res.mirrorErrores.length) {
        console.error('[CongeladosPage] espejo a la base falló', res.mirrorErrores);
        showToast('Quedó en la planilla, pero no en la base. Avisa a soporte.', '#F59E0B');
      } else {
        showToast(codsARegistrar.length === 1 ? '✓ Registrado' : `✓ ${codsARegistrar.length} tiendas registradas`, '#16A34A');
      }
      setSelected(null);
    } catch (err) {
      console.error('[CongeladosPage] registrar', err);
      showToast('Error al registrar. Intenta de nuevo.', '#D32F2F');
    } finally {
      setSaving(false);
    }
  };

  const registrar = () => { if (selected) void registrarTiendas([selected]); };

  // [C-02] Hasta que estén las DOS fuentes (calendario + slots de picking) no se dibujan tarjetas
  // reales. Antes se dibujaban las 3 tiendas con cajas y, al llegar el calendario, las 18 se metían
  // ADELANTE y todo se corría: un click hecho en esa ventana abría el modal de la tienda de al lado
  // — y en este módulo lo único que se hace es registrar cajas. El esqueleto no es adorno: ocupa el
  // lugar para que nada salte.
  if (!loaded) {
    return (
      <div className="flex-1 overflow-y-auto p-4" aria-busy="true" aria-label="Cargando tiendas con congelados">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="rounded-card border animate-pulse"
              style={{ height: 104, background: 'var(--color-bg-2)', borderColor: 'var(--color-border)' }} />
          ))}
        </div>
      </div>
    );
  }

  // El selector vive FUERA del `if` de abajo: el día sin carga es justo cuando hace falta poder
  // cambiar de día (un sábado, para volver al viernes y rutear lo del lunes).
  const selectorFecha = (
    <label className="text-[13px] text-text-3 flex items-center gap-1.5">
      <span className="sr-only">Día de armado</span>
      <input type="date" value={fechaTrabajo} max={fechaChile()}
        onChange={e => { if (e.target.value) { setFechaTrabajo(e.target.value); setSelected(null); } }}
        className="text-[13px] px-2 py-1 rounded border cursor-pointer"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
        title="Día en que se armó la carga. Congelados se despacha al día hábil siguiente." />
    </label>
  );

  if (cods.length === 0) {
    // [M-06] Antes era un callejón sin salida: no decía de qué día hablaba ni adónde ir.
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <div className="text-[40px] mb-2 opacity-60" aria-hidden="true">❄</div>
          <p className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin congelados para hoy</p>
          <p className="text-[13px] text-text-3 mt-1">
            {conMayusculaInicial(fechaLargaCL(`${fechaTrabajo}T12:00:00`))}
          </p>
          <div className="flex justify-center mt-3">{selectorFecha}</div>
          <p className="text-[12px] text-text-3 mt-2 leading-snug">
            ¿Vas a rutear lo del día hábil anterior? Elige ese día acá arriba.
          </p>
          <p className="text-[12px] text-text-3 mt-3 leading-snug">
            Las cajas nacen en Picking › Congelados. Si allá hay cajas y acá no aparecen, avísame.
          </p>
          <a href="/picking" className="inline-block mt-3 text-[13px] font-semibold" style={{ color: '#0891B2' }}>
            Ir a Picking →
          </a>
        </div>
      </div>
    );
  }

  const selectedVals = selected ? (ajuste[selected] ?? { cc: 0, cn: 0 }) : null;
  // [M-05] Las que tienen carga primero —y dentro de ellas, las que faltan registrar—; las de cero
  // se colapsan. Registrar es lo que manda la carga al despacho y al Enrutador: si no se hace, las
  // cajas existen en Picking y para nadie más (ver resumenCongelados.ts).
  const resumen = resumenCongelados(cods, cajasPorTienda, registradas);

  const registrarTodo = () => { void registrarTiendas(resumen.pendientesLista); };

  const divisor = (onMouse: (e: React.MouseEvent) => void, onTouch: (e: React.TouchEvent) => void) => (
    <div
      onMouseDown={onMouse} onTouchStart={onTouch}
      className="hidden lg:flex w-[5px] cursor-col-resize items-center justify-center flex-shrink-0 group relative"
      style={{ background: 'var(--color-border)' }}
      role="separator" aria-orientation="vertical"
    >
      <div className="absolute inset-0 transition-colors duration-150 group-hover:bg-[rgba(8,145,178,0.30)]" />
      <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {[0, 1, 2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#0891B2' }} />)}
      </div>
    </div>
  );

  const panelResumen = (
    <CongeladosResumenPanel
      resumen={resumen}
      cajasPorTienda={cajasPorTienda}
      fechaArmado={fechaTrabajo}
      saving={saving}
      onRegistrarTodo={registrarTodo}
    />
  );

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── IZQUIERDA: las tiendas del calendario del día ── */}
      <div className="w-full lg:w-auto flex flex-col overflow-hidden flex-shrink-0 border-r"
           style={{ borderColor: 'var(--color-border)', ...(isDesktop ? { width: leftWidth } : {}) }}>

        <div className="px-3 py-2.5 border-b flex-shrink-0 flex items-center gap-2 flex-wrap"
             style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="font-barlow-condensed text-[16px] font-bold text-text flex-1 min-w-0">
            {textoTotalCongelados(resumen) || 'Sin cajas todavía'}
          </h2>
          {selectorFecha}
          {/* En celular no caben tres columnas: el resumen se abre como pantalla completa. */}
          <button type="button" onClick={() => setVerResumenMovil(true)}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-[12px] font-bold cursor-pointer"
            style={{ background: 'rgba(8,145,178,0.10)', color: '#0891B2' }}>
            <ClipboardList size={14} /> Resumen
            {resumen.pendientes > 0 && (
              <span className="w-[18px] h-[18px] rounded-full text-white text-[10px] font-extrabold flex items-center justify-center"
                style={{ background: '#D97706' }}>{resumen.pendientes}</span>
            )}
          </button>
        </div>

        <CongeladosListaTiendas
          resumen={resumen}
          cajasPorTienda={cajasPorTienda}
          registradas={registradas}
          seleccionada={selected}
          nombreDeTienda={cod => nombreDeTienda(cod, zona)}
          verSinCarga={verSinCarga}
          onToggleSinCarga={() => setVerSinCarga(v => !v)}
          onSelect={abrirDetalle}
        />
      </div>

      {divisor(onDragLeft, onTouchLeft)}

      {/* ── CENTRO: la tienda seleccionada ── */}
      <div className="hidden lg:flex flex-1 min-w-0 flex-col overflow-y-auto">
        {selected && selectedVals ? (
          <div className="p-5 max-w-sm w-full mx-auto">
            <div className="mb-4">
              <div className="font-barlow-condensed text-[13px] font-extrabold tracking-wide" style={{ color: '#0891B2' }}>
                {formatCod(selected)}
              </div>
              <h3 className="font-barlow-condensed text-[22px] font-bold text-navy leading-tight">
                {nombreDeTienda(selected, zona)}
              </h3>
              {(() => {
                const prog = odooProgress.get(selected);
                const total = prog?.congTotal ?? 0;
                if (total === 0) return null;
                const done = prog?.congDone ?? 0;
                const status = computeStoreStatus(total, done);
                return (
                  <p className="text-[12px] text-text-3 mt-1">
                    Picking congelados: {done}/{total}
                    {status === 'complete' ? ' · completo' : ''}
                  </p>
                );
              })()}
            </div>

            <CongeladosDetalle
              cod={selected}
              nombre={nombreDeTienda(selected, zona)}
              cc={selectedVals.cc}
              cn={selectedVals.cn}
              saving={saving}
              registrada={registradas.has(selected)}
              onChangeCC={v => setCC(selected, v)}
              onChangeCN={v => setCN(selected, v)}
              onRegistrar={registrar}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-[220px]">
              <div className="text-[34px] mb-2 opacity-50" aria-hidden="true">❄</div>
              <p className="text-[13px] text-text-3 leading-snug">
                Elige una tienda de la izquierda para revisar y registrar sus cajas.
              </p>
            </div>
          </div>
        )}
      </div>

      {divisor(onDragRight, onTouchRight)}

      {/* ── DERECHA: resumen del día ── */}
      <div className="hidden lg:flex flex-col overflow-hidden flex-shrink-0"
           style={isDesktop ? { width: rightWidth } : undefined}>
        {panelResumen}
      </div>

      {/* Resumen en celular */}
      {verResumenMovil && (
        <div className="fixed inset-0 z-50 flex flex-col lg:hidden bg-bg">
          <div className="px-3 py-3 flex items-center gap-3 flex-shrink-0 border-b"
               style={{ borderColor: 'var(--color-border)' }}>
            <button type="button" onClick={() => setVerResumenMovil(false)} aria-label="Cerrar resumen"
              className="p-1.5 rounded-full cursor-pointer" style={{ background: 'rgba(8,145,178,0.10)', color: '#0891B2' }}>
              <X size={18} />
            </button>
            <span className="font-barlow-condensed text-[16px] font-bold text-navy flex-1">Resumen del día</span>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">{panelResumen}</div>
        </div>
      )}

      {/* En celular el detalle sigue siendo un modal: no hay ancho para tres columnas. */}
      {selected && selectedVals && (
        <CongeladoDetailModal
          cod={selected}
          nombre={nombreDeTienda(selected, zona)}
          cc={selectedVals.cc}
          cn={selectedVals.cn}
          saving={saving}
          registrada={registradas.has(selected)}
          onChangeCC={v => setCC(selected, v)}
          onChangeCN={v => setCN(selected, v)}
          onClose={cerrarDetalle}
          onRegistrar={registrar}
        />
      )}

      {toast && <CongeladoToast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
