'use client';
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Navigation, GripVertical, ClipboardList, User, Store, FileUp, ChevronLeft, AlertTriangle, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSantiago } from '../context/SantiagoContext';
import { IndicadorCanalSano } from '../../shared/IndicadorCanalSano';
import { useApp } from '../../../../context/AppContext';
import { getTiendasSantiagoHoy, TIENDAS_SANTIAGO, getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import { formatCod, matchCodArchivo } from '../../rutas/utils/helpers';
import { getTiendasSantiagoHoyGrouped, getCalendarioSantiagoInicialHoy } from '../utils/calendarSantiago';
import { guideKey } from '../utils/guideKey';
import { subscribeToCalendarChanges } from '../../utils/useCalendario';
import { getTiendasAdelantoHoy } from '../../shared/tiendasAdelanto';
import { CHOCOLATE_DIMS as CHOCOLATE_DIMS_SHARED } from '@/features/despacho/shared/chocolate';
import { CHOCOLATE_BULTO_DIMS, dimsAlCambiarContenido, contenidoSantiago, CONTENIDO_CHOCOLATE } from '@/features/despacho/shared/contenidoCarga';
import { numeroParaUnidadNueva, numerarPorClase, contarPorClase, ordenDeItem, renumerarOrden, etiquetaCard, claseSantiago, bultosSantiago } from '@/features/despacho/shared/numeroCard';
import { leerPeso, limpiarTecleo, avisoDePeso, excedeTopeDuro } from '@/features/despacho/shared/pesoIngresado';
import { remapSlots, etiquetaSuma } from '@/features/despacho/shared/deshacerSuma';
import { recrearSlotConNumero } from '@/features/despacho/shared/recrearSlot';
import { CalManualSheet, type ManualLine } from '../../shared/CalManualSheet';
import type { TiendaSantiago, TipoCargamento, ContenidoSantiago, EstadoItem, SantiagoItem } from '../types';
import { type PickingSlot } from '../components/PickingSlotCards';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { SectionCount } from '../../shared/SectionCount';
import { sectionProgress } from '../../shared/sectionProgress';
import { pushCounts } from '../../../../lib/despachoSesion';
import { CombineItemsModal } from '@/components/CombineItemsModal';
import { sumPeso } from '../../shared/combineUtils';
import { sumarPesoMultiple } from '../../shared/sumarMultiple';
import { finalizarSlotUnion } from '../../shared/finalizarSlotUnion';
import { tipoBadge } from '../tipoTienda';
import { logActividad, ordenToLabel } from '@/lib/actividad';
import { ordenarCardsPorTipo } from '../../shared/ordenCards';
import { avanceTienda, claseUnidad, type AvanceTienda } from '../../shared/unidadVisual';
import { useTarjetaActiva } from '../../shared/useTarjetaActiva';
import { CabeceraTienda, ColaPendientes, FilaPesada, RotuloSeccion, BotonAccion, EtiquetaUnidad, AvisoTiendaTerminada, type OpcionAgregar } from '../../shared/TiendaAbierta';
import { confirmarCambioGuardado, confirmarEliminarVarios } from '../../shared/confirmarGuardado';
import { reconciliarFormRows, findItemForRow } from '../../shared/formRowsReconcile';
import { mismaCargaEscrita } from '../../shared/adoptarItemRemoto';
import { buscarPallet } from '../../shared/buscarPallet';
import { fechaISOLocal } from '../../shared/fechaLocal';
import { useUndoDelete } from '../../shared/useUndoDelete';
import { UndoBar } from '../../shared/UndoBar';
import { tipoCodeSantiago } from '../../shared/tipoCode';
import { registrarTiendasSantiagoBD } from '../data/tiendasSantiago';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import { FilaTienda, BarraDelDia, UnidadesDelDia, FechasBodega, RotuloLista, PieLista, BaldosaAgregar, GRILLA_MOSAICO } from '@/features/despacho/shared/ListaTiendasUI';
import { usePlegarCabecera } from '@/features/despacho/shared/usePlegarCabecera';
import { avanceFila, estadoLista, nuevasTrasTerminar, resumenDia, filtroVigente, pasaFiltro, type FiltroLista } from '@/features/despacho/shared/listaTiendas';
import { RegistrarTiendaButton } from '@/features/despacho/shared/RegistrarTiendaButton';
import { useRegistroDeTiendas } from '@/features/despacho/shared/useRegistroDeTiendas';
import { fechaDespachoBodega } from '@/features/despacho/shared/fechaLocal';
import { CruceDePesosCard } from '@/features/despacho/shared/CruceDePesosCard';
import { useCruceDelDia } from '@/features/despacho/shared/useCruceDelDia';
import { veElCruce } from '@/features/despacho/shared/cruceTienda';
import { useAuth } from '@/components/AuthProvider';
import { TraerOdooButton } from '../../shared/TraerOdooButton';
import { remapPickingSlot } from '../../shared/remapPickingSlot';
import { crearSlotBodega } from '../../shared/crearSlotBodega';
import { useTiendaTerminada, type TerminadaInfo } from '../../shared/useTiendaTerminada';
import { usePresenciaTienda, type ViendoInfo } from '../../shared/usePresenciaTienda';
import { PresenciaBadge } from '../../shared/PresenciaBadge';
import { TiendaTerminadaButton } from '../../shared/TiendaTerminadaButton';
import { AgregarPalletDialog } from '@/features/despacho/shared/AgregarPalletDialog';
import { supabase } from '../../../../lib/supabase';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { fetchSessionState, subscribeToSessionState, pushSessionState } from '@/lib/userSessionState';
import { mergeEntriesByKey } from '../context/mergeItems';
import { processPdf } from '../../regiones/utils/pdfUtils';
import { isRegionesCod, codsRegionesDeBD, registrarCodsRegiones } from '../../regiones/data/tiendas';
import { esDeOtroEspejo, espejoDeTienda, avisoDeOtroEspejo } from '../../shared/duenoDeTienda';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { useDayRollover } from '@/hooks/useDayRollover';
import { MAX_ALTO_CM, excedeAltoMax } from '../../shared/palletLimits';
import { esCongeladoContenido } from '../../shared/congeladosBodega';
import { combinarEnLista } from '../../shared/combinarEnLista';
import { unidadesSinGuardar, avisoSinGuardar } from '../../shared/sinGuardarEnBodega';
import { eliminarSlotPicking, fueRecienBorrado } from '../../shared/eliminarSlotPicking';
import { levantarLapidasDeSlotsVivos } from '../../shared/lapidasBorrado';
import { actualizarSlotPicking, AVISO_SLOT_BORRADO } from '../../shared/actualizarSlotPicking';
import { sincronizarYCruzar } from '../../shared/avisarCruce';
import { faltantesEnLaConsulta, slotsRecienAgregados } from '@/features/despacho/shared/slotRecienAgregado';
import { esSinPesar, DIMS_SIN_PESAR } from '../../shared/sinPesar';
import { subtipoDeCaja, medidasDeCaja, pesoNetoCajaNegra, pesoParaMostrar, etiquetaSubtipo,
         TARA_CAJA_NEGRA, type SubtipoCaja } from '../../shared/subtipoCaja';
import { pesoNetoPallet } from '../../shared/pesoDelPallet';
import { CampoPesoPallet } from '../../shared/CampoPesoPallet';
import { itemDeLaUnidad, fusionarConPrevio, esReingresoDeVerdad } from '../../shared/itemPorUnidad';
import { avisoDeUnidad, avisoEnTerminada } from '../../shared/avisoUnidadEscaneada';
import { useEscaneoBodega } from '../../shared/useEscaneoBodega';
import { llevarATarjeta, huboSaltoReciente } from '../../shared/useLectorBodega';
import { useWakeLock } from '@/hooks/useWakeLock';
import { bannerReapertura, botonReapertura, toastSuma, type MotivoReapertura } from '../../shared/reaperturaAltura';
import { fechaChile } from '@/lib/fechaChile';
import { accionReclamo, avisoYaVisible, avisoRecuperado } from '@/features/despacho/shared/reclamoPreexistente';
import { camposDeSlot } from '@/features/despacho/shared/camposDeSlot';
import { esAgregado, etiquetaAgregado, etiquetaDeUnidad } from '@/features/despacho/shared/adquisicion';

/* ── Calendar localStorage ── */
const todayKey = fechaChile();
const EXTRA_KEY   = `calExtraSANT_${todayKey}`;
const REMOVED_KEY = `calRemovedSANT_${todayKey}`;

/* ── Guías PDF — compartidas con EstadoPage vía Supabase ── */
const GUIDES_KEY = `estadoGuias_${todayKey}`;
type GuideEntry = { fileName: string; guias: string[]; totalSum: number };
function loadGuides(): Record<string, GuideEntry> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(GUIDES_KEY) || '{}'); } catch { return {}; }
}
function saveGuides(g: Record<string, GuideEntry>) { localStorage.setItem(GUIDES_KEY, JSON.stringify(g)); }
function loadExtra():   string[] { try { return JSON.parse(localStorage.getItem(EXTRA_KEY)   || '[]'); } catch { return []; } }
function loadRemoved(): string[] { try { return JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]'); } catch { return []; } }

/* ── Consumed picking slots (physical pallet merges) ── */
type ConsumedSlotsS = Record<string, { p: number; b: number; c: number }>;
const CONSUMED_SLOTS_S_KEY = `consumedPickingSlotsS_${todayKey}`;
function loadConsumedSlotsS(): ConsumedSlotsS { try { return JSON.parse(localStorage.getItem(CONSUMED_SLOTS_S_KEY) || '{}'); } catch { return {}; } }
function saveConsumedSlotsS(v: ConsumedSlotsS) { try { localStorage.setItem(CONSUMED_SLOTS_S_KEY, JSON.stringify(v)); } catch {} }

/* ── Constants ── */
// El pallet también puede llevar Chocolate: el tipo de carga dice QUÉ va adentro, no qué envase es.
// El pallet sigue siendo P1/P2 y conservando sus medidas (ver `dimsAlCambiarContenido`).
const CONTENIDO_PALLET:     ContenidoSantiago[] = ['Comida', 'Hogar', 'Mixto', 'Chocolate'];
const CONTENIDO_BULTO:      ContenidoSantiago[] = ['Hogar', 'Chocolate'];

const ESTADO_DEFAULT: EstadoItem = 'Listo para despachar';
const ESTADOS: EstadoItem[] = [
  'Listo para despachar', 'Despachado', 'Carga recibida', 'Carga No recibida por tienda',
];
// CHOCOLATE_BULTO_DIMS (bulto con contenido Chocolate, legado) vive en shared/contenidoCarga.ts,
// junto a la regla de cuándo se aplica — que es donde estaba el bug.
// Definición ÚNICA en shared/chocolate.ts — estaba escrita en tres lugares (acá,
// regiones/data/tiendas.ts y TiendasPage como CHOCOLATE_DIMS_R, esta última con los campos en
// otro orden), y el peso por defecto en dos. Cambiar la caja obligaba a acordarse de los cinco.
const CHOCOLATE_DIMS         = { ...CHOCOLATE_DIMS_SHARED };

// Alias de códigos que llegan distintos en las guías PDF (campo "SEÑOR (ES)") vs el código real.
// Ej.: BUENAVENTURA 2 es 35BN2, pero en la guía aparece como 35BNT.
const GUIDE_COD_ALIAS: Record<string, string> = { '35BNT': '35BN2' };
const CONTENEDOR_LARGO = 110;
const CONTENEDOR_ANCHO = 80;
const CONTENEDOR_ALTO  = 150;

/* ── FormRow ── */
interface FormRow {
  id: string;
  tipo: TipoCargamento;
  contenido: ContenidoSantiago;
  peso: string;
  alto: string;
  largo: string;
  ancho: string;
  /** Solo pallets: lo que pesa el pallet mismo, en kg. Se le resta al peso. Vacío = nada, que es
   *  el caso normal. Ver `pesoNetoPallet`. */
  pesoPallet?: string;
  saved?: boolean;
  /** La tarjeta se reabrió porque se le SUMÓ algo: el guardado que viene no es trabajo rehecho.
   *  Ver `esReingresoDeVerdad`. Se limpia al guardar. */
  traSuma?: boolean;
  /** La persona escribió algo acá. Distinto de `!saved`, que solo dice que no se guardó EN ESTE
   *  equipo: una tarjeta recién nacida en blanco no está tocada. */
  tocada?: boolean;
  savedItem?: SantiagoItem;
  pickingSlotId?: number;  // FK a picking_pallets.id
  // [Unificar inline / sumar] La fila TARGET (P1) recién unificada o a la que se le sumó carga: el
  // origen ya se sumó y se borró; P1 quedó reabierta con el peso sumado para ingresar la altura y
  // "Agregar" (guardado normal). Sólo flag visual (banner + ocultar chooser); ya está persistido.
  mergeReopened?: boolean;
  mergeMotivo?: MotivoReapertura;
  /** Se reabrió con «Editar». El ítem sigue guardado hasta que se vuelva a guardar: si nadie
   *  termina la edición, no se pierde nada. Ver `puedeAdoptar`. */
  editando?: boolean;
}

// La tarjeta que se está pesando lleva el color de su tipo en el borde; peso y alto van en cifras
// grandes, que es como se leen en la balanza con el pallet delante. Igual que en Nacional.
const ESTILO_ACTIVA: Record<string, string> = {
  pallet: 'border-uni-pallet', bulto: 'border-uni-bulto', contenedor: 'border-uni-contenedor',
  chocolate: 'border-uni-chocolate', agregado: 'border-border-2',
};
const CAMPO = 'w-full bg-card border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-cuerpo outline-none focus:border-navy [-webkit-appearance:none]';
const CAMPO_GRANDE = 'w-full bg-card border-[1.5px] border-border rounded-btn px-3 py-2 text-text font-barlow-condensed text-cifra font-extrabold tabular-nums outline-none focus:border-navy [-webkit-appearance:none]';

/* ── Resumen inline state type ── */
interface ResumenEditState {
  cod: string;
  idx: number;
  tipo: TipoCargamento;
  contenido: ContenidoSantiago;
  estado: EstadoItem;
  peso: string;
  alto: string;
  largo: string;
  ancho: string;
}

/* ═══════════════════════════════════════
   STORE GRID CARD
═══════════════════════════════════════ */
function TiendaGridCard({
  t, isActive, isToday, itemCount, palletCount, contenedorCount, chocolateCount,
  bultoCount, adquisicionCount = 0, webRetiroCount = 0,
  despachoP, despachoB, despachoC, despachoCH, hasGuide, storeDoneOps = 0, storeTotalOps = 0,
  tipoCat, terminada, viendo, sinPesarCount, nuevas = 0,
  onSelect, onAddToday, onRemoveFromToday, forma,
}: {
  t: TiendaSantiago; isActive: boolean; isToday: boolean;
  tipoCat?: string;
  itemCount: number; palletCount: number; contenedorCount: number; chocolateCount: number;
  despachoP?: number; despachoB?: number; despachoC?: number; despachoCH?: number;
  hasGuide?: boolean; storeStatus?: 'none' | 'partial' | 'complete'; storeDoneOps?: number; storeTotalOps?: number;
  /** [Tienda Terminada] Marcador manual de Bodega — se ve por encima de "tiene guía"/"es hoy"
   *  para que quien mira la grilla nunca confunda una tienda cerrada con una que sigue abierta
   *  y todavía puede sumar más pallets. */
  terminada?: boolean;
  /** [Presencia] Quién más tiene esta tienda abierta ahora. */
  viendo?: ViendoInfo[];
  /** Unidades guardadas sin pesar. Se veía solo DENTRO de la tienda; ahora también desde la
   *  lista, que es donde se decide a cuál entrar. Ver `chipFila`. */
  sinPesarCount?: number;
  /** Lo que Picking imprimió después de marcarla terminada. Ver `nuevasTrasTerminar`. */
  nuevas?: number;
  onSelect: () => void;
  onAddToday?: () => void;
  onRemoveFromToday?: () => void;
  /** «Hoy» en baldosas (Mosaico), «Todas» en filas. Ver `ListaTiendasUI`. */
  forma?: 'fila' | 'baldosa';
  bultoCount: number;
  adquisicionCount?: number;
  webRetiroCount?: number;
}) {
  // El bulto ya NO sale por resta: así caían adentro las adquisiciones y los web/retiro. Lo que
  // falta es lo que Picking imprimió (o el despacho espera) y Bodega todavía no cargó.
  const cargadas = { pallet: palletCount, bulto: bultoCount, contenedor: contenedorCount, chocolate: chocolateCount };
  const faltan = {
    pallet: Math.max(0, (despachoP ?? 0) - palletCount), bulto: Math.max(0, (despachoB ?? 0) - bultoCount),
    contenedor: Math.max(0, (despachoC ?? 0) - contenedorCount), chocolate: Math.max(0, (despachoCH ?? 0) - chocolateCount),
  };
  const accion = onRemoveFromToday ? { tipo: 'retirar' as const, onClick: onRemoveFromToday }
    : onAddToday ? { tipo: 'agregar' as const, onClick: onAddToday } : undefined;
  return (
    <FilaTienda cod={formatCod(t.cod)} nombre={t.tienda} tipo={tipoBadge(tipoCat)}
      estado={estadoLista({ cargadas: itemCount, terminada: !!terminada, nuevas })}
      activa={isActive} conGuia={!!hasGuide} nuevas={nuevas}
      avance={avanceFila(cargadas, faltan)}
      agregados={{ adquisicion: adquisicionCount, webRetiro: webRetiroCount }}
      sinPesar={sinPesarCount ?? 0}
      odoo={isToday ? { done: storeDoneOps, total: storeTotalOps } : undefined}
      viendo={viendo} onSelect={onSelect} accion={accion} forma={forma} />
  );
}

/* ═══════════════════════════════════════
   CALENDAR CONFIRMATION MODAL
═══════════════════════════════════════ */
function ConfirmCalendarModal({ name, mode, viendo, onConfirm, onCancel }: {
  name: string; mode: 'add' | 'remove'; viendo?: ViendoInfo[]; onConfirm: () => void; onCancel: () => void;
}) {
  const t = TIENDAS_SANTIAGO.find(t => t.tienda === name);
  const isAdd = mode === 'add';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-navy/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg w-full max-w-xs overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}>
        <div className={`px-5 py-4 border-b text-center ${isAdd ? 'bg-[rgba(30,64,175,0.06)] border-[rgba(30,64,175,0.12)]' : 'bg-[rgba(217,119,6,0.07)] border-[rgba(217,119,6,0.12)]'}`}>
          <h3 className="font-barlow-condensed text-[21px] font-bold text-navy">Modificar calendario</h3>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-[14px] text-text-2 leading-relaxed">
            {isAdd ? '¿Agregar ' : '¿Retirar '}
            <span className="font-bold text-navy">{t?.tienda || name}</span>
            {isAdd ? ' al despacho de hoy?' : ' del despacho de hoy?'}
          </p>
          <p className="text-[12px] text-text-3 mt-1.5">Este cambio aplica solo para hoy.</p>
          {/* [Presencia] Retirar una tienda del día la saca para TODOS al instante — si alguien
              la tiene abierta ahora mismo, avisar explícitamente en vez de sacarla en silencio. */}
          {!isAdd && !!viendo?.length && (
            <p className="text-[12px] text-warn font-bold mt-2 bg-[rgba(217,119,6,0.08)] border border-[rgba(217,119,6,0.25)] rounded px-2 py-1.5">
              ⚠ {viendo.map(v => v.name).join(', ')} {viendo.length > 1 ? 'están' : 'está'} viendo esta tienda ahora mismo.
            </p>
          )}
        </div>
        <div className="flex border-t border-border">
          <button onClick={onCancel}
            className="flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-text-2 bg-bg-2 active:bg-bg-3 cursor-pointer border-r border-border">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-3.5 font-barlow-condensed text-[17px] font-bold text-white cursor-pointer ${isAdd ? 'bg-[#1E40AF]' : 'bg-[#D97706]'}`}>
            {isAdd ? 'Confirmar' : 'Retirar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   FORM HEADER
═══════════════════════════════════════ */
/**
 * La cabecera de la tienda abierta en RM/Costa. Misma pieza que en Nacional (`CabeceraTienda`):
 * lo primero que se lee es cuánto falta, y Registrar / Marcar terminada viven en el menú ⋯ para
 * que no compitan con el pesaje. Los contadores por tipo ahora van en la barra de avance.
 */
function TiendaFormHeader({ tienda, avance, onBack, swipe, terminadaInfo, onToggleTerminada, itemCount, sinPesarCount, sinGuardar, viendo, canalSano, botonRegistrar, agregar }: {
  tienda: TiendaSantiago;
  /** El «+» junto al ⋯: pallet, bulto, contenedor, chocolate, adquisición y web/retiro. */
  agregar?: { opciones: OpcionAgregar[]; bloqueado?: boolean };
  avance: AvanceTienda;
  itemCount: number;
  onBack: () => void;
  swipe?: { start: (e: React.TouchEvent) => void; move: (e: React.TouchEvent) => void; end: () => void };
  terminadaInfo?: TerminadaInfo; onToggleTerminada: (cod: string, terminada: boolean, por?: string) => void;
  sinPesarCount?: number;
  sinGuardar?: string | null;
  viendo?: ViendoInfo[];
  canalSano: boolean;
  botonRegistrar?: React.ReactNode;
}) {
  return (
    <CabeceraTienda
      nombre={tienda.tienda}
      subtitulo={`${formatCod(tienda.cod)} · ${tienda.ventanaHoraria}`}
      avance={avance}
      onVolver={onBack}
      agregar={agregar}
      arrastre={swipe ? { onTouchStart: swipe.start, onTouchMove: swipe.move, onTouchEnd: swipe.end } : undefined}
      indicador={
        <>
          <IndicadorCanalSano canalSano={canalSano} />
          {!!viendo?.length && (
            <span className="flex items-center gap-1 text-apoyo font-semibold text-text-sub flex-shrink-0"
              title={`${viendo.map(v => v.name).join(', ')} viendo esta tienda ahora`}>
              <span className="w-[7px] h-[7px] rounded-full bg-est-ok" />
              {viendo.map(v => v.name.split(' ')[0]).join(', ')}
            </span>
          )}
        </>
      }
      estado={terminadaInfo?.terminada
        ? <span className="text-rotulo font-bold uppercase text-est-ok bg-est-ok-suave rounded-full px-2.5 py-1 flex-shrink-0">✓ Terminada</span>
        : undefined}
      acciones={
        <>
          {botonRegistrar}
          <TiendaTerminadaButton cod={tienda.cod} info={terminadaInfo} onToggle={onToggleTerminada}
            itemCount={itemCount} variante="claro"
            sinPesarCount={sinPesarCount} sinGuardar={sinGuardar} viendo={viendo} />
        </>
      } />
  );
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
/**
 * Props del REGISTRAR (movido del header al pie de la columna derecha, como en Nacional).
 * SantiagoScreen sigue dueño del modal/flag "terminado"; aquí solo se pinta el botón.
 */
type StepFormProps = {
  onRegistrar?: () => void;
  registered?: boolean;
  onReopen?: () => void;
  terminatedAt?: string;
};

export function StepForm({ onRegistrar, registered, onReopen, terminatedAt }: StepFormProps = {}) {
  const router = useRouter();
  const { state, dispatch, flushPending, canalSano, catchUp } = useSantiago();
  const { showToast } = useApp();
  // El cruce contra Odoo, solo para administración. `veElCruce` decide quién lo ve, y ese mismo
  // booleano apaga la consulta: quien no ve el bloque no paga el pedido. Ver `cruceTienda.ts`.
  const { profile } = useAuth();
  const verCruce = veElCruce(profile?.role);
  const cruceDelDia = useCruceDelDia(fechaChile(), verCruce);
  const registroTiendas = useRegistroDeTiendas(fechaChile());

  /**
   * Registra UNA tienda, sin cerrar el dia.
   *
   * Es EXACTAMENTE la misma llamada que hace el modal del dia, con un solo codigo adentro. Eso no
   * es casualidad ni ahorro: de ahi sale que los ids sean identicos, y de que los ids sean
   * identicos sale que registrar el dia despues NO duplique — `api/sheets-write` solo agrega los
   * ids que la hoja no tiene. La fecha de despacho viene de `fechaDespachoBodega`, la misma
   * funcion que usa el modal, por el mismo motivo.
   */
  const registrarSoloTienda = async (cod: string): Promise<boolean> => {
    const lista = items[cod] ?? [];
    if (!lista.length || !regimen) return false;
    const hoyISO = fechaChile();
    try {
      await sheetsSantiagoWrite({ [cod]: lista }, regimen, fechaDespachoBodega(state.fechaDespacho), hoyISO);
      // Volcar la hoja a la base y rehacer el cruce del día. Ver `sincronizarYCruzar`.
      const avisoCruce = await sincronizarYCruzar(hoyISO);
      registroTiendas.marcar(cod);
      logActividad({ accion: 'registrar_tienda', fuente: 'rmcosta', tiendaCod: cod,
        tiendaNombre: getTiendaSantiagoByCod(cod)?.tienda ?? cod });
      // La tienda SÍ quedó registrada — eso no se discute. Lo que puede haber fallado es el informe.
      showToast(avisoCruce ?? `OK ${cod} registrada`, avisoCruce ? '#D97706' : '#16A34A');
      return true;
    } catch (e) {
      console.error('[registrar-tienda]', e);
      showToast('No se pudo registrar la tienda - reintenta', '#D32F2F');
      return false;
    }
  };
  const { pending: undoPending, armar: armarUndo, revertir: revertirUndo, descartar: descartarUndo } = useUndoDelete();
  const { currentTienda, items, regimen } = state;
  const odooProgress = useOdooProgress();  // tiendas con picking terminado hoy
  const { terminadas, marcarTerminada } = useTiendaTerminada();
  // Una tienda terminada no se edita: para cambiar algo hay que reabrirla desde ⋯ (pedido de Isaias, 5 oct 2026).
  const tiendaTerminada = (cod?: string | null) => !!cod && terminadas.get(cod)?.terminada === true;
  // [Presencia] Quién más tiene cada tienda abierta AHORA — pedido 2026-09-09: "no saben quién
  // está haciendo qué". Efímero (Realtime Presence, no tabla): se resetea cuando todos se van.
  // [Presencia por pallet] `slotEnFoco` es la tarjeta cuyo peso/alto/etc. se está escribiendo
  // ahora mismo (se marca al enfocar un input, se limpia al salir) — previene el reingreso EN VEZ
  // de solo registrarlo después de que ya pasó (ver logActividad 'reingreso' en saveRow).
  const [slotEnFoco, setSlotEnFoco] = useState<number | null>(null);
  const { viendoPorTienda, viendoPorSlot } = usePresenciaTienda('nacional', currentTienda?.cod ?? null, slotEnFoco);
  // Salir de la tienda (sin que el input llegue a hacer blur, p. ej. un botón de navegación) no
  // debe dejar un slot "en foco" fantasma para la próxima tienda que se abra.
  useEffect(() => { setSlotEnFoco(null); }, [currentTienda?.cod]);
  // [Aviso de conflicto 2026-09-09] SantiagoContext dispara este evento cuando el merge cross-
  // device detecta que DOS equipos cambiaron el MISMO ítem de forma distinta desde el último
  // sync — gana la copia local igual (nunca se pierde un cambio legítimo en silencio), pero
  // ahora se avisa en vez de resolverlo callado.
  useEffect(() => {
    const onConflicto = (e: Event) => {
      const { cod, orden } = (e as CustomEvent<{ cod: string; orden: string }>).detail;
      const nombre = TIENDAS_SANTIAGO.find(t => t.cod === cod)?.tienda ?? cod;
      showToast(`⚠ ${ordenToLabel(orden)} de ${nombre} cambió mientras alguien más editaba — se guardó tu versión`, '#D97706');
    };
    window.addEventListener('bodega-conflicto-edicion', onConflicto);
    return () => window.removeEventListener('bodega-conflicto-edicion', onConflicto);
  }, [showToast]);
  useDayRollover();  // recarga al cruzar medianoche → evita guías/estado fantasma del día anterior

  /* Mobile view */
  const [view, setView] = useState<'list' | 'form' | 'resumen'>('list');

  /* Calendar */
  const [extraCods,    setExtraCods]    = useState<string[]>(loadExtra);
  const [removedCods,  setRemovedCods]  = useState<string[]>(loadRemoved);
  // Tiendas de adelanto de hoy con destino Santiago/Costa (zona rm | costa).
  // Entran al flujo de la bodega sin tocar el calendario de abastecimiento.
  const [adelantoCods, setAdelantoCods] = useState<string[]>([]);
  const [confirmAdd,   setConfirmAdd]   = useState<string | null>(null);
  const [confirmRemove,setConfirmRemove]= useState<string | null>(null);

  /* Search */
  const [search, setSearch] = useState('');
  const [buscadorConFoco, setBuscadorConFoco] = useState(false);
  const { plegada: cabeceraPlegada, refLista, refCabecera } = usePlegarCabecera(!!search || buscadorConFoco);
  // [Buscar por número de pallet] `focoPallet` = pickingSlotId al que hay que saltar en cuanto su
  // tarjeta exista en el DOM (recién se abrió la tienda, formRows tarda un tick en reconstruirse).
  // `resaltado` es la tarjeta del último salto, marcada hasta el próximo (`.tarjeta-escaneada`).
  const [focoPallet, setFocoPallet] = useState<number | null>(null);
  const [resaltado,  setResaltado]  = useState<number | null>(null);


  /* Combine items (drag-to-merge) — form view */
  const [showCalManual,   setShowCalManual]   = useState(false);
  const [combineModal,    setCombineModal]     = useState<{ srcIdx: number; tgtIdx: number; cod?: string } | null>(null);
  const [formMergeState, setFormMergeState] = useState<{ sourceId: string; targetId: string | null } | null>(null);

  /* [Sumar en masa] Selección múltiple de cards Bulto/Chocolate guardadas. El pallet destino se
     elige con UN clic en su botón en la barra. Se limpia al cambiar de tienda o al registrar. */
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());
  // [Duplicar bulto] Card cuyo control de "duplicar ×N" está abierto + la cantidad elegida.
  const [dupRow, setDupRow] = useState<string | null>(null);
  const [dupN, setDupN]     = useState(2);
  const toggleMergeSel = (rowId: string) => setMergeSel(prev => {
    const next = new Set(prev);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });
  useEffect(() => { setMergeSel(new Set()); setDupRow(null); }, [currentTienda?.cod, registered]);

  /* Combine items — resumen view */
  const [rDragIdx, setRDragIdx] = useState<number | null>(null);
  const [rDropIdx, setRDropIdx] = useState<number | null>(null);
  const [rDragCod, setRDragCod] = useState<string | null>(null);
  const rLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Preset / multi-form */
  const [presets,       setPresets]      = useState<Record<string, { pallets: number; bultos: number; contenedores: number; chocolates: number }>>({});
  const [formRows,             setFormRows]             = useState<FormRow[]>([]);
  // Los slots de Picking del día, indexados por tienda. Es la ÚNICA fuente para contar unidades.
  //
  // Antes había dos mapas gemelos: este y uno liviano (`pickingSlots`, solo `{tipo, contenido}`).
  // Se llenaban juntos con las mismas unidades, pero al borrar un ítem `deletePickingSlot` saca el
  // slot SOLO de este —es el único que tiene `id` con qué filtrar—, así que el liviano se quedaba
  // con la unidad borrada hasta la recarga por Realtime. En esa ventana la resta del ghost —slots
  // de Picking menos ítems cargados— daba positiva: el badge PUNTEADO que aparecía al borrar un
  // chocolate y se iba solo al rato (#568). Los siete lectores pasaron a este mapa, y el liviano
  // quedó escribiéndose sin que nadie lo leyera: una trampa esperando a que alguien lo usara otra
  // vez y reviviera el mismo bug. Se eliminó.
  const [pickingSlotsFull,     setPickingSlotsFull]      = useState<Record<string, PickingSlot[]>>({});
  const [consumedSlotsSant,    setConsumedSlotsSant]     = useState<ConsumedSlotsS>(() => typeof window === 'undefined' ? {} : loadConsumedSlotsS());

  // [Buscar por número de pallet] Salta y resalta la tarjeta en cuanto exista en el DOM. Reintenta
  // solo (deps en formRows) mientras formRows se sigue reconstruyendo tras abrir la tienda.
  useEffect(() => {
    if (focoPallet == null) return;
    // [Handheld] Baja hasta la tarjeta visible, deja el cursor en Peso y la sostiene ahí mientras el
    // formulario termina de armarse y se abre el teclado. Ver `llevarATarjeta`.
    if (!llevarATarjeta(focoPallet)) return;
    // El resaltado queda hasta el próximo salto: con el pallet en la balanza, la persona vuelve a
    // mirar la pantalla y tiene que saber de un vistazo cuál es el que escaneó.
    setResaltado(focoPallet);
    setFocoPallet(null);
  }, [focoPallet, formRows]);

  const [showTodas, setShowTodas] = useState(false);
  // [Mosaico] «+ Agregar» de Hoy abre «Todas», que es donde se agregan tiendas, y la trae a la vista.
  const todasRef = useRef<HTMLDivElement>(null);
  const abrirTodas = () => {
    setShowTodas(true);
    requestAnimationFrame(() => todasRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  // Filtro de la lista de hoy y modo «Editar tiendas de hoy» (la × para retirar). Ver `ListaTiendas.tsx`.
  const [filtroLista, setFiltroLista] = useState<FiltroLista>('todas');
  const [editarHoy, setEditarHoy] = useState(false);

  /* Resumen inline state */
  const [resumenExpanded, setResumenExpanded] = useState<Set<string>>(new Set());
  const [resumenEditing,  setResumenEditing]  = useState<ResumenEditState | null>(null);

  function toggleResumenExpanded(cod: string) {
    setResumenExpanded(prev => {
      const next = new Set(prev);
      next.has(cod) ? next.delete(cod) : next.add(cod);
      return next;
    });
  }

  /* Guías PDF (compartidas con EstadoPage) */
  const [guides,        setGuides]        = useState<Record<string, GuideEntry>>(loadGuides);
  const [guideUploading, setGuideUploading] = useState(false);
  const [guideDragOver,  setGuideDragOver]  = useState(false);
  const guideFileRef = useRef<HTMLInputElement>(null);
  // Sync de guías cross-device (merge por-tienda tipo AppContext): `guidesRef` = copia siempre-actual
  // para el merge; `lastSyncedGuidesRef` = línea base (lo último empujado/adoptado) para saber qué
  // guías cambié yo localmente y no dejar que un eco viejo pise un reemplazo/borrado ajeno.
  const guidesRef           = useRef<Record<string, GuideEntry>>(guides);
  const lastSyncedGuidesRef = useRef<Record<string, GuideEntry>>({});
  useEffect(() => { guidesRef.current = guides; }, [guides]);

  /* ── Resizable panels (left + right, center takes flex-1) ── */
  const { width: leftWidth, isDesktop, handleMouseDown: handleLeftMouseDown, handleTouchStart: handleLeftTouchStart } =
    useResizablePanel({ storageKey: 'santiago_left_panel_width',  defaultWidth: 320, min: 200, max: 520 });
  const { width: rightWidth, handleMouseDown: handleRightMouseDown, handleTouchStart: handleRightTouchStart } =
    useResizablePanel({ storageKey: 'santiago_right_panel_width', defaultWidth: 300, min: 200, max: 520, inverted: true });

  /* Calendar from Sheets */
  const [sheetsTodayGrouped, setSheetsTodayGrouped] = useState<{ rm: string[]; costa: string[] }>(getCalendarioSantiagoInicialHoy);
  const [selectedGrps, setSelectedGrps] = useState<Set<'rm' | 'costa'>>(new Set(['rm']));

  /* Dynamic tiendas from Supabase (merged with static at runtime) */
  const [supabaseTiendasMap, setSupabaseTiendasMap] = useState<Record<string, TiendaSantiago>>({});
  const [tipoCatByCod, setTipoCatByCod] = useState<Record<string, string>>({}); // tipo real del catálogo para el badge

  /* ── Sincronización de guías PDF con Supabase ── */
  useEffect(() => {
    function applyRemoteGuides(remote: unknown) {
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;
      const rg = remote as Record<string, GuideEntry>;
      const prev = guidesRef.current;
      // Merge por-tienda: sólo conservo MI guía de las tiendas que cambié desde el último sync; las
      // que no toqué adoptan la remota (así un reemplazo/borrado ajeno se propaga y no lo pisa mi
      // copia vieja). Antes era `{ ...remote, ...local }` → local ganaba siempre y el reemplazo no llegaba.
      const merged = mergeEntriesByKey(rg, prev, lastSyncedGuidesRef.current);
      // Sin ediciones locales pendientes ⇒ el remoto es autoritativo: avanzo la línea base para no
      // quedar "pegado" en una guía vieja e ignorar futuros cambios remotos.
      if (JSON.stringify(prev) === JSON.stringify(lastSyncedGuidesRef.current)) {
        lastSyncedGuidesRef.current = merged;
      }
      guidesRef.current = merged;
      saveGuides(merged);
      setGuides(merged);
    }
    fetchSessionState('guides').then(remote => {
      const localGuides = loadGuides();
      const remoteGuides =
        remote && typeof remote === 'object' && !Array.isArray(remote)
          ? (remote as Record<string, GuideEntry>)
          : {};
      // Línea base vacía al inicio ⇒ mis guías locales son "dirty" (se conservan) y las remotas
      // rellenan el resto — mismo efecto que el `{ ...remote, ...local }` de antes, pero fija la base.
      const merged = mergeEntriesByKey(remoteGuides, localGuides, {});
      lastSyncedGuidesRef.current = merged;
      guidesRef.current = merged;
      saveGuides(merged);
      setGuides(merged);
      if (Object.keys(localGuides).length > 0) pushSessionState('guides', merged).catch(() => {});
    }).catch(() => {});
    // [P9] Catch-up de guías: re-consulta al reconectar Realtime y al volver a la pestaña/app.
    const refetchGuides = () => { void fetchSessionState('guides').then(applyRemoteGuides).catch(() => {}); };
    let realtimeConnected = false;
    const unsub = subscribeToSessionState('guides', '', applyRemoteGuides, (connected) => {
      const reconnected = connected && !realtimeConnected;
      realtimeConnected = connected;
      if (reconnected) refetchGuides();
    });
    const onVis = () => { if (document.visibilityState === 'visible') refetchGuides(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Subida de guías PDF de Santiago ── */
  const handleGuideFiles = async (files: FileList) => {
    if (!files.length) return;
    setGuideUploading(true);
    const codMap: Record<string, string> = {};
    Object.values(tiendaByCod).forEach(t => { codMap[t.cod] = t.cod; });
    const newGuides = { ...guides };
    let assigned = 0, skipped = 0;
    for (const file of Array.from(files)) {
      const clean = file.name.replace(/\.pdf$/i, '');
      // Código de tienda CONOCIDO más largo con el que empieza el nombre (número inicial + letras +
      // dígito final). Evita que "38SP2" se lea como "38SP" o se confunda con "24SPP".
      // Fallback (alias, ej. 35BNT → 35BN2) resuelto dentro del helper.
      const storeCod = matchCodArchivo(file.name, Object.keys(codMap), GUIDE_COD_ALIAS);
      if (!storeCod) { skipped++; continue; }
      try {
        const data = await processPdf(file);
        if (!data.guias.length) data.guias = [{ num: clean, total: 0 }];
        // Indexar por clave canónica (guideKey) para que la card refleje la guía sin importar la
        // variante Unicode del código con Ñ (37VIÑ/23PEÑ pueden venir en NFC, NFD o sin tilde).
        newGuides[guideKey(storeCod)] = { fileName: file.name, guias: data.guias.map(g => g.num), totalSum: data.totalSum };

        // Subir el PDF (con timbres) al storage y registrar la guía para que el
        // manifiesto la muestre/descargue. En bodega suele subirse antes de existir
        // el manifiesto: la guía queda persistida y el manifiesto la jala al crearse.
        try {
          const fd = new FormData();
          fd.append('file', file);
          const driveRes = await fetch('/api/drive-upload', { method: 'POST', body: fd });
          const driveUrl = driveRes.ok ? (await driveRes.json()).fileId as string : undefined;
          void fetch('/api/ruta-guias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_cod: storeCod, folios: data.guias.map(g => g.num), drive_url: driveUrl }),
          });
        } catch { /* no bloquear la asignación local si falla la subida */ }

        assigned++;
      } catch { skipped++; }
    }
    if (guideFileRef.current) guideFileRef.current.value = '';
    setGuideUploading(false);
    if (assigned > 0) {
      setGuides(newGuides);
      saveGuides(newGuides);
      guidesRef.current = newGuides;
      lastSyncedGuidesRef.current = newGuides; // acabo de empujar ⇒ nueva línea base sincronizada
      pushSessionState('guides', newGuides).catch(() => {});
      showToast(
        `✓ ${assigned} guía${assigned !== 1 ? 's' : ''} asignada${assigned !== 1 ? 's' : ''}${skipped > 0 ? ` · ${skipped} omitida${skipped !== 1 ? 's' : ''}` : ''}`,
        '#16A34A',
      );
    } else {
      showToast('No se pudo asignar. El nombre debe empezar con el código (ej: 21NUC-guia.pdf)', '#D97706');
    }
  };

  useEffect(() => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const todayCode = DAY_CODES[new Date().getDay()];
    const RM_MAP: Record<string, string>    = { PEN: '23PEÑ', '23PEN': '23PEÑ' };
    const COSTA_MAP: Record<string, string> = { VIN: '37VIÑ', '37VIN': '37VIÑ' };

    // Initial fetch (checks localStorage cache first, then Sheets)
    getTiendasSantiagoHoyGrouped()
      .then(grouped => { setSheetsTodayGrouped(grouped); })
      .catch(() => {});

    // Tiendas de adelanto de hoy (solo zona Santiago/Costa)
    getTiendasAdelantoHoy()
      .then(list => setAdelantoCods(list.filter(a => a.zona === 'rm' || a.zona === 'costa').map(a => a.store_cod)))
      .catch(() => {});

    // Real-time sync when the Calendario de Abastecimiento saves from another tab
    return subscribeToCalendarChanges(cal => {
      const day = cal[todayCode];
      if (!day) return;
      const grouped = {
        rm:    (day.rm    || []).map(c => RM_MAP[c]    ?? c),
        costa: (day.costa || []).map(c => COSTA_MAP[c] ?? c),
      };
      if (grouped.rm.length > 0 || grouped.costa.length > 0) {
        setSheetsTodayGrouped(grouped);
      }
    });
  }, []);

  /* Load dynamic tiendas from Supabase (once on mount) */
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.json())
      .then(({ tiendas: data }: { tiendas: Array<Record<string, unknown>> }) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, TiendaSantiago> = {};
        // Tipo REAL del catálogo (Mall/StripCenter/Tienda) para el badge de las cards. Se guarda
        // aparte porque `TiendaSantiago.tipo` colapsa todo a MALL/STRIPCENTER (pierde TIENDA).
        const tcat: Record<string, string> = {};
        for (const t of data) {
          const cod = String(t.codigo ?? '');
          if (!cod || t.activo === false) continue;
          const corredor = String(t.corredor ?? '').toLowerCase();
          const region   = String(t.region   ?? '').toLowerCase();
          const isVR     = corredor.includes('costa') || region.includes('valparaíso') || region === 'vr';
          const raw      = String(t.frecuencia ?? '');
          const dias     = raw ? raw.split(/[,;\s]+/).map(d => d.trim().toUpperCase()).filter(Boolean) : [];
          const tipoVal  = String(t.tipo ?? '');
          if (tipoVal) tcat[cod] = tipoVal;
          map[cod] = {
            cod,
            tienda:         String(t.nombre       ?? ''),
            region:         isVR ? 'VR' : 'RM',
            direccion:      String(t.direccion    ?? ''),
            comuna:         String(t.sector_comuna ?? ''),
            tipo:           (tipoVal === 'MALL' ? 'MALL' : 'STRIPCENTER') as 'MALL' | 'STRIPCENTER',
            ventanaHoraria: String(t.ventana      ?? ''),
            diasDespacho:   dias,
          };
        }
        // El catálogo de RM/Costa era SOLO estático, y una tienda creada en Config no entraba:
        // al registrar, `sheetsSantiago` la descartaba entera y en silencio. Nacional ya hacía
        // esto (`registrarTiendasBD`); acá faltaba la otra mitad. Ver `tiendasSantiago.ts`.
        const nuevas = registrarTiendasSantiagoBD(map);
        if (nuevas.length) console.info('[bodega] tiendas de la BD sumadas al catálogo RM/Costa:', nuevas.join(', '));
        // Y las de Regiones que vienen de Config se CLASIFICAN como tales, aunque esta pantalla no
        // las muestre. Sin esto, `isRegionesCod` acá solo conocía las 17 curadas a mano y una
        // tienda de Regiones creada en Config —60PBL— aparecía en la lista de RM/Costa como si
        // fuera de Santiago. Y el resultado dependía del ORDEN de las pestañas: el Set solo se
        // llenaba si alguien había abierto Nacional antes, en la misma carga de la página.
        registrarCodsRegiones(codsRegionesDeBD(data));
        setSupabaseTiendasMap(map);
        setTipoCatByCod(tcat);
      })
      .catch(() => {});
  }, []);

  /* Despacho ↔ Santiago bidirectional sync */
  const [despachoCounts, setDespachoCounts] = useState<Record<string, { p: number; b: number; c: number }>>({});

  // Write santiagoCounts whenever items change → Despacho reads this
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const counts: Record<string, { p: number; b: number; c: number; ch: number }> = {};
    // [P5] Tiendas que ESTE cliente tiene en pantalla: acota el borrado de `despacho_sesion` a su
    // propio universo, para no borrar las cargadas por otra persona (ver pushCounts).
    const conocidas = Object.keys(items);
    Object.entries(items).forEach(([cod, list]) => {
      const p  = list.filter(i => i.tipo === 'Pallet').length;
      const b  = bultosSantiago(list);   // los agregados viajan como bulto — ver numeroCard
      const c  = list.filter(i => i.tipo === 'Contenedor').length;
      const ch = list.filter(i => i.tipo === 'Chocolate').length;
      if (p > 0 || b > 0 || c > 0 || ch > 0) counts[cod] = { p, b, c, ch };
    });
    const todayKey = fechaChile();
    localStorage.setItem('santiagoCounts', JSON.stringify({ date: todayKey, counts }));
    pushCounts('santiago', counts, conocidas).catch(() => {});
  }, [items]);

  // Read despachoCounts → sync from Despacho
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const todayDate = new Date();
    const todayKey  = `${todayDate.getFullYear()}-${String(todayDate.getMonth()+1).padStart(2,'0')}-${String(todayDate.getDate()).padStart(2,'0')}`;
    const sync = () => {
      try {
        const raw = localStorage.getItem('despachoCounts');
        if (!raw) { setDespachoCounts({}); return; }
        const payload: { date?: string; counts?: Record<string, { p: number; b: number; c?: number }> } = JSON.parse(raw);
        // New format: { date, counts } — discard if from a different day
        if (payload.counts !== undefined) {
          const c = payload.date === todayKey ? payload.counts : {};
          setDespachoCounts(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { p: v.p, b: v.b, c: v.c ?? 0 }])));
        } else {
          // Legacy format: plain counts object (no date stamp)
          const raw2 = payload as Record<string, { p: number; b: number; c?: number }>;
          setDespachoCounts(Object.fromEntries(Object.entries(raw2).map(([k, v]) => [k, { p: v.p, b: v.b, c: v.c ?? 0 }])));
        }
      } catch (_) {}
    };
    sync();
    window.addEventListener('storage', sync);
    const interval = setInterval(sync, 2000);
    return () => { window.removeEventListener('storage', sync); clearInterval(interval); };
  }, []);

  // Load picking slots from picking_pallets (today) — feeds P/C/B + contenido in RM/Costa
  useEffect(() => {
    const dateStr = fechaChile();

    const load = async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id,store_cod,tipo,subtipo,contenido,seq,canonical_id,peso_kg,alto,largo,ancho,peso_v,picker_label,is_active')
        .eq('date', dateStr)
        .eq('is_active', true)
        .order('id', { ascending: true });
      if (!data) return;
      const full:  Record<string, PickingSlot[]> = {};
      for (const row of data) {
        if (fueRecienBorrado(row.id as number)) continue; // [RC-3] no revivir un slot recién borrado
        const cod = row.store_cod as string;
        if (!full[cod]) full[cod] = [];
        full[cod].push({
          id:           row.id as number,
          tipo:         (row.tipo as string) || 'P',
          contenido:    (row.contenido as string) || 'hogar',
          seq:          row.seq as number | null,
          subtipo: row.subtipo as string | null,
          canonical_id: row.canonical_id as string | null,
          peso_kg:      row.peso_kg as number | null,
          alto:         row.alto as number | null,
          largo:        row.largo as number | null,
          ancho:        row.ancho as number | null,
          peso_v:       row.peso_v as number | null,
          picker_label: row.picker_label as string | null,
        });
      }
      // [RC-5] Lo recién creado que esta consulta todavía no ve. Sin esto, `load` reemplaza el
      // mapa entero y el pallet recién agregado desaparece de la pantalla aunque exista en la base.
      for (const { clave, slot } of faltantesEnLaConsulta(full, slotsRecienAgregados(), cod => cod)) {
        if (!full[clave]) full[clave] = [];
        full[clave].push(slot);
      }
      // [Lápidas] Todo lo que la base acaba de devolver EXISTE, así que su lápida no vale.
      //
      // Es la red que evitó que el 30/09 se repitiera: una unidad restaurada con el mismo id
      // quedaba con una lápida encima para siempre y el merge le borraba la tarjeta una y otra
      // vez. Acá no importa por qué puerta haya vuelto — si está viva, la lápida muere.
      //
      // Los recién borrados NO entran: `load` ya los saltó arriba con `fueRecienBorrado`, que es
      // lo que impide que una consulta en vuelo resucite algo que se acaba de borrar.
      levantarLapidasDeSlotsVivos(Object.values(full).flat().map(s => s.id));
      setPickingSlotsFull(full);
    };

    void load();

    // Debounce: bursts of events (e.g. combine op touching many rows) collapse into one reload
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const unsub = subscribeToPickingPallets(debounced, load);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);

  const formScrollRef        = useRef<HTMLDivElement>(null);
  const formScrollDesktopRef = useRef<HTMLDivElement>(null);
  const pickingSlotsFullRef  = useRef(pickingSlotsFull);
  const sheetRef             = useRef<HTMLDivElement>(null);
  const sheetDrag            = useRef({ start: 0, delta: 0 });

  /* Keep ref in sync so form-init effect always reads latest picking without re-running */
  useEffect(() => { pickingSlotsFullRef.current = pickingSlotsFull; }, [pickingSlotsFull]);

  /**
   * El `seq` del slot de picking vinculado — el número que quedó IMPRESO en la etiqueta. Es lo
   * que le permite a un CH conservar su número cuando borran o suman a sus vecinos. Lee del ref
   * para que los handlers no trabajen con una foto vieja de los slots.
   */
  const seqDeSlot = (cod: string, slotId?: number): number | null =>
    slotId ? ((pickingSlotsFullRef.current[cod] ?? []).find(s => s.id === slotId)?.seq ?? null) : null;

  /**
   * Igual que `seqDeSlot` pero leyendo el ESTADO: el render tiene que volver a pintar cuando el
   * seq llega por realtime (Picking lo escribe recién al imprimir la etiqueta).
   */
  const seqDeFila = (r: { pickingSlotId?: number }): number | null =>
    r.pickingSlotId
      ? ((pickingSlotsFull[currentTienda?.cod ?? ''] ?? []).find(s => s.id === r.pickingSlotId)?.seq ?? null)
      : null;

  /**
   * Etiqueta visible de una fila: su `seq` impreso.
   *
   * Se numera la LISTA ENTERA y se busca la fila, en vez de contar su posición: el reparto de la
   * unidad sin `seq` necesita ver a todas sus hermanas para no darle un número ya tomado.
   *
   * Contar la posición era además lo que hacía que la card cambiara de nombre sola: el backfill
   * agrega las tarjetas que faltan AL FINAL, así que un slot que llegaba tarde le cedía su número
   * al de al lado y parecía que alguien había borrado un pallet. Ver la cabecera de `numeroCard`.
   */
  const labelDeFila = (r: FormRow, lista: FormRow[]): string => {
    const numerada = numerarPorClase(lista, x => claseSantiago(x.tipo), x => seqDeFila(x));
    const mia = numerada.find(n => n.item.id === r.id);
    return etiquetaCard(r.tipo, mia?.numero ?? 1);
  };

  /* ── Derived ── */
  const localTodayCods  = getTiendasSantiagoHoy().map(t => t.cod);
  const sheetsAllCods   = [...sheetsTodayGrouped.rm, ...sheetsTodayGrouped.costa];
  const baseTodayCods   = sheetsAllCods.length > 0 ? sheetsAllCods : localTodayCods;
  const baseConAdelanto = [...baseTodayCods, ...adelantoCods.filter(c => !baseTodayCods.includes(c))];
  const allTodayCods    = [...baseConAdelanto, ...extraCods.filter(c => !baseConAdelanto.includes(c))]
    .filter(c => !removedCods.includes(c));
  // Static takes priority over Supabase (more carefully maintained)
  const tiendaByCod     = { ...supabaseTiendasMap, ...Object.fromEntries(TIENDAS_SANTIAGO.map(t => [t.cod, t])) };
  const todayTiendas    = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t);
  const filtered        = Object.values(tiendaByCod).filter(t => {
    // La bodega Santiago solo maneja Santiago (RM) + Costa (VR). Las tiendas de
    // Regiones llegan vía /api/tiendas y NO deben aparecer aquí (van en su propia bodega).
    if (isRegionesCod(t.cod)) return false;
    const inGrp = t.region === 'VR' ? selectedGrps.has('costa') : selectedGrps.has('rm');
    if (!inGrp) return false;
    const q = search.toLowerCase();
    return !q || t.tienda.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.comuna.toLowerCase().includes(q);
  });
  const filteredCodSet  = new Set(filtered.map(t => t.cod));
  const todayList  = allTodayCods.map(c => tiendaByCod[c]).filter((t): t is TiendaSantiago => !!t && filteredCodSet.has(t.cod));
  const othersList = filtered.filter(t => !allTodayCods.includes(t.cod));
  // [Buscar por número de pallet] Si `search` es puramente numérico y calza con un pickingSlotId
  // activo de CUALQUIER tienda (no solo las que pasan el filtro RM/Costa), se ofrece saltar
  // directo — la persona tiene el número en la mano (etiqueta física), no el nombre de la tienda.
  const palletEncontrado = buscarPallet(pickingSlotsFull, search);
  const tiendaDelPallet  = palletEncontrado ? tiendaByCod[palletEncontrado.claveTienda] : undefined;
  // ¿Esta unidad ya está pesada? Escanear la etiqueta es el primer gesto de pesar algo, así que el
  // aviso llega ANTES del trabajo y no después. Ver `avisoUnidadEscaneada.ts` — es el 14-23% de
  // unidades que se pesaban dos veces porque nadie tenía cómo saber que ya estaba hecho.
  const avisoEscaneo = avisoDeUnidad(palletEncontrado
    ? itemDeLaUnidad(items[palletEncontrado.claveTienda] ?? [], palletEncontrado.slot.id)
    : undefined);
  const saltarAPallet = () => {
    if (!palletEncontrado || !tiendaDelPallet) return;
    // El salto llega a CUALQUIER tienda, y eso incluía las de Nacional. Escanear una etiqueta de
    // Puerto Varas acá metía 47PTV en el estado de RM/Costa, y al registrar los dos espejos
    // escribían la misma tienda con sellos distintos: el cruce sumó las dos. Ver `duenoDeTienda`.
    if (esDeOtroEspejo(tiendaDelPallet.cod, 'rmcosta', isRegionesCod)) {
      showToast(avisoDeOtroEspejo(tiendaDelPallet.cod, espejoDeTienda(tiendaDelPallet.cod, isRegionesCod)), '#D97706');
      return;
    }
    setSearch('');
    setFocoPallet(palletEncontrado.slot.id);
    selectTienda(tiendaDelPallet);
  };

  const allItems           = Object.values(items).flat();
  const statP              = allItems.filter(i => i.tipo === 'Pallet').length;
  const statB              = bultosSantiago(allItems);
  const statCH             = allItems.filter(i => i.tipo === 'Chocolate').length;
  const activeTiendasCount = Object.keys(items).filter(k => items[k].length > 0).length;
  // Contador "terminadas/total del día" por sección (desde todayTiendas = todas las del día,
  // sin importar el filtro RM/Costa activo). Costa = region 'VR'. Terminada = tienda con carga.
  // "Terminada" = movimientos de Odoo completos (semáforo verde, done === total), la MISMA señal
  // que la barra "X/Y movimientos" de la card. No cuenta carga registrada (items) ni guía subida.
  const isTiendaTerminada = (cod: string) => odooProgress.get(cod)?.status === 'complete';
  const rmProg    = sectionProgress(todayTiendas.filter(t => t.region !== 'VR'), t => isTiendaTerminada(t.cod));
  const costaProg = sectionProgress(todayTiendas.filter(t => t.region === 'VR'), t => isTiendaTerminada(t.cod));
  // La barra del día cuenta las tiendas de hoy de los grupos elegidos (RM / Costa), sin mirar la búsqueda.
  // Picking imprimió algo después de marcarla terminada: la tienda deja de contar como lista.
  const nuevasDe = (cod: string) => nuevasTrasTerminar(
    terminadas.get(cod)?.terminada === true,
    unidadesSinGuardar(pickingSlotsFull[cod] ?? [], items[cod] || []).total,
  );
  const estadoDe = (t: TiendaSantiago) => estadoLista({
    cargadas: (items[t.cod] || []).length, terminada: terminadas.get(t.cod)?.terminada === true,
    nuevas: nuevasDe(t.cod),
  });
  const tiendasBarra = todayTiendas
    .filter(t => !isRegionesCod(t.cod) && (t.region === 'VR' ? selectedGrps.has('costa') : selectedGrps.has('rm')));
  const resumenHoy = resumenDia(tiendasBarra.map(estadoDe));
  // Las unidades de la barra salen de las MISMAS tiendas que su «X/Y listas». Antes sumaban todo
  // `items` —Costa con el filtro en RM, tiendas fuera del día— y no cuadraban con el contador.
  const itemsBarra = tiendasBarra.flatMap(t => items[t.cod] || []);
  const barraP  = itemsBarra.filter(i => i.tipo === 'Pallet').length;
  const barraB  = bultosSantiago(itemsBarra);
  const barraCH = itemsBarra.filter(i => i.tipo === 'Chocolate').length;
  const filtroHoy = filtroVigente(filtroLista, resumenHoy);
  const todayVisibles = todayList.filter(t => pasaFiltro(estadoDe(t), filtroHoy));
  const activeTiendas      = [
    ...allTodayCods.filter(c => (items[c] || []).length > 0).map(c => [c, items[c]] as [string, typeof items[string]]),
    ...Object.entries(items).filter(([c, it]) => it.length > 0 && !allTodayCods.includes(c)),
  ];
  const tiendaItems        = currentTienda ? (items[currentTienda.cod] || []) : [];

  const cod = currentTienda?.cod ?? '';
  const pkSlots = pickingSlotsFull[cod] ?? [];
  const cns = consumedSlotsSant[cod] || { p: 0, b: 0, c: 0 };
  const tiendaItemsList = items[cod] || [];
  const gP  = Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - tiendaItemsList.filter(i => i.tipo === 'Pallet').length     - cns.p);
  const gB  = Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - tiendaItemsList.filter(i => i.tipo === 'Bulto').length      - cns.b);
  const gC  = Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - tiendaItemsList.filter(i => i.tipo === 'Contenedor').length  - cns.c);
  // Ghosts absorbed by unsaved form cards; remainder shown as standalone cards
  const unsavedP = formRows.filter(r => !r.saved && r.tipo === 'Pallet').length;
  const unsavedB = formRows.filter(r => !r.saved && r.tipo === 'Bulto').length;
  const unsavedC = formRows.filter(r => !r.saved && r.tipo === 'Contenedor').length;
  type GC = { type: 'p' | 'b' | 'c'; border: string; text: string; bg: string; label: string; key: string };
  const ghostCards: GC[] = [
    ...Array.from({ length: Math.max(0, gP - unsavedP) }, (_, i) => ({ type: 'p'  as const, border: 'rgba(37,99,235,0.35)',   text: '#2563EB', bg: 'rgba(37,99,235,0.03)',   label: 'Pallet', key: `gP${i}`  })),
    ...Array.from({ length: Math.max(0, gB - unsavedB) }, (_, i) => ({ type: 'b'  as const, border: 'rgba(217,119,6,0.35)',  text: '#D97706', bg: 'rgba(217,119,6,0.03)',   label: 'Bulto',  key: `gB${i}`  })),
    ...Array.from({ length: Math.max(0, gC - unsavedC) }, (_, i) => ({ type: 'c'  as const, border: 'rgba(107,33,168,0.35)', text: '#6B21A8', bg: 'rgba(107,33,168,0.03)', label: 'Cont.',  key: `gC${i}`  })),
  ];
  // [Req 3] Orden visual: Pallet → Contenedor → Bulto → Chocolate (estable). El estado
  // formRows queda igual; solo se ordena la VISTA. Los handlers operan por row.id.
  const orderedRows = ordenarCardsPorTipo(formRows, r => r.tipo);
  // Lo que falta pesar y lo ya pesado: así se lee ahora la tienda abierta. Una unidad guardada
  // «sin pesar» no cuenta como pesada — el aviso de la tienda terminada ya existe por eso.
  const pendientes = orderedRows.filter(r => !(r.saved && r.savedItem));
  const pesadas    = orderedRows.filter(r => r.saved && r.savedItem);
  const avance = avanceTienda(
    orderedRows.map(r => ({ tipo: r.tipo, pesada: !!(r.saved && r.savedItem && !esSinPesar(r.savedItem)) })),
    { pallet: ghostCards.filter(g => g.type === 'p').length,
      bulto:  ghostCards.filter(g => g.type === 'b').length,
      contenedor: ghostCards.filter(g => g.type === 'c').length },
  );
  // Cuál de las pendientes va abierta: la del último escaneo, la que se tocó, o la primera.
  const { activaId, elegir: elegirActiva, esperarNueva } = useTarjetaActiva(pendientes, focoPallet);


  // #6 — líneas del "Manual" (lo cargado en esta pantalla). El calendario del sheet es
  // el general de Picking (CalendarioColumnas), no una lista por zona.
  const calManualLines: ManualLine[] = activeTiendas.map(([cod, it]) => ({
    cod,
    nombre: getTiendaSantiagoByCod(cod)?.tienda,
    g: (getTiendaSantiagoByCod(cod)?.region === 'VR' ? 'costa' : 'rm') as 'costa' | 'rm',
    p:  it.filter(i => i.tipo === 'Pallet').length,
    b:  bultosSantiago(it),
    c:  it.filter(i => i.tipo === 'Contenedor').length,
    ch: it.filter(i => i.tipo === 'Chocolate').length,
  }));


  const enrutar = () => {
    const rutasInput = activeTiendas.map(([cod, it]) => ({
      c: cod,
      p: it.filter(i => i.tipo === 'Pallet').length,
      b: bultosSantiago(it),
      ch: it.filter(i => i.tipo === 'Chocolate').length,  // chocolates → detalle; suman al total de bultos
    })).filter(t => t.p > 0 || t.b > 0 || t.ch > 0);
    localStorage.setItem('rutasInput', JSON.stringify(rutasInput));
    sessionStorage.setItem('despacho_from', '/despacho/santiago');
    flushPending(); // push antes de navegar — evita que el debounce se cancele al salir
    router.push('/despacho');
  };

  const goToResumen = () => {
    dispatch({ type: 'CLEAR_TIENDA' });
    setView('resumen');
  };

  /* ── Calendar actions ── */
  const addToToday = (name: string) => {
    const t = Object.values(tiendaByCod).find(t => t.tienda === name); if (!t) return;
    const next = [...extraCods, t.cod];
    setExtraCods(next); localStorage.setItem(EXTRA_KEY, JSON.stringify(next));
    showToast(`✓ ${t.tienda} agregada a hoy`, '#16A34A');
  };
  const removeFromToday = (name: string) => {
    const t = Object.values(tiendaByCod).find(t => t.tienda === name); if (!t) return;
    const newExtra   = extraCods.filter(c => c !== t.cod);
    const newRemoved = [...removedCods, t.cod];
    setExtraCods(newExtra);     localStorage.setItem(EXTRA_KEY,   JSON.stringify(newExtra));
    setRemovedCods(newRemoved); localStorage.setItem(REMOVED_KEY, JSON.stringify(newRemoved));
    showToast(`${t.tienda} retirada de hoy`, '#D97706');
  };

  const selectTienda = (t: TiendaSantiago) => {
    dispatch({ type: 'SELECT_TIENDA', payload: t });
    // [Tarjeta "llena pero no guardada" al entrar] No esperar al próximo tick de polling (que se
    // pausa en background) ni a que el usuario cambie de pestaña: al abrir la tienda es el momento
    // en que más importa tener lo último que guardó un compañero.
    catchUp();
    const existing = items[t.cod] || [];
    const hasManualPreset = presets[t.cod] &&
      (presets[t.cod].pallets > 0 || presets[t.cod].bultos > 0 || (presets[t.cod].contenedores ?? 0) > 0 || (presets[t.cod].chocolates ?? 0) > 0);
    if (existing.length > 0) {
      // Bug A fix: when re-opening a store with existing items, initialise the preset bar
      // to reflect the counts already saved so the inputs show the correct numbers.
      const existP  = existing.filter(i => i.tipo === 'Pallet').length;
      const existB  = existing.filter(i => i.tipo === 'Bulto').length;
      const existC  = existing.filter(i => i.tipo === 'Contenedor').length;
      const existCH = existing.filter(i => i.tipo === 'Chocolate').length;
      setPresets(prev => ({
        ...prev,
        [t.cod]: { pallets: existP, bultos: existB, contenedores: existC, chocolates: existCH },
      }));
    } else if (!hasManualPreset) {
      const slots = pickingSlotsFull[t.cod] ?? [];
      const pkP   = slots.filter(s => s.tipo === 'P').length;
      const pkC   = slots.filter(s => s.tipo === 'C').length;
      const pkB   = slots.filter(s => s.tipo === 'B').length;
      const pkCH  = slots.filter(s => s.tipo === 'CH').length;
      const dc    = despachoCounts[t.cod];
      if (pkP > 0 || pkC > 0 || pkB > 0 || pkCH > 0) {
        setPresets(prev => ({ ...prev, [t.cod]: { pallets: pkP, bultos: pkB, contenedores: pkC, chocolates: pkCH } }));
      } else if (dc && (dc.p > 0 || dc.b > 0)) {
        setPresets(prev => ({ ...prev, [t.cod]: { pallets: dc.p, bultos: dc.b, contenedores: dc.c ?? 0, chocolates: 0 } }));
      }
    }
    setView('form');
  };

  /* ── Form effects ──
     Only re-runs when the selected tienda changes. Uses pickingSlotsFullRef (always current)
     so picking real-time updates do NOT retrigger this and wipe the user's in-progress form.
     useLayoutEffect (no useEffect) → corre antes del paint: nunca se pinta un frame con el
     form de la tienda anterior bajo el header de la nueva. */
  useLayoutEffect(() => {
    if (currentTienda) {
      setTimeout(() => {
        // [Handheld] Si se abrió la tienda escaneando un pallet, el salto ya bajó hasta él: volver
        // arriba lo deshacía (en tiendas con muchos pallets había que ir a buscarlo a mano).
        if (huboSaltoReciente()) return;
        formScrollRef.current?.scrollTo({ top: 0 });
        formScrollDesktopRef.current?.scrollTo({ top: 0 });
      }, 60);
      const existing = items[currentTienda.cod] || [];
      const slots    = pickingSlotsFullRef.current[currentTienda.cod] ?? [];

      const SANT_TIPO: Record<string, TipoCargamento> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate' };
      const mapearCont = contenidoSantiago;

      const fullSlots = pickingSlotsFullRef.current[currentTienda.cod] ?? [];
      const baseSlotsRaw = fullSlots.length > 0
        ? fullSlots
        : slots.map(s => ({ id: 0, tipo: s.tipo, subtipo: null, contenido: s.contenido,
            seq: null, canonical_id: null, peso_kg: null, alto: null, largo: null, ancho: null, peso_v: null }));
      // SECO excluye congelados: los slots CC/CN (contenido='congelados') no generan
      // card fantasma en el formulario seco — son del módulo CONGELADOS.
      const baseSlots = baseSlotsRaw.filter(s => !esCongeladoContenido(s.contenido));
      const hasPicking = baseSlots.length > 0;

      if (hasPicking) {
        // ── Reconstrucción determinista: un row por slot de picking (incluye CH) ──
        // Indexar items guardados: por slot (pickingSlotId) y un pool por tipo de respaldo.
        // OJO: es un ARRAY por slot, no un solo item. Si 2 items guardados terminan con el MISMO
        // pickingSlotId (ej. carrera al materializar el mismo slot dos veces), un Map de 1 solo
        // valor pierde en silencio al primero con el `.set()` del segundo — el ítem seguía
        // existiendo en `existing`/el estado (por eso el conteo daba de más) pero nunca volvía a
        // aparecer como tarjeta editable, así que tampoco se podía borrar desde la UI. Mismo bug
        // reportado 2026-09-08 en TiendasPage.tsx (Regiones), 28 TEM.
        const savedBySlot = new Map<number, SantiagoItem[]>();
        const leftoverByTipo = new Map<string, SantiagoItem[]>();
        for (const it of existing) {
          if (it.pickingSlotId) {
            const arr = savedBySlot.get(it.pickingSlotId) ?? [];
            arr.push(it); savedBySlot.set(it.pickingSlotId, arr);
          } else {
            const arr = leftoverByTipo.get(it.tipo) ?? [];
            arr.push(it); leftoverByTipo.set(it.tipo, arr);
          }
        }
        // Toma un item guardado del pool por tipo (fallback cuando se perdió el vínculo al slot)
        const takeLeftover = (t: TipoCargamento): SantiagoItem | undefined => {
          const pool = leftoverByTipo.get(t);
          return pool && pool.length ? pool.shift() : undefined;
        };

        const rows: FormRow[] = [];
        // Un row por cada slot P/B/C/CH: tarjeta guardada si ya se llenó, si no formulario vacío
        baseSlots.forEach((s, i) => {
          const sid  = (s as { id?: number }).id || 0;
          const tipo = SANT_TIPO[s.tipo] ?? 'Pallet';
          // 1) match por slot  2) fallback: item guardado del mismo tipo sin vínculo
          const slotPool = sid ? savedBySlot.get(sid) : undefined;
          let saved = slotPool?.shift();
          if (saved && slotPool && slotPool.length === 0) savedBySlot.delete(sid);
          if (!saved) saved = takeLeftover(tipo);

          // El chocolate NO se auto-agrega: cae al formulario vacío como el bulto y el pallet.
          //
          // Antes se materializaba acá mismo como tarjeta ya «Agregado», porque tenía peso conocido
          // (20 kg) y medidas fijas: no había nada que escribir. Desde el 22/09/2026 el peso se toma
          // en Bodega, así que saltearse el formulario dejaba a la persona sin dónde escribirlo —
          // veía «Agregado» y tenía que apretar ✎ para corregir algo que nadie había cargado.

          if (saved) {
            // Un ítem guardado SIEMPRE se muestra como tarjeta (nunca vuelve a formulario)
            // El peso vuelve al formulario como BRUTO: la caja negra guarda el neto, y si la
            // fila se rearmara con ese número, volver a guardar restaría la tara otra vez
            // (17 → 13,5 → 10). Ver el par `pesoParaGuardar`/`pesoParaMostrar`.
            const cajaGuardada = saved.tipo === 'Chocolate' ? subtipoDeCaja(s.subtipo) : null;
            rows.push({
              id: `saved-${sid || i}-${Date.now()}`, tipo: saved.tipo, contenido: saved.contenido,
              peso: String(cajaGuardada ? pesoParaMostrar(Number(saved.peso ?? 0), cajaGuardada) : (saved.peso ?? '')),
              alto: String(saved.alto ?? ''),
              largo: String(saved.largo ?? ''), ancho: String(saved.ancho ?? ''),
              saved: true, savedItem: saved, pickingSlotId: sid || saved.pickingSlotId,
            });
          } else {
            rows.push({
              id: `pick-${sid || i}-${Date.now()}`, tipo,
              contenido: mapearCont(s.contenido),
              peso:  s.peso_kg != null ? String(s.peso_kg) : '',
              alto:  s.alto    != null ? String(s.alto)    : '',
              largo: s.largo   != null ? String(s.largo)   : '',
              ancho: s.ancho   != null ? String(s.ancho)   : '',
              pickingSlotId: sid || undefined,
            });
          }
        });
        // Items guardados sin slot vigente (manuales o slot eliminado, o el "sobrante" de un slot
        // duplicado) → al final, siempre como tarjeta.
        const remaining: SantiagoItem[] = [...savedBySlot.values()].flat();
        for (const pool of leftoverByTipo.values()) remaining.push(...pool);
        for (const it of remaining) {
          rows.push({
            id: `savedm-${it.id}`, tipo: it.tipo, contenido: it.contenido,
            peso: String(it.peso ?? ''), alto: String(it.alto ?? ''),
            largo: String(it.largo ?? ''), ancho: String(it.ancho ?? ''),
            saved: true, savedItem: it, pickingSlotId: it.pickingSlotId,
          });
        }
        setFormRows(rows);
      } else if (existing.length === 0) {
        const preset = presets[currentTienda.cod];
        if (preset) {
          const rows: FormRow[] = [];
          for (let i = 0; i < Math.max(0, preset.pallets - existing.filter(x => x.tipo === 'Pallet').length); i++)
            rows.push({ id: `p${i}-${Date.now()}`,  tipo: 'Pallet',    contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          for (let i = 0; i < Math.max(0, preset.bultos - existing.filter(x => x.tipo === 'Bulto').length); i++)
            rows.push({ id: `b${i}-${Date.now()}`,  tipo: 'Bulto',     contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          for (let i = 0; i < Math.max(0, (preset.contenedores ?? 0) - existing.filter(x => x.tipo === 'Contenedor').length); i++)
            rows.push({ id: `c${i}-${Date.now()}`,  tipo: 'Contenedor',contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' });
          const chocPresetCount = Math.max(0, (preset.chocolates ?? 0) - existing.filter(x => x.tipo === 'Chocolate').length);
          if (chocPresetCount > 0 && state.regimen) {
            const regimen = state.regimen;
            const chocItems: SantiagoItem[] = Array.from({ length: chocPresetCount }, (_, i) => ({
              id: `ch-pre-${Date.now()}-${i}`, tiendaCod: currentTienda.cod,
              tipo: 'Chocolate' as TipoCargamento, contenido: 'Chocolate' as ContenidoSantiago,
              peso: 0, alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
              pesoVolumetrico: 0, regimen, orden: `CH${i + 1}`, estado: ESTADO_DEFAULT,
            }));
            dispatch({ type: 'SET_ITEMS', tiendaCod: currentTienda.cod, items: chocItems });
          }
          setFormRows(rows);
        } else {
          // Sin picking, sin items, sin preset: sin filas. La vista compacta (renderMultiForm)
          // mostrará solo los botones + Pallet / + Bulto / + Cont. / + Choc.; al elegir el tipo se
          // agrega la card-formulario (addFormRow crea el slot → # al Agregar).
          setFormRows([]);
        }
      } else {
        // Sin picking pero con items guardados → tarjetas guardadas (recuperan #id)
        const savedRows: FormRow[] = existing
          .map((item, i) => ({
            id: `saved-${i}-${item.tipo}-${Date.now()}`,
            tipo: item.tipo, contenido: item.contenido,
            peso: String(item.peso ?? ''), alto: String(item.alto ?? ''),
            largo: String(item.largo ?? ''), ancho: String(item.ancho ?? ''),
            saved: true, savedItem: item, pickingSlotId: item.pickingSlotId,
          }));
        setFormRows(savedRows);
      }
    } else {
      setFormRows([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTienda?.cod]);

  /* Mantiene formRows al día mientras la tienda ya está abierta (todo lo que NO es "reconstruir
     desde cero al entrar", que hace el useLayoutEffect de arriba). Antes eran tres useEffect
     separados — reconciliar, adoptar, backfill — cada uno con su propia guarda. El bug medido el
     17/09 (10 de 48 unidades pesadas dos veces) vivía en la INTERACCIÓN entre ellos: una tarjeta
     vacía e intacta no calificaba para ninguno de los tres por separado. `reconciliarFormRows`
     corre los tres en el orden que sí evita eso — ver su doc en formRowsReconcile.ts. */
  const currentItems = currentTienda ? items[currentTienda.cod] : undefined;
  const currentSlotsFull = useMemo(
    () => (currentTienda ? (pickingSlotsFull[currentTienda.cod] ?? []) : []),
    [currentTienda, pickingSlotsFull],
  );
  useEffect(() => {
    if (!currentTienda || !currentItems) return;
    const SANT_TIPO: Record<string, TipoCargamento> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate' };
    const mapC = (raw: string): ContenidoSantiago => {
      const c = (raw ?? '').toLowerCase();
      if (c.includes('chocolate')) return 'Chocolate';
      if (c === 'mixto' || c === 'comida-hogar') return 'Mixto';
      const comida = c.includes('comida') || c.includes('alimento');
      const hogar  = c.includes('hogar') || c.includes('aseo') || c.includes('limpieza');
      if (comida && hogar) return 'Mixto';
      if (comida) return 'Comida';
      return 'Hogar';
    };
    setFormRows(prev => reconciliarFormRows(
      prev, currentItems, currentSlotsFull,
      (row, it) => ({
        ...row, tipo: it.tipo, contenido: it.contenido,
        peso: String(it.peso ?? ''), alto: String(it.alto ?? ''),
        largo: String(it.largo ?? ''), ancho: String(it.ancho ?? ''),
        saved: true, savedItem: it,
      }),
      (s, saved) => saved
        ? {
            id: `bk-saved-${s.id}`, tipo: saved.tipo, contenido: saved.contenido,
            peso: String(saved.peso ?? ''), alto: String(saved.alto ?? ''),
            largo: String(saved.largo ?? ''), ancho: String(saved.ancho ?? ''),
            saved: true, savedItem: saved, pickingSlotId: s.id,
          }
        : {
            id: `bk-pick-${s.id}`, tipo: SANT_TIPO[s.tipo] ?? 'Pallet', contenido: mapC(s.contenido),
            peso: s.peso_kg != null ? String(s.peso_kg) : '', alto: s.alto != null ? String(s.alto) : '',
            largo: s.largo != null ? String(s.largo) : '', ancho: s.ancho != null ? String(s.ancho) : '',
            pickingSlotId: s.id,
          },
      // El chocolate se escribe en bruto y se guarda neto: no se compara.
      (row, it) => row.tipo !== 'Chocolate' && row.contenido !== 'Chocolate' && mismaCargaEscrita(row, it),
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItems, currentTienda?.cod, currentSlotsFull]);

  /* [Limpiar contador obsoleto] `consumedSlotsSant` era el mecanismo viejo para "consumir" un
     slot unificado (el fantasma "¿Con cuál fue unificado?"). Ahora la unificación BORRA el slot,
     así que ese contador quedó obsoleto y, si arrastra un valor viejo (localStorage), hace que el
     badge del tile muestre de menos. Se resetea al montar. */
  useEffect(() => { setConsumedSlotsSant({}); saveConsumedSlotsS({}); }, []);





  /* ── Combine items handler ── */
  const handleSantiagoCombineConfirm = (peso: number, alto: number, cod?: string) => {
    const tiendaCod = cod ?? currentTienda?.cod;
    if (!combineModal || !tiendaCod) return;
    const { srcIdx, tgtIdx } = combineModal;
    const allItems = items[tiendaCod] || [];
    const src = allItems[srcIdx];
    const tgt = allItems[tgtIdx];
    if (!src || !tgt) return;
    const contenido: ContenidoSantiago = src.contenido === tgt.contenido ? src.contenido : 'Mixto';
    const pesoVolumetrico = Math.round((alto * src.ancho * src.largo) / 5000);
    const merged: SantiagoItem = { ...src, id: `${tiendaCod}-${Date.now()}`, peso, alto, contenido, pesoVolumetrico };
    // Misma regla que Nacional, en un solo sitio: el fusionado queda en la POSICIÓN del primero
    // de los dos, no al final. (Acá ya era así; se comparte para que no vuelvan a divergir.)
    const newList = combinarEnLista(allItems, srcIdx, tgtIdx, merged);
    const renumbered = renumerarOrden(newList, i => seqDeSlot(tiendaCod, i.pickingSlotId));
    dispatch({ type: 'SET_ITEMS', tiendaCod, items: renumbered });
    // Dos ítems se volvieron uno: la unidad absorbida ya no existe físicamente y su slot tampoco
    // debe existir. Sin esto quedaba vivo, y todo lo que cuenta unidades —Seguimiento, Conteo de
    // Flota— veía una de más; además el backfill le rearmaba una tarjeta vacía al reabrir la
    // tienda. Es lo mismo que ya hacía "unificar"; combinar se había quedado sin hacerlo.
    if (src.pickingSlotId && tgt.pickingSlotId && src.pickingSlotId !== tgt.pickingSlotId) {
      void finalizarSlotUnion(src.pickingSlotId, tgt.pickingSlotId).then(r => {
        if (!r.ok) showToast(`⚠ La unión quedó a medias (${r.error}) — revisá el pallet`, '#D32F2F');
      });
      logActividad({ accion: 'unificar', fuente: 'rmcosta', tiendaCod,
        label: merged.orden, sourceLabel: tgt.orden, slotId: src.pickingSlotId });
    }
    setCombineModal(null);
  };


  const onSheetDragStart = (e: React.TouchEvent) => {
    sheetDrag.current = { start: e.touches[0].clientY, delta: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };
  const onSheetDragMove = (e: React.TouchEvent) => {
    const dy = Math.max(0, e.touches[0].clientY - sheetDrag.current.start);
    sheetDrag.current.delta = dy;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onSheetDragEnd = () => {
    if (!sheetRef.current) return;
    const delta = sheetDrag.current.delta;
    sheetDrag.current.delta = 0;
    sheetRef.current.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)';
    if (delta > 80) {
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }, 340);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
  };

  const updateRow = (id: string, field: keyof FormRow, value: string) =>
    setFormRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      // `tocada` marca que esto es de la persona: desde acá, nada remoto lo pisa.
      const updated = { ...r, [field]: value, tocada: true };
      if (field === 'contenido') {
        // El autorrelleno es de la CAJA de chocolate, así que no aplica a un pallet: un pallet de
        // chocolate mide lo que mide el pallet. Antes esto miraba solo el contenido.
        const dims = dimsAlCambiarContenido(r.tipo === 'Pallet', value, r.contenido);
        if (dims) { updated.alto = dims.alto; updated.largo = dims.largo; updated.ancho = dims.ancho; }
      }
      return updated;
    }));

  const saveRow = async (row: FormRow, sinPesar = false) => {
    if (!currentTienda || !regimen) return;
    const isChoc     = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
    const isChocTipo = row.tipo === 'Chocolate';
    const isCont     = row.tipo === 'Contenedor';
    // De qué caja es este chocolate. La negra tiene medidas fijas y tara; la de cartón ni una ni
    // otra — su tamaño varía, así que no se le inventan medidas ni se le resta un peso constante.
    const caja: SubtipoCaja | null = isChocTipo
      ? subtipoDeCaja((pickingSlotsFull[currentTienda.cod] ?? [])
          .find(s => s.id === row.pickingSlotId)?.subtipo)
      : null;
    const medidasCaja = caja ? medidasDeCaja(caja) : null;
    let p: number, a: number, fL: number, fA: number, pesoV: number;
    if (sinPesar) {
      // "Agregar sin pesar": se guarda con dimensiones en 0 (marca "sin pesar"), sin pedir peso/alto/largo/ancho.
      p = DIMS_SIN_PESAR.peso; a = DIMS_SIN_PESAR.alto; fL = DIMS_SIN_PESAR.largo; fA = DIMS_SIN_PESAR.ancho;
      pesoV = DIMS_SIN_PESAR.pesoVolumetrico;
    } else {
      if (caja === 'negra') {
        // La caja negra se pesa ENTERA y vuelve al CD: se descuenta lo que pesa vacía. Se rechaza
        // lo que no llega a la tara en vez de recortarlo a cero (ver `pesoNetoCajaNegra`).
        const neto = pesoNetoCajaNegra(row.peso);
        if (!neto.ok) { showToast(`⚠ ${neto.error}`, '#D32F2F'); return; }
        p = neto.neto;
      } else if (row.tipo === 'Pallet') {
        // «Peso del pallet»: la tarima no es mercadería, se resta de lo que marcó la balanza.
        // Vacío = nada. Espejo de TiendasPage.
        const neto = pesoNetoPallet(row.peso, row.pesoPallet);
        if (!neto.ok) { showToast(`⚠ ${neto.error}`, '#D32F2F'); return; }
        p = neto.neto;
      } else {
        p = (leerPeso(row.peso) ?? 0); if (!p || p <= 0) { showToast('Ingresa el peso', '#D97706'); return; }
      }
      a  = isCont ? CONTENEDOR_ALTO  : isChocTipo ? (medidasCaja?.alto  ?? 0) : isChoc ? CHOCOLATE_BULTO_DIMS.alto  : (parseFloat(row.alto)  || 0);
      fL = row.tipo === 'Pallet' ? 120 : isCont ? CONTENEDOR_LARGO : isChocTipo ? (medidasCaja?.largo ?? 0) : (isChoc ? CHOCOLATE_BULTO_DIMS.largo : (parseFloat(row.largo) || 0));
      fA = row.tipo === 'Pallet' ? 100 : isCont ? CONTENEDOR_ANCHO : isChocTipo ? (medidasCaja?.ancho ?? 0) : (isChoc ? CHOCOLATE_BULTO_DIMS.ancho : (parseFloat(row.ancho) || 0));
      if (!isCont && !isChocTipo && !a) { showToast('Ingresa el alto', '#D97706'); return; }
      if (row.tipo === 'Bulto' && !isChoc && (!fL || !fA)) { showToast('Ingresa largo y ancho', '#D97706'); return; }
      // Un peso imposible se ataja ACÁ, con la balanza todavía al lado y el bulto todavía arriba.
      // El 28/09 un «353,7» al que se le perdió la coma quedó registrado como 9.357 kg y nadie lo
      // vio hasta cruzarlo contra Odoo al día siguiente. Ver `shared/pesoIngresado.ts`.
      const duro = excedeTopeDuro(p, claseSantiago(row.tipo));
      if (duro) { showToast(`⚠ ${duro}`, '#D32F2F'); return; }
      const aviso = avisoDePeso(p, claseSantiago(row.tipo));
      if (aviso && !window.confirm(`⚠ ${aviso.titulo}\n\n${aviso.detalle}\n\n¿Guardar así?`)) return;
      pesoV = Math.round((a * fL * fA) / 6000 * 100) / 100;
    }
    const cod = currentTienda.cod;

    // Si el row no tiene slot (p. ej. el P1 sembrado al abrir la tienda), crear uno de bodega para
    // que el pallet SIEMPRE tenga # aun antes de que Picking reporte (igual que "+ Pallet"/saveItem).
    let slotId = row.pickingSlotId;
    let nuevoSlot: PickingSlot | undefined;
    if (!slotId) {
      const { slot, error } = await crearSlotBodega({ date: fechaISOLocal(), store_cod: cod, tipo: tipoCodeSantiago(row.tipo), contenido: row.contenido });
      // No seguir sin fila real en picking_pallets: antes esto se tragaba en silencio y el
      // pallet quedaba "confirmado" en el resumen de Bodega pero invisible para Seguimiento/
      // Enrutador/Conteo de Flota (RC-4 — colisión de altas concurrentes). Mejor bloquear el
      // guardado con un aviso claro que dejar un pallet fantasma sin que nadie se entere.
      if (!slot) {
        showToast(`⚠ No se pudo guardar (${error}) — reintenta`, '#D32F2F');
        return;
      }
      nuevoSlot = slot; slotId = slot.id;
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot] }));
    }

    const existing = items[cod] || [];
    // Por CLASE, no por igualdad de string. Los cuatro contadores de antes comparaban
    // `i.tipo === 'Bulto'`, que nunca coincide con 'Adquisicion' ni con 'WebRetiro': las tres
    // adquisiciones de una tienda recibían el MISMO número y colapsaban en una sola fila del ID.
    const claseNueva = claseSantiago(row.tipo);
    const pickingSlot = nuevoSlot ?? (slotId
      ? (pickingSlotsFull[cod] ?? []).find(s => s.id === slotId)
      : undefined);
    // Los `seq` de las hermanas de su misma clase. El número se fija UNA vez acá y no se vuelve a
    // calcular en un guardado simple, así que el reparto tiene que ser correcto ya en este punto.
    const seqsHermanas = existing
      .filter(i => claseSantiago(i.tipo) === claseNueva)
      .map(i => seqDeSlot(cod, i.pickingSlotId));
    const candidato: SantiagoItem = {
      id: `${cod}-${Date.now()}`, tiendaCod: cod, tipo: row.tipo, contenido: row.contenido,
      peso: p, alto: a, largo: fL, ancho: fA,
      pesoVolumetrico: pesoV, regimen,
      // El número impreso del slot, no su posición entre los que hay ahora.
      orden: ordenDeItem(row.tipo, numeroParaUnidadNueva(seqsHermanas, pickingSlot?.seq)),
      estado: ESTADO_DEFAULT,
      pickingSlotId: slotId,
      canonical_id: pickingSlot?.canonical_id ?? undefined,
    };
    // Esta unidad ya puede tener ítem aunque la tarjeta diga "sin guardar": lo guardó otro equipo
    // mientras esta tarjeta estaba abierta. Entonces se completa ese ítem, no se agrega otro.
    const previo = itemDeLaUnidad(existing, slotId);
    const savedItem = previo ? fusionarConPrevio(previo, candidato) : candidato;
    dispatch({ type: 'ADD_ITEM', item: savedItem });
    setFormRows(prev => prev.map(r => r.id === row.id ? { ...r, saved: true, savedItem, pickingSlotId: slotId, traSuma: false, editando: false } : r));
    // El toast "Agregado sin pesar" lo dispara el caller (botón "Sin pesar") tras el await,
    // así queda determinista sin importar si esta función esperó por el fetch del slot.
    if (!sinPesar) showToast(`✓ ${savedItem.orden} ${previo ? 'actualizado' : 'agregado'}`, '#16A34A');
    logActividad({ accion: 'registrar_item', fuente: 'rmcosta', tiendaCod: currentTienda.cod,
      tiendaNombre: currentTienda.tienda, label: savedItem.orden, peso: savedItem.peso, alto: savedItem.alto,
      contenido: savedItem.contenido, slotId });
    // [Bodega · uso simultáneo] La unidad ya tenía un ítem pesado de verdad — alguien la volvió a
    // pesar. El merge lo resuelve bien (no se duplica el ítem), pero el trabajo se hizo dos
    // veces: registrarlo automáticamente evita depender de otra medición manual como la del 17/09.
    if (esReingresoDeVerdad(previo, !!row.traSuma)) {
      logActividad({ accion: 'reingreso', fuente: 'rmcosta', tiendaCod: currentTienda.cod,
        tiendaNombre: currentTienda.tienda, label: savedItem.orden, peso: savedItem.peso, alto: savedItem.alto,
        pesoPrevio: previo!.peso, altoPrevio: previo!.alto, contenido: savedItem.contenido, slotId });
    }

    // Sincronizar dimensiones en picking_pallets si el row tiene slot vinculado. Con las medidas
    // ya fusionadas: un "sin pesar" encima de un bulto pesado no le borra el peso en Picking.
    if (slotId) {
      const { peso: sp, alto: sa, largo: sl, ancho: sw } = savedItem;
      // Si el slot ya no existe, esto AVISA en vez de decir que guardó. Ver
      // `actualizarSlotPicking` — un update de cero filas no da error, y por eso el 30/09 en 12LAS
      // se registraron pesos sobre unidades borradas cuatro minutos antes, con el toast en verde.
      void actualizarSlotPicking(slotId, {
        peso_kg: sp, alto: sa, ancho: sw, largo: sl,
        peso_v: esSinPesar(savedItem) ? 0 : (Math.round((sa * sl * sw) / 6000 * 10) / 10 || null),
      }).then(r => {
        if (r.error) console.error('[picking_pallets update]', r.error);
        if (r.yaNoExiste) showToast(AVISO_SLOT_BORRADO, '#D32F2F');
      });
    }
  };

  const editSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    if (!row?.savedItem) return;
    // El ítem NO se borra al abrir la edición: queda guardado hasta el nuevo «Guardar», que lo
    // reemplaza. Espejo de Nacional, donde está el porqué (`editSavedRow`). Sin slot de Picking no
    // hay con qué reemplazarlo, así que ahí se mantiene el borrado de antes.
    if (row.savedItem.pickingSlotId == null) {
      const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === row.savedItem!.id);
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
    }
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, saved: false, savedItem: undefined, editando: true } : r));
  };

  // Borra el slot de picking_pallets vinculado y lo quita de pickingSlotsFull.
  //
  // `ctx` NO es opcional: es lo que hace que el borrado quede en la bitácora con tienda y número.
  // Ver `eliminarSlotPicking` — de los seis caminos que borran, cuatro no escribían nada.
  const deletePickingSlot = (
    slotId: number | undefined,
    ctx: { label?: string; yaRegistrado?: boolean; codArg?: string; nombreArg?: string },
  ) => {
    // codArg permite borrar el slot desde contextos sin tienda seleccionada (p. ej. el panel
    // Resumen, que lista items de varias tiendas y no fija `currentTienda`).
    const cod = ctx.codArg ?? currentTienda?.cod;
    if (!slotId || !cod) return;
    eliminarSlotPicking(slotId, {   // DB delete + guard anti-revive (RC-3) + bitácora
      fuente: 'rmcosta', tiendaCod: cod,
      tiendaNombre: ctx.nombreArg ?? (cod === currentTienda?.cod ? currentTienda?.tienda : undefined),
      label: ctx.label, yaRegistrado: ctx.yaRegistrado,
    });
    setPickingSlotsFull(prev => {
      const next = { ...prev };
      if (next[cod]) next[cod] = next[cod].filter(s => s.id !== slotId);
      return next;
    });
  };

  const deleteSavedRow = (rowId: string) => {
    if (!currentTienda) return;
    const row = formRows.find(r => r.id === rowId);
    const borrado = row?.savedItem;
    if (borrado) {
      const idx = (items[currentTienda.cod] || []).findIndex(i => i.id === borrado.id);
      if (idx !== -1) dispatch({ type: 'DELETE_ITEM', tiendaCod: currentTienda.cod, idx });
    }
    // El `eliminar_item` ya NO se escribe acá: lo escribe `eliminarSlotPicking`, que es por donde
    // pasan los seis caminos. Acá solo se registraba `if (borrado)` — una fila que había perdido
    // su `savedItem` borraba el slot y no dejaba rastro. Ese `??` de abajo existe justo porque ese
    // caso es real.
    // Su número (seq) se lee ANTES de borrar el slot: después ya no hay de dónde sacarlo, y es lo
    // que permite que el Revertir lo devuelva como CH3 y no como el siguiente libre.
    const slotIdBorrado = row?.pickingSlotId ?? borrado?.pickingSlotId;
    const slotAntes = slotIdBorrado != null
      ? (pickingSlotsFullRef.current[currentTienda.cod] ?? []).find(s => s.id === slotIdBorrado)
      : undefined;
    deletePickingSlot(slotIdBorrado, { label: borrado?.orden ?? (row ? labelDeFila(row, formRows) : undefined) });
    setFormRows(prev => prev.filter(r => r.id !== rowId));
    if (borrado) armarUndo(`${borrado.orden} eliminado`, () => reAgregarItem(borrado, slotAntes));
  };

  // Varios de una vez (barra de seleccionados). Los índices se toman de la lista de AHORA y se
  // borran de mayor a menor: así ninguno se corre. El dispatch ya deja el estado al día al instante.
  const deleteSavedRows = (rowIds: string[]) => {
    if (!currentTienda || rowIds.length === 0) return;
    const cod = currentTienda.cod;
    const filas = formRows.filter(r => rowIds.includes(r.id));
    const actuales = items[cod] || [];
    const indices = filas
      .map(r => r.savedItem ? actuales.findIndex(i => i.id === r.savedItem!.id) : -1)
      .filter(i => i !== -1)
      .sort((a, b) => b - a);
    for (const idx of indices) dispatch({ type: 'DELETE_ITEM', tiendaCod: cod, idx });
    const deshacer: { item: NonNullable<FormRow['savedItem']>; slotAntes?: PickingSlot }[] = [];
    for (const row of filas) {
      const slotId = row.pickingSlotId ?? row.savedItem?.pickingSlotId;
      const slotAntes = slotId != null ? (pickingSlotsFullRef.current[cod] ?? []).find(s => s.id === slotId) : undefined;
      deletePickingSlot(slotId, { label: row.savedItem?.orden ?? labelDeFila(row, formRows) });
      if (row.savedItem) deshacer.push({ item: row.savedItem, slotAntes });
    }
    const ids = new Set(rowIds);
    setFormRows(prev => prev.filter(r => !ids.has(r.id)));
    setMergeSel(new Set());
    if (deshacer.length > 0) {
      armarUndo(`${deshacer.length} eliminado${deshacer.length > 1 ? 's' : ''}`, async () => {
        for (const d of deshacer) await reAgregarItem(d.item, d.slotAntes);
      });
    }
  };

  // Quitar un form row sin guardar (✕) — también borra su slot.
  const removeUnsavedRow = (rowId: string) => {
    const row = formRows.find(r => r.id === rowId);
    // Sin pesar también se registra: esa unidad ya tiene una etiqueta IMPRESA de Picking, y si
    // desaparece sin rastro nadie puede saber si se unió a otra, se creó de más o alguien la sacó.
    deletePickingSlot(row?.pickingSlotId, { label: row ? labelDeFila(row, formRows) : undefined });
    setFormRows(prev => prev.filter(r => r.id !== rowId));
  };

  // [Revertir borrado] Re-crea el slot (create-bodega, nuevo #) y re-agrega el item borrado.
  // El borrado elimina item + slot (ver #290/[[bodega-borrar-slot-picking]]), así que revertir
  // recrea el slot para que el pallet vuelva con su código y a picking_pallets/Seguimiento.
  const reAgregarItem = async (item: SantiagoItem, slotAntes?: PickingSlot) => {
    const cod = item.tiendaCod;
    // Vuelve con su número de antes si nadie lo tomó (ver recrearSlotConNumero); las medidas y el
    // peso se le escriben en el mismo update.
    const { slot: nuevoSlot, conservoNumero, error } = await recrearSlotConNumero({
      date: fechaISOLocal(), store_cod: cod,
      tipo: slotAntes?.tipo ?? tipoCodeSantiago(item.tipo), contenido: item.contenido,
      seqOriginal: slotAntes?.seq, canonicalOriginal: slotAntes?.canonical_id ?? item.canonical_id,
      peso: item.peso, alto: item.alto, largo: item.largo, ancho: item.ancho,
    });
    if (nuevoSlot) setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), nuevoSlot] }));
    // Un CH que no recuperó su número toma el nuevo también en el `orden`: si no, la card y el ID de
    // Sheets dirían CH3 mientras la caja y el slot dicen otra cosa.
    const orden = item.tipo === 'Chocolate' && nuevoSlot?.seq && !conservoNumero
      ? ordenDeItem('Chocolate', nuevoSlot.seq) : item.orden;
    dispatch({ type: 'ADD_ITEM', item: {
      ...item, id: `${cod}-${Date.now()}`, orden,
      pickingSlotId: nuevoSlot?.id, canonical_id: nuevoSlot?.canonical_id ?? item.canonical_id,
    } });
    logActividad({ accion: 'revertir', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda?.tienda,
      revierte: 'borrado', label: orden, slotId: nuevoSlot?.id });
    // Se re-agrega igual sin # cuando falla la creación (mejor que perder la restauración), pero
    // AVISA: si no, el pallet quedaría invisible para Seguimiento/Enrutador sin que nadie lo notara.
    if (!nuevoSlot) showToast(`⚠ ${item.orden} restaurado sin # de bodega (${error})`, '#D97706');
    else if (slotAntes?.seq != null && !conservoNumero) {
      showToast(`↩ ${item.orden} restaurado${orden !== item.orden ? ` como ${orden}` : ''} con código nuevo — el suyo ya estaba tomado`, '#D97706');
    } else showToast(`↩ ${item.orden} restaurado`, '#16A34A');
  };

  // [Revertir unificación] Deshace una unión P3→P1: re-crea el slot del source (se borró en la
  // unión), restaura el peso del slot target, restaura los items previos (el source apunta al slot
  // nuevo) y REABRE la tienda para que la reconstrucción rearme las cards deterministamente.
  interface UnionSnap { cod: string; itemsAntes: SantiagoItem[]; sourceItem: SantiagoItem; oldSrcSlot?: number; tgtSlot?: number; tgtPeso: number; }
  const revertirUnificacion = async (snap: UnionSnap) => {
    const { cod, itemsAntes, sourceItem, oldSrcSlot, tgtSlot, tgtPeso } = snap;
    let newSrcSlotId: number | undefined;
    const { slot: nuevoSlot, error } = await crearSlotBodega({ date: fechaISOLocal(), store_cod: cod, tipo: tipoCodeSantiago(sourceItem.tipo), contenido: sourceItem.contenido });
    if (nuevoSlot) newSrcSlotId = nuevoSlot.id;
    // El source queda sin # si falla — ahora AVISA en vez de fallar en silencio.
    else showToast(`⚠ Revertido sin # de bodega para el source (${error})`, '#D97706');
    // Restaurar peso del slot target (se le sumó el del source) + dims del source re-creado.
    if (tgtSlot) supabase.from('picking_pallets').update({ peso_kg: tgtPeso }).eq('id', tgtSlot).then(({ error }) => { if (error) console.error('[revert union tgt]', error.message); });
    if (newSrcSlotId) supabase.from('picking_pallets').update({ peso_kg: sourceItem.peso, alto: sourceItem.alto, ancho: sourceItem.ancho, largo: sourceItem.largo }).eq('id', newSrcSlotId).then(({ error }) => { if (error) console.error('[revert union src]', error.message); });
    setPickingSlotsFull(prev => {
      const arr = [...(prev[cod] ?? [])].map(s => (s.id === tgtSlot ? { ...s, peso_kg: tgtPeso } : s));
      if (nuevoSlot) arr.push(nuevoSlot);
      return { ...prev, [cod]: arr };
    });
    dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: remapPickingSlot(itemsAntes, oldSrcSlot, newSrcSlotId) });
    // Reabrir la tienda → la reconstrucción (useLayoutEffect [cod]) rearma las cards desde items+slots.
    const t = currentTienda;
    if (t) { dispatch({ type: 'CLEAR_TIENDA' }); setTimeout(() => dispatch({ type: 'SELECT_TIENDA', payload: t }), 40); }
    logActividad({ accion: 'revertir', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: t?.tienda,
      revierte: 'unificacion', sourceLabel: sourceItem.orden, slotId: tgtSlot });
    showToast('↩ Unificación revertida', '#16A34A');
  };

  // [Revertir suma] Foto de lo que había ANTES de sumar bultos/CH a un pallet. Sumar borra el slot
  // del bulto (item + slot), así que revertir tiene que re-crearlo —con su número original— y
  // devolverle al pallet el peso que tenía. Se toma antes de tocar nada.
  interface SumaSnap {
    cod: string;
    palletLabel: string;
    itemsAntes: SantiagoItem[];
    tgtSlot?: number;
    tgtPesoAntes: number | null;
    origenes: {
      label: string; slotId?: number; tipo: string; contenido: string;
      seq: number | null; canonical: string | null;
      peso: number; alto: number; largo: number; ancho: number;
    }[];
  }

  const snapshotSuma = (cod: string, origenRows: FormRow[], palletRow: FormRow, palletLabel: string, pesoPalletAntes: number): SumaSnap => {
    const slots = pickingSlotsFullRef.current[cod] ?? [];
    const tgtSlot = palletRow.pickingSlotId ?? palletRow.savedItem?.pickingSlotId;
    const sTgt = tgtSlot != null ? slots.find(s => s.id === tgtSlot) : undefined;
    return {
      cod,
      palletLabel,
      itemsAntes: [...(items[cod] || [])],
      tgtSlot,
      // El peso del SLOT tal cual estaba (null incluido); si no hay slot, el de la card.
      tgtPesoAntes: sTgt ? sTgt.peso_kg : pesoPalletAntes,
      origenes: origenRows.map(r => {
        const slotId = r.pickingSlotId ?? r.savedItem?.pickingSlotId;
        const sl = slotId != null ? slots.find(x => x.id === slotId) : undefined;
        const it = r.savedItem;
        return {
          label: labelDeFila(r, formRows),
          slotId,
          tipo: sl?.tipo ?? tipoCodeSantiago(r.tipo),
          contenido: sl?.contenido ?? it?.contenido ?? r.contenido,
          seq: sl?.seq ?? null,
          canonical: sl?.canonical_id ?? it?.canonical_id ?? null,
          peso:  it?.peso  ?? ((leerPeso(r.peso) ?? 0)),
          alto:  it?.alto  ?? (parseFloat(r.alto)  || 0),
          largo: it?.largo ?? (parseFloat(r.largo) || 0),
          ancho: it?.ancho ?? (parseFloat(r.ancho) || 0),
        };
      }),
    };
  };

  const revertirSuma = async (snap: SumaSnap) => {
    const mapa = new Map<number, number | undefined>();
    const nuevos: PickingSlot[] = [];
    let sinSlot = 0, conCodigoNuevo = 0;
    for (const o of snap.origenes) {
      const r = await recrearSlotConNumero({
        date: fechaISOLocal(), store_cod: snap.cod, tipo: o.tipo, contenido: o.contenido,
        seqOriginal: o.seq, canonicalOriginal: o.canonical,
        peso: o.peso, alto: o.alto, largo: o.largo, ancho: o.ancho,
      });
      if (o.slotId != null) mapa.set(o.slotId, r.slot?.id);
      if (!r.slot) sinSlot++;
      else { nuevos.push(r.slot); if (o.seq != null && !r.conservoNumero) conCodigoNuevo++; }
    }
    // El pallet vuelve al peso que tenía antes de recibir la suma.
    if (snap.tgtSlot != null) {
      supabase.from('picking_pallets').update({ peso_kg: snap.tgtPesoAntes }).eq('id', snap.tgtSlot)
        .then(({ error }) => { if (error) console.error('[revertirSuma tgt]', error.message); });
    }
    setPickingSlotsFull(prev => {
      const arr = (prev[snap.cod] ?? []).map(sl => (sl.id === snap.tgtSlot ? { ...sl, peso_kg: snap.tgtPesoAntes } : sl));
      return { ...prev, [snap.cod]: [...arr, ...nuevos] };
    });
    // Los items de antes, apuntando a los slots re-creados, y renumerados con el seq que quedó: un
    // CH que no recuperó su número toma el nuevo también en su `orden` (el que va a Sheets).
    const seqLocal = new Map<number, number | null>([
      ...(pickingSlotsFullRef.current[snap.cod] ?? []).map(sl => [sl.id, sl.seq] as const),
      ...nuevos.map(sl => [sl.id, sl.seq] as const),
    ]);
    const restaurados = renumerarOrden(remapSlots(snap.itemsAntes, mapa),
      i => (i.pickingSlotId != null ? seqLocal.get(i.pickingSlotId) ?? null : null));
    dispatch({ type: 'SET_ITEMS', tiendaCod: snap.cod, items: restaurados });
    // Reabrir la tienda → la reconstrucción rearma las cards desde items+slots (igual que revertirUnificacion).
    const t = currentTienda;
    if (t) { dispatch({ type: 'CLEAR_TIENDA' }); setTimeout(() => dispatch({ type: 'SELECT_TIENDA', payload: t }), 40); }
    logActividad({ accion: 'revertir', fuente: 'rmcosta', tiendaCod: snap.cod, tiendaNombre: t?.tienda,
      revierte: 'suma', sourceLabel: snap.origenes.map(o => o.label).join(', '), label: snap.palletLabel, slotId: snap.tgtSlot });
    if (sinSlot) {
      showToast(`⚠ Suma revertida, pero ${sinSlot === 1 ? 'uno quedó' : `${sinSlot} quedaron`} sin # de bodega — revisa la tienda`, '#D97706');
    } else if (conCodigoNuevo) {
      showToast(`↩ Suma revertida · ${conCodigoNuevo === 1 ? 'uno volvió' : `${conCodigoNuevo} volvieron`} con código nuevo (el suyo ya estaba tomado)`, '#D97706');
    } else showToast('↩ Suma revertida', '#16A34A');
  };

  // [Unificar inline] La unificación P3→P1 se hace ahora inline y automática (iniciarUnionInline
  // suma+borra el source en el acto y reabre el target para la altura), conservando el código de
  // P1. Ya no se usa el modal ni /api/picking-pallets/combine para este flujo.

  // Sumar un Bulto/Chocolate a un Pallet/Contenedor: el bulto se elimina (item + slot) y su
  // peso se SUMA al destino (P3 #4). El destino conserva su altura. Sin modal ni altura.
  const sumarBultoAPallet = (bultoRowId: string, palletLabel: string, palletRowId: string) => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const bultoRow  = formRows.find(r => r.id === bultoRowId);
    const palletRow = formRows.find(r => r.id === palletRowId);
    if (!bultoRow || !palletRow) {
      // No debería pasar; si pasa, avisar en vez de quedarse en silencio (evita "freeze").
      showToast('No se pudo sumar: recarga la tienda e inténtalo otra vez', '#D97706');
      return;
    }
    const bultoPeso  = bultoRow.savedItem?.peso  ?? ((leerPeso(bultoRow.peso) ?? 0));
    const pesoActual = palletRow.savedItem?.peso ?? ((leerPeso(palletRow.peso) ?? 0));
    const nuevoPeso  = sumPeso(pesoActual, bultoPeso);

    // El destino se reconfirma ANTES de borrar nada. Antes se borraba el slot del bulto y recién
    // después se chequeaba: si el pallet había cambiado, la función salía con el slot ya borrado y
    // el item todavía en pie — un bulto sin slot, invisible para Seguimiento y el Enrutador.
    if (palletRow.savedItem && !findItemForRow(items[cod] || [], { pickingSlotId: palletRow.pickingSlotId, savedItem: palletRow.savedItem })) {
      showToast('El pallet destino cambió — recarga la tienda e inténtalo otra vez', '#D97706');
      return;
    }
    const snap = snapshotSuma(cod, [bultoRow], palletRow, palletLabel, pesoActual);

    deletePickingSlot(bultoRow.pickingSlotId ?? bultoRow.savedItem?.pickingSlotId, { yaRegistrado: true });

    // Contexto: un solo SET_ITEMS — quita el bulto guardado y suma el peso al pallet guardado,
    // luego renumera. El match es por id ESTABLE (id propio / pickingSlotId), que sobrevive al
    // renumerado tras un eco remoto (causa del "freeze").
    if (bultoRow.savedItem || palletRow.savedItem) {
      const cur = items[cod] || [];
      const filtered = cur
        .filter(i => !(bultoRow.savedItem && i.id === bultoRow.savedItem.id))
        .map(i => (palletRow.savedItem && i.id === palletRow.savedItem.id) ? { ...i, peso: nuevoPeso } : i);
      const renumbered = renumerarOrden(filtered, i => seqDeSlot(cod, i.pickingSlotId));
      dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: renumbered });
    }

    // Form: quitar el bulto y reabrir la tarjeta del pallet con el peso ya sumado, para confirmar
    // la altura — la carga creció y esa medida es la única que el sistema no puede deducir
    // (ver reaperturaAltura.ts). El item sigue guardado: si nadie confirma, no se pierde nada.
    const altoPrevio = palletRow.savedItem?.alto ?? (parseFloat(palletRow.alto) || 0);
    setFormRows(prev => prev
      .filter(r => r.id !== bultoRowId)
      .map(r => r.id === palletRowId
        ? { ...r, saved: false, savedItem: undefined, traSuma: true, peso: String(nuevoPeso),
            alto: altoPrevio ? String(altoPrevio) : '', mergeReopened: true, mergeMotivo: 'suma' as const }
        : r));

    // BD: actualizar el peso del slot del destino (si tiene slot de picking)
    const targetSlotId = palletRow.pickingSlotId ?? palletRow.savedItem?.pickingSlotId;
    if (targetSlotId) {
      supabase.from('picking_pallets').update({ peso_kg: nuevoPeso }).eq('id', targetSlotId)
        .then(({ error }) => { if (error) console.error('[sumarBultoAPallet peso]', error.message); });
    }

    setFormMergeState(null);
    showToast(toastSuma(palletLabel, bultoPeso), '#2563EB');
    logActividad({ accion: 'sumar', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda.tienda,
      sourceLabel: bultoRow.tipo === 'Chocolate' ? 'CH' : 'bulto', label: palletLabel, peso: bultoPeso, slotId: targetSlotId });
    armarUndo(etiquetaSuma(snap.origenes.map(o => o.label), palletLabel), () => revertirSuma(snap));
  };

  // [Sumar en masa] Igual que sumarBultoAPallet pero para VARIOS bultos/CH de una sola vez:
  // se acumulan todos los pesos con sumarPesoMultiple (NO loopear la single — en un loop síncrono
  // leería el peso del destino desactualizado entre iteraciones) y se hace UN solo SET_ITEMS,
  // UN solo setFormRows y UN solo update de BD para el slot destino.
  const sumarVariosAPallet = (bultoRowIds: string[], palletRowId: string) => {
    if (!currentTienda) return;
    const cod = currentTienda.cod;
    const palletRow = formRows.find(r => r.id === palletRowId);
    const bultoRows = formRows.filter(r => bultoRowIds.includes(r.id) && (r.tipo === 'Bulto' || r.tipo === 'Chocolate'));
    if (!palletRow || bultoRows.length === 0) {
      showToast('No se pudo sumar: recarga la tienda e inténtalo otra vez', '#D97706');
      return;
    }
    const pesosBultos = bultoRows.map(r => r.savedItem?.peso ?? ((leerPeso(r.peso) ?? 0)));
    const pesoActual  = palletRow.savedItem?.peso ?? ((leerPeso(palletRow.peso) ?? 0));
    const nuevoPeso   = sumarPesoMultiple(pesoActual, pesosBultos);
    const palletIdx   = formRows.slice(0, formRows.findIndex(r => r.id === palletRowId) + 1).filter(r => r.tipo === 'Pallet').length;
    const palletLabel = `P${palletIdx}`;

    // El destino se reconfirma ANTES de borrar nada. Antes se borraba el slot del bulto y recién
    // después se chequeaba: si el pallet había cambiado, la función salía con el slot ya borrado y
    // el item todavía en pie — un bulto sin slot, invisible para Seguimiento y el Enrutador.
    if (palletRow.savedItem && !findItemForRow(items[cod] || [], { pickingSlotId: palletRow.pickingSlotId, savedItem: palletRow.savedItem })) {
      showToast('El pallet destino cambió — recarga la tienda e inténtalo otra vez', '#D97706');
      return;
    }
    const snap = snapshotSuma(cod, bultoRows, palletRow, palletLabel, pesoActual);

    for (const bultoRow of bultoRows) {
      deletePickingSlot(bultoRow.pickingSlotId ?? bultoRow.savedItem?.pickingSlotId, { yaRegistrado: true });
    }

    // Contexto: un solo SET_ITEMS — quita TODOS los bultos guardados seleccionados y suma el
    // peso total al pallet guardado, luego renumera. Mismo match por id ESTABLE que la single.
    if (bultoRows.some(r => r.savedItem) || palletRow.savedItem) {
      const cur = items[cod] || [];
      const bultoIds = new Set(bultoRows.map(r => r.savedItem?.id).filter((id): id is string => !!id));
      const filtered = cur
        .filter(i => !bultoIds.has(i.id))
        .map(i => (palletRow.savedItem && i.id === palletRow.savedItem.id) ? { ...i, peso: nuevoPeso } : i);
      const renumbered = renumerarOrden(filtered, i => seqDeSlot(cod, i.pickingSlotId));
      dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: renumbered });
    }

    // Form: quitar TODOS los bultos seleccionados y reabrir la tarjeta del pallet con el peso ya
    // sumado, para confirmar la altura (ver reaperturaAltura.ts).
    const bultoRowIdSet = new Set(bultoRows.map(r => r.id));
    const altoPrevio = palletRow.savedItem?.alto ?? (parseFloat(palletRow.alto) || 0);
    setFormRows(prev => prev
      .filter(r => !bultoRowIdSet.has(r.id))
      .map(r => r.id === palletRowId
        ? { ...r, saved: false, savedItem: undefined, traSuma: true, peso: String(nuevoPeso),
            alto: altoPrevio ? String(altoPrevio) : '', mergeReopened: true, mergeMotivo: 'suma' as const }
        : r));

    // BD: un solo update del peso del slot destino
    const targetSlotId = palletRow.pickingSlotId ?? palletRow.savedItem?.pickingSlotId;
    if (targetSlotId) {
      supabase.from('picking_pallets').update({ peso_kg: nuevoPeso }).eq('id', targetSlotId)
        .then(({ error }) => { if (error) console.error('[sumarVariosAPallet peso]', error.message); });
    }

    setFormMergeState(null);
    setMergeSel(new Set());
    showToast(toastSuma(palletLabel, sumarPesoMultiple(0, pesosBultos), bultoRows.length), '#16A34A');
    logActividad({ accion: 'sumar', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda.tienda,
      sourceLabel: `${bultoRows.length} ítems`, label: palletLabel, peso: sumarPesoMultiple(0, pesosBultos), slotId: targetSlotId });
    armarUndo(etiquetaSuma(snap.origenes.map(o => o.label), palletLabel), () => revertirSuma(snap));
  };

  /* ── Unificar pallets/contenedores INLINE (P3 → P1) ───────────────────────────────────
     Igual de automático que sumar un CH a un pallet: SIN modal ni confirmación. El peso de P3
     se suma a P1; P1 conserva su slot/código; P3 se borra (slot + item) en el acto. Luego P1
     se reabre como card editable con el peso ya sumado para ingresar/ajustar la altura y
     "Agregar" (guardado normal). Se actualizan AMBOS cachés de slots (light + full) para que
     NO aparezca el fantasma "¿Con cuál fue unificado?" (gP usa el light). Navegación-safe:
     el slot de P1 guarda el peso sumado, así el rebuild lo pre-rellena. */
  const iniciarUnionInline = (sourceRow: FormRow, targetRow: FormRow, srcLabel?: string, tgtLabel?: string) => {
    if (!currentTienda) return;
    const cod       = currentTienda.cod;
    const srcPeso   = sourceRow.savedItem?.peso ?? ((leerPeso(sourceRow.peso) ?? 0));
    const tgtPeso   = targetRow.savedItem?.peso ?? ((leerPeso(targetRow.peso) ?? 0));
    const nuevoPeso = sumPeso(tgtPeso, srcPeso);
    const prevAlto  = targetRow.savedItem?.alto ?? (parseFloat(targetRow.alto) || 0);
    const srcSlot   = sourceRow.pickingSlotId ?? sourceRow.savedItem?.pickingSlotId;
    const tgtSlot   = targetRow.pickingSlotId ?? targetRow.savedItem?.pickingSlotId;
    // [Revertir unificación] Snapshot ANTES de mutar (solo si ambos son items guardados).
    const itemsAntesUnion = [...(items[cod] || [])];
    const sourceItemUnion = sourceRow.savedItem;
    const puedeRevertirUnion = !!(sourceItemUnion && targetRow.savedItem);

    // 1) Items: quitar el del source y dejar el del target GUARDADO con el peso sumado, igual que
    //    al sumar un bulto. Antes el target también se quitaba («se re-agrega al Agregar»): si
    //    nadie apretaba Agregar, la unidad volvía «sin guardar», y como el borrado no dejaba
    //    lápida, otro equipo la devolvía con el peso de antes de unir. Espejo de Nacional.
    const cur = items[cod] || [];
    const filtered = cur
      .filter(i => !(sourceRow.savedItem && i.id === sourceRow.savedItem.id))
      .map(i => targetRow.savedItem && i.id === targetRow.savedItem.id ? { ...i, peso: nuevoPeso } : i);
    if (filtered.length !== cur.length || targetRow.savedItem) {
      const renumbered = renumerarOrden(filtered, i => seqDeSlot(cod, i.pickingSlotId));
      dispatch({ type: 'SET_ITEMS', tiendaCod: cod, items: renumbered });
    }

    // 2) BD: sumar el peso al slot del target; fusionar guías y borrar el slot del source.
    if (tgtSlot) {
      supabase.from('picking_pallets').update({ peso_kg: nuevoPeso }).eq('id', tgtSlot)
        .then(({ error }) => { if (error) console.error('[union peso]', error.message); });
    }
    // EL RESULTADO SE MIRA. Antes se tiraba, y por eso una unión rechazada —porque el destino ya
    // no existía— se veía en pantalla como si hubiera funcionado: los ítems ya se habían fusionado
    // acá arriba. Es lo que dejó a 12LAS sin una sola unidad el 30/09.
    if (tgtSlot && srcSlot) {
      void finalizarSlotUnion(tgtSlot, srcSlot).then(r => {
        if (!r.ok) showToast(`⚠ No se pudo unir: ${r.error} — recarga la tienda`, '#D32F2F');
      });
    }
    // Sin slot de destino no hay refs que fusionar, pero el borrado es el mismo. Antes era un
    // `delete` a mano y se quedaba sin los DOS guards: sin el anti-revive (la recarga de picking lo
    // resucitaba) y sin la lápida (el merge entre equipos lo devolvía). `eliminarSlotPicking` hace
    // las tres cosas en un solo lugar.
    else if (srcSlot) eliminarSlotPicking(srcSlot, { fuente: 'rmcosta', tiendaCod: cod, yaRegistrado: true });

    // 3) Cachés de slots: quitar el del source de AMBOS (full para el rebuild; light para gP/badge,
    //    así no aparece el fantasma), y reflejar el peso sumado en el slot del target (full).
    setPickingSlotsFull(prev => {
      const next = { ...prev };
      next[cod] = (next[cod] ?? [])
        .filter(s => s.id !== srcSlot)
        .map(s => s.id === tgtSlot ? { ...s, peso_kg: nuevoPeso } : s);
      return next;
    });

    // 4) Form: quitar la card source; reabrir el target como card editable con el peso ya sumado
    //    y la altura previa pre-rellenada, para ingresar/ajustar la altura y "Agregar".
    setFormRows(prev => prev
      .filter(r => r.id !== sourceRow.id)
      .map(r => r.id === targetRow.id
        ? { ...r, saved: false, savedItem: undefined, traSuma: true, peso: String(nuevoPeso),
            alto: prevAlto ? String(prevAlto) : '', mergeReopened: true }
        : r));
    setFormMergeState(null);
    showToast(`Unificado (+${srcPeso}kg) — ingresa la altura y Agregar`, '#2563EB');
    logActividad({ accion: 'unificar', fuente: 'rmcosta', tiendaCod: cod, tiendaNombre: currentTienda.tienda,
      sourceLabel: srcLabel, label: tgtLabel, peso: nuevoPeso, slotId: tgtSlot });
    if (puedeRevertirUnion && sourceItemUnion) {
      armarUndo(`Unificado ${srcLabel ?? ''} → ${tgtLabel ?? ''}`.replace(/\s+→\s*$/, ''), () => revertirUnificacion({
        cod, itemsAntes: itemsAntesUnion, sourceItem: sourceItemUnion, oldSrcSlot: srcSlot, tgtSlot, tgtPeso,
      }));
    }
  };

  // Fusiona las guías del source en el target (lee refs ANTES de borrar) y borra el slot del
  // source en la BD. Fire-and-forget: en el peor caso queda igual que hoy (sin fusión). El caché
  // local ya quitó el slot del source en iniciarUnionInline.
  const absorbPickingSlotSant = (cod: string, type: 'p' | 'b' | 'c') => {
    setConsumedSlotsSant(prev => {
      const cur = prev[cod] || { p: 0, b: 0, c: 0 };
      const next = { ...prev, [cod]: { ...cur, [type]: cur[type] + 1 } };
      saveConsumedSlotsS(next);
      return next;
    });
  };

  // `existingSlot` viene del flujo "Preexistente" (pallet adelantado ya reclamado a hoy):
  // en ese caso NO se crea un slot nuevo, se usa el reclamado.
  // countOffset: al "agregar de a N" (loop), el número del chocolate se calcula del `items` del
  // closure (que NO se actualiza dentro del loop) → sin offset, los N quedarían con el mismo CH#.
  // El offset (índice de la iteración) los numera CH{base+1}..CH{base+N} y hace únicos los ids.
  const addFormRowInner = async (t: TipoCargamento, existingSlot?: PickingSlot, countOffset = 0) => {
    const cod = currentTienda?.cod;

    const date = fechaISOLocal();

    // Chocolate: se agrega AGREGADO al instante con peso por defecto (sin formulario)
    if (t === 'Chocolate') {
      if (!cod || !regimen) { showToast('Selecciona régimen', '#D97706'); return; }
      // Crear el ID de bodega (canonical_id + seq) y vincularlo — o usar el preexistente
      let slot: PickingSlot | undefined = existingSlot;
      if (!slot) {
        const res = await crearSlotBodega({ date, store_cod: cod, tipo: 'CH', contenido: CONTENIDO_CHOCOLATE });
        slot = res.slot;
        // No agregar un chocolate "confirmado" sin fila real en picking_pallets — antes esto
        // fallaba en silencio y quedaba invisible para Seguimiento/Enrutador/Conteo de Flota.
        if (!slot) { showToast(`⚠ No se pudo agregar el chocolate (${res.error}) — reintenta`, '#D32F2F'); return; }
      }
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot!] }));
      const existing = items[cod] || [];
      const chc = existing.filter(i => i.tipo === 'Chocolate').length + 1 + countOffset;
      const stamp = Date.now();
      const item: SantiagoItem = {
        id: `${cod}-chadd-${stamp}-${countOffset}`, tiendaCod: cod, tipo: 'Chocolate', contenido: 'Chocolate',
        peso: 0, alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
        pesoVolumetrico: 0, regimen, orden: `CH${chc}`, estado: ESTADO_DEFAULT,
        pickingSlotId: slot?.id,
      };
      dispatch({ type: 'ADD_ITEM', item });
      setFormRows(prev => [...prev, {
        id: `saved-chadd-${stamp}-${countOffset}`, tipo: 'Chocolate', contenido: 'Chocolate',
        peso: '', alto: String(CHOCOLATE_DIMS.alto),
        largo: String(CHOCOLATE_DIMS.largo), ancho: String(CHOCOLATE_DIMS.ancho),
        saved: true, savedItem: item, pickingSlotId: slot?.id,
      }]);
      if (slot?.id) {
        supabase.from('picking_pallets').update({
          alto: CHOCOLATE_DIMS.alto, ancho: CHOCOLATE_DIMS.ancho, largo: CHOCOLATE_DIMS.largo,
        }).eq('id', slot.id).then(({ error }) => { if (error) console.error('[picking_pallets update]', error.message); });
      }
      showToast(`✓ ${item.orden} agregado`, '#16A34A');
      return;
    }

    // [Agregados] Adquisición y Web/retiro: nacen COMPLETOS, sin formulario que llenar.
    // Mismo camino que el chocolate —alta inmediata— pero sin medidas ni peso: ese es justamente el
    // punto del tipo. Ver shared/adquisicion.
    if (esAgregado(t)) {
      if (!cod || !regimen) { showToast('Selecciona régimen', '#D97706'); return; }
      let slot: PickingSlot | undefined = existingSlot;
      if (!slot) {
        const res = await crearSlotBodega({ date, store_cod: cod, tipo: tipoCodeSantiago(t), contenido: 'hogar' });
        slot = res.slot;
        // Sin fila en picking_pallets el ítem queda invisible para Seguimiento, Enrutador y el
        // conteo de flota — el mismo modo de falla silenciosa que ya arregló el chocolate.
        if (!slot) { showToast(`⚠ No se pudo agregar (${res.error}) — reintenta`, '#D32F2F'); return; }
      }
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot!] }));
      const existing = items[cod] || [];
      // Se numera en la serie de BULTOS: `claseSantiago` cae en 'bulto' y `ordenDeItem` devuelve
      // `${n}B`. Un contador propio partiría la serie en dos.
      const nb = existing.filter(i => claseSantiago(i.tipo) === 'bulto').length + 1 + countOffset;
      const stamp = Date.now();
      const item: SantiagoItem = {
        id: `${cod}-agr-${stamp}-${countOffset}`, tiendaCod: cod, tipo: t,
        // 'Hogar' es el contenido por defecto de toda fila nueva. No se inventa un valor propio:
        // `clasificarContenido` no lo reconocería al releerlo y el round-trip se rompe en silencio
        // — es el bug que documentó `contenidoCarga.ts` con el chocolate.
        contenido: 'Hogar',
        peso: 0, alto: 0, largo: 0, ancho: 0,
        pesoVolumetrico: 0, regimen, orden: ordenDeItem(t, nb), estado: ESTADO_DEFAULT,
        pickingSlotId: slot?.id,
      };
      dispatch({ type: 'ADD_ITEM', item });
      setFormRows(prev => [...prev, {
        id: `saved-agr-${stamp}-${countOffset}`, tipo: t, contenido: 'Hogar',
        peso: '', alto: '', largo: '', ancho: '',
        saved: true, savedItem: item, pickingSlotId: slot?.id,
      }]);
      showToast(`✓ ${etiquetaAgregado(t)} agregada`, '#16A34A');
      return;
    }

    const rowId = `row-${Date.now()}-${countOffset}`;
    // Agregar el form row de inmediato (respuesta visual), luego vincular el slot
    setFormRows(prev => [...prev, { id: rowId, tipo: t, contenido: 'Hogar', peso: '', alto: '', largo: '', ancho: '' }]);
    if (!cod) return;

    // Preexistente: usar el slot ya reclamado (no se crea uno nuevo).
    // La fila se llena con lo que el slot YA sabe. Antes solo se le pegaba el pickingSlotId y el
    // peso y las medidas se descartaban: un pallet recuperado aparecía en blanco y había que
    // pesarlo y medirlo de nuevo — justo lo contrario de lo que promete el diálogo al restaurar.
    if (existingSlot) {
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), existingSlot] }));
      const campos = camposDeSlot(existingSlot);
      setFormRows(prev => prev.map(r => r.id === rowId
        ? { ...r, pickingSlotId: existingSlot.id, contenido: contenidoSantiago(existingSlot.contenido), ...campos }
        : r));
      return;
    }

    // Solo pre-asigna el # a la card vacía todavía sin confirmar — si falla, el row queda sin
    // slot por ahora y `saveRow` (el confirm real, al hacer clic en "Agregar") lo reintenta y
    // ahí sí bloquea/avisa si vuelve a fallar. No hace falta avisar dos veces por lo mismo.
    const { slot } = await crearSlotBodega({ date, store_cod: cod, tipo: tipoCodeSantiago(t), contenido: 'hogar' });
    if (!slot) return;
    setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot] }));
    setFormRows(prev => prev.map(r => r.id === rowId ? { ...r, pickingSlotId: slot.id } : r));
  };

  // [P5] Guarda anti doble-tap (paridad con Nacional): crear un slot NO es idempotente, así que dos
  // toques seguidos generaban DOS pallets/chocolates físicos. Se bloquea por tienda+tipo mientras la
  // creación está en vuelo; el "agregar de a N" hace `await` de cada llamada y no se ve afectado.
  const addingSlotRef = useRef<Set<string>>(new Set());
  const addFormRow = async (t: TipoCargamento, existingSlot?: PickingSlot, countOffset = 0) => {
    // La unidad que alguien agrega a mano se abre sola en «Ahora»: es la que viene a pesar. Las
    // que aparecen solas desde Picking NO, porque le cambiarían la tarjeta a quien está escribiendo.
    esperarNueva();
    const key = `${currentTienda?.cod ?? ''}:${t}`;
    if (addingSlotRef.current.has(key)) {
      // Salir mudo hacía que el segundo toque pareciera no haber pasado nada, y la reacción
      // natural es volver a tocar. Decirlo convierte un silencio en una espera.
      showToast('Agregando… espera un segundo', '#D97706');
      return;
    }
    addingSlotRef.current.add(key);
    try { await addFormRowInner(t, existingSlot, countOffset); }
    finally { addingSlotRef.current.delete(key); }
  };

  // [Duplicar bulto] Crea `cantidad` copias de un bulto guardado con su MISMO peso y medidas,
  // agregadas al instante, sin pasar por el formulario. Solo para bultos.
  const duplicarBulto = async (row: FormRow, cantidad: number) => {
    const src = row.savedItem;
    if (!src || !currentTienda || !regimen) return;
    const cod  = currentTienda.cod;
    const date = fechaISOLocal();
    const baseCount = (items[cod] || []).filter(i => i.tipo === 'Bulto').length; // # antes de duplicar (sin lecturas stale)
    let creados = 0;
    for (let k = 0; k < cantidad; k++) {
      const { slot, error } = await crearSlotBodega({ date, store_cod: cod, tipo: 'B', contenido: 'hogar' });
      // No agregar un bulto "confirmado" sin fila real en picking_pallets — antes esto fallaba
      // en silencio y quedaba invisible para Seguimiento/Enrutador/Conteo de Flota.
      if (!slot) { showToast(`⚠ Se detuvo en ${creados}/${cantidad} — ${error}`, '#D32F2F'); break; }
      setPickingSlotsFull(prev => ({ ...prev, [cod]: [...(prev[cod] ?? []), slot] }));
      creados++;
      const stamp = Date.now();
      const item: SantiagoItem = {
        id: `${cod}-dup-${stamp}-${k}`, tiendaCod: cod, tipo: 'Bulto', contenido: src.contenido,
        peso: src.peso, alto: src.alto, largo: src.largo, ancho: src.ancho,
        pesoVolumetrico: src.pesoVolumetrico ?? 0, regimen, orden: `${baseCount + 1 + k}B`, estado: ESTADO_DEFAULT,
        pickingSlotId: slot?.id,
      };
      dispatch({ type: 'ADD_ITEM', item });
      setFormRows(prev => [...prev, {
        id: `saved-dup-${stamp}-${k}`, tipo: 'Bulto', contenido: src.contenido,
        peso: String(src.peso), alto: String(src.alto), largo: String(src.largo), ancho: String(src.ancho),
        saved: true, savedItem: item, pickingSlotId: slot?.id,
      }]);
      if (slot?.id) {
        supabase.from('picking_pallets').update({ peso_kg: src.peso, alto: src.alto, ancho: src.ancho, largo: src.largo })
          .eq('id', slot.id).then(({ error }) => { if (error) console.error('[duplicarBulto]', error.message); });
      }
    }
    if (creados > 0) showToast(`✓ ${creados} bulto${creados === 1 ? '' : 's'} duplicado${creados === 1 ? '' : 's'}`, '#16A34A');
  };

  // Mapea el tipo del slot (P/B/C/CH) al TipoCargamento del formulario
  const SLOT_TIPO_TO_CARGAMENTO: Record<string, TipoCargamento> = { P: 'Pallet', B: 'Bulto', C: 'Contenedor', CH: 'Chocolate' };
  // Estado del diálogo "Nuevo / Preexistente"
  const [dialogTipo, setDialogTipo] = useState<TipoCargamento | null>(null);
  // [Handheld] Número o código con que abrir el diálogo directo en "preexistente" (etiqueta escaneada
  // de otro día). Se borra al cerrar el diálogo.
  const [dialogRef, setDialogRef] = useState<string | null>(null);
  // [Handheld] La etiqueta es de un pallet borrado: el diálogo la comprueba solo y ofrece restaurar.
  const [dialogBorrado, setDialogBorrado] = useState(false);
  useEffect(() => { if (!dialogTipo) { setDialogRef(null); setDialogBorrado(false); } }, [dialogTipo]);

  // [Handheld] La etiqueta leída con el lector, esté donde esté el cursor. Ver useEscaneoBodega.ts.
  useEscaneoBodega({
    activo: !dialogTipo,
    slotsPorTienda: pickingSlotsFull,
    avisoDe: p => {
      const aviso = avisoDeUnidad(itemDeLaUnidad(items[p.claveTienda] ?? [], p.slot.id));
      return tiendaTerminada(p.claveTienda) ? avisoEnTerminada(aviso) : aviso;
    },
    bloqueada: cod => tiendaTerminada(cod),
    // Acá los mapas se indexan por código, así que la clave ya ES el código.
    codDeClave: c => c,
    // `tiendaByCod` trae TODO el catálogo de /api/tiendas, Nacional incluido, así que sin esto la
    // pistola abría una tienda de Regiones acá dentro. Ver `vetoEscaneo.ts`.
    deOtraBodega: cod => (esDeOtroEspejo(cod, 'rmcosta', isRegionesCod)
      ? avisoDeOtroEspejo(cod, espejoDeTienda(cod, isRegionesCod))
      : null),
    irA: p => {
      const tienda = tiendaByCod[p.claveTienda];
      if (!tienda) return false;
      setSearch('');
      setFocoPallet(p.slot.id);
      selectTienda(tienda);
      return true;
    },
    ofrecerPreexistente: (pallet, codigo, borrado) => {
      const tienda = tiendaByCod[pallet.store_cod];
      if (!tienda) return false;
      setSearch('');
      selectTienda(tienda);
      setDialogTipo(SLOT_TIPO_TO_CARGAMENTO[pallet.tipo ?? 'P'] ?? 'Pallet');
      setDialogRef(codigo);
      setDialogBorrado(!!borrado);
      return true;
    },
    showToast,
  });
  // [Handheld] Entre un pallet y otro la pantalla no se apaga mientras haya una tienda abierta.
  useWakeLock(!!currentTienda);

  /* ── Resumen editing ── */
  const rStartEdit = (cod: string, idx: number) => {
    const item = (items[cod] || [])[idx];
    if (!item) return;
    setResumenEditing({ cod, idx, tipo: item.tipo, contenido: item.contenido, estado: item.estado,
      peso: String(item.peso), alto: String(item.alto), largo: String(item.largo), ancho: String(item.ancho) });
    setResumenExpanded(prev => { const next = new Set(prev); next.add(cod); return next; });
  };
  const rCancelEdit = () => setResumenEditing(null);
  const rSaveEdit = () => {
    if (!resumenEditing) return;
    const { cod, idx, tipo: rTipo, contenido: rContenido, estado: rEstado } = resumenEditing;
    const item = (items[cod] || [])[idx];
    const isChoc       = rTipo === 'Bulto'      && rContenido === 'Chocolate';
    const isContenedor = rTipo === 'Contenedor';
    const alto  = isContenedor ? CONTENEDOR_ALTO  : isChoc ? CHOCOLATE_DIMS.alto  : (parseInt(resumenEditing.alto)  || 0);
    const largo = isContenedor ? CONTENEDOR_LARGO : rTipo === 'Pallet' ? item.largo : (isChoc ? CHOCOLATE_DIMS.largo : (parseInt(resumenEditing.largo) || 0));
    const ancho = isContenedor ? CONTENEDOR_ANCHO : rTipo === 'Pallet' ? item.ancho : (isChoc ? CHOCOLATE_DIMS.ancho : (parseInt(resumenEditing.ancho) || 0));
    dispatch({
      type: 'EDIT_ITEM', tiendaCod: cod, idx,
      item: { ...item, tipo: rTipo, contenido: rContenido, estado: rEstado,
        peso: (leerPeso(resumenEditing.peso) ?? 0), alto, largo, ancho,
        pesoVolumetrico: (alto * largo * ancho) / 6000 },
    });
    setResumenEditing(null);
    showToast('✓ Item actualizado', '#16A34A');
  };

  /* ════════════════════════════════════
     LEFT PANEL CONTENT
  ════════════════════════════════════ */
  const renderStoreGrid = () => (
    <>
    <BarraDelDia resumen={resumenHoy} filtro={filtroHoy} onFiltro={setFiltroLista} />
    {/* Lista de tiendas: una fila por tienda. Ver `ListaTiendas.tsx`. */}
    <div ref={refLista} className="flex-1 overflow-y-auto bg-bg">
      {todayList.length > 0 && (
        <div>
          <RotuloLista derecha={editarHoy
            ? <button type="button" onClick={() => setEditarHoy(false)} className="text-apoyo font-bold text-navy normal-case cursor-pointer">Listo</button>
            : <span className="flex items-center gap-2">
                <UnidadesDelDia unidades={[{ letra: 'P', n: barraP }, { letra: 'B', n: barraB }, { letra: 'CH', n: barraCH }]} />
                {/* Tiendas con todos sus movimientos de Odoo hechos, por sección, como antes. */}
                {rmProg.total > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-rotulo font-bold text-text-sub">RM</span>
                    <SectionCount done={rmProg.done} total={rmProg.total} />
                  </span>
                )}
                {costaProg.total > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-rotulo font-bold text-text-sub">Costa</span>
                    <SectionCount done={costaProg.done} total={costaProg.total} />
                  </span>
                )}
              </span>}>
            {editarHoy ? 'Toca × para retirar de hoy' : 'Hoy'}
          </RotuloLista>
          <div className={GRILLA_MOSAICO}>
            {todayVisibles.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlotsFull[t.cod] ?? [];
              const cnsS = consumedSlotsSant[t.cod] || { p: 0, b: 0, c: 0 };
              const pk = pkSlots.length > 0 ? { p: Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - cnsS.p), c: Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - cnsS.c), b: Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - cnsS.b) } : undefined;
              // SECO excluye congelados: "N movimientos" de la card = total/done de Odoo
              // menos el subconteo de Abastecimiento Congelados (que vive en su propio módulo).
              const prog = odooProgress.get(t.cod);
              const storeTotalOpsSeco = Math.max(0, (prog?.total ?? 0) - (prog?.congTotal ?? 0));
              const storeDoneOpsSeco  = Math.max(0, (prog?.done ?? 0) - (prog?.congDone ?? 0));
              return (
                <TiendaGridCard key={t.cod} t={t} tipoCat={tipoCatByCod[t.cod]}
                  isActive={currentTienda?.cod === t.cod} isToday
                  itemCount={tI.length} palletCount={contarPorClase(tI, i => claseSantiago(i.tipo)).pallet}
                  sinPesarCount={tI.filter(esSinPesar).length}
                  contenedorCount={contarPorClase(tI, i => claseSantiago(i.tipo)).contenedor}
                  chocolateCount={contarPorClase(tI, i => claseSantiago(i.tipo)).chocolate}
                  bultoCount={contarPorClase(tI, i => claseSantiago(i.tipo)).bulto}
                  adquisicionCount={contarPorClase(tI, i => claseSantiago(i.tipo)).adquisicion}
                  webRetiroCount={contarPorClase(tI, i => claseSantiago(i.tipo)).webretiro}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  despachoCH={pkSlots.filter(s => s.tipo === 'CH').length}
                  hasGuide={!!guides[guideKey(t.cod)]} storeStatus={prog?.status ?? 'none'} storeDoneOps={storeDoneOpsSeco} storeTotalOps={storeTotalOpsSeco}
                  terminada={terminadas.get(t.cod)?.terminada === true} nuevas={nuevasDe(t.cod)}
                  viendo={viendoPorTienda.get(t.cod)}
                  onSelect={() => selectTienda(t)}
                  onRemoveFromToday={editarHoy ? () => setConfirmRemove(t.tienda) : undefined}
                  forma="baldosa" />
              );
            })}
            {!editarHoy && othersList.length > 0 && <BaldosaAgregar onClick={abrirTodas} />}
          </div>
          {todayVisibles.length === 0 && (
            <p className="px-3.5 py-6 text-center text-apoyo text-text-sub">Ninguna tienda de hoy calza con la búsqueda.</p>
          )}
        </div>
      )}
      {othersList.length > 0 && (
        <div ref={todasRef}>
          {todayList.length > 0 && (
            <RotuloLista onClick={() => setShowTodas(prev => !prev)}
              derecha={<span className="text-apoyo text-text-sub select-none">{showTodas ? '▲' : '▼'}</span>}>
              {`Todas (${othersList.length})`}
            </RotuloLista>
          )}
          {(showTodas || todayList.length === 0) && (
          <div className="border-t border-border">
            {othersList.map(t => {
              const tI = items[t.cod] || [];
              const dc = despachoCounts[t.cod];
              const pkSlots = pickingSlotsFull[t.cod] ?? [];
              const cnsS = consumedSlotsSant[t.cod] || { p: 0, b: 0, c: 0 };
              const pk = pkSlots.length > 0 ? { p: Math.max(0, pkSlots.filter(s => s.tipo === 'P').length - cnsS.p), c: Math.max(0, pkSlots.filter(s => s.tipo === 'C').length - cnsS.c), b: Math.max(0, pkSlots.filter(s => s.tipo === 'B').length - cnsS.b) } : undefined;
              return (
                <TiendaGridCard key={t.cod} t={t} tipoCat={tipoCatByCod[t.cod]}
                  isActive={currentTienda?.cod === t.cod} isToday={false}
                  itemCount={tI.length} palletCount={contarPorClase(tI, i => claseSantiago(i.tipo)).pallet}
                  sinPesarCount={tI.filter(esSinPesar).length}
                  contenedorCount={contarPorClase(tI, i => claseSantiago(i.tipo)).contenedor}
                  chocolateCount={contarPorClase(tI, i => claseSantiago(i.tipo)).chocolate}
                  bultoCount={contarPorClase(tI, i => claseSantiago(i.tipo)).bulto}
                  adquisicionCount={contarPorClase(tI, i => claseSantiago(i.tipo)).adquisicion}
                  webRetiroCount={contarPorClase(tI, i => claseSantiago(i.tipo)).webretiro}
                  despachoP={pk?.p ?? dc?.p} despachoB={pk?.b ?? dc?.b} despachoC={pk?.c ?? dc?.c}
                  despachoCH={pkSlots.filter(s => s.tipo === 'CH').length}
                  hasGuide={!!guides[guideKey(t.cod)]} storeStatus="none" storeDoneOps={0} storeTotalOps={0}
                  terminada={terminadas.get(t.cod)?.terminada === true} nuevas={nuevasDe(t.cod)}
                  viendo={viendoPorTienda.get(t.cod)}
                  onSelect={() => selectTienda(t)}
                  onAddToday={() => setConfirmAdd(t.tienda)} />
              );
            })}
          </div>
          )}
        </div>
      )}
      {filtered.length === 0 && (
        <div className="py-16 text-center text-text-sub">
          <p className="text-apoyo">Sin resultados</p>
        </div>
      )}
    </div>
    </>
  );

  // Pie: Resumen y ⋯. Las cifras de pallets y bultos subieron a la barra del día.
  const renderStatsBar = () => (
    <PieLista
      resumen={{ texto: `Resumen del día (${activeTiendasCount})`, onClick: goToResumen }}
      acciones={[
        // [C-05] La zona grande de "Subir guías" es `hidden lg:flex`: bajo 1024 px vive acá.
        { id: 'guias', icono: <FileUp size={18} />, texto: guideUploading ? 'Procesando guías…' : 'Subir guías', disabled: guideUploading, onClick: () => guideFileRef.current?.click() },
        { id: 'editar', icono: <Pencil size={18} />, texto: editarHoy ? 'Terminar de editar hoy' : 'Editar tiendas de hoy', enEscritorio: true, onClick: () => setEditarHoy(v => !v) },
        { id: 'manual', icono: <ClipboardList size={18} />, texto: 'Manual / Cal', enEscritorio: true, onClick: () => setShowCalManual(true) },
        { id: 'enrutador', icono: <Navigation size={18} />, texto: 'Enrutador', enEscritorio: true, ancho: true, onClick: enrutar },
      ]} />
  );

  /* ════════════════════════════════════
     RESUMEN PANEL (mobile + desktop right)
  ════════════════════════════════════ */
  const renderResumenPanel = () => {
    const doneTiendas    = todayTiendas.filter(t => (items[t.cod] || []).length > 0);
    const pendingTiendas = todayTiendas.filter(t => !(items[t.cod] || []).length);

    const INPUT_CLS = 'w-full border border-border rounded-btn px-2 py-2 text-[13px] font-mono text-navy bg-white';
    const LABEL_CLS = 'text-[9px] text-text-3 mb-0.5 uppercase tracking-wide';

    return (
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Desktop header (stats + progress) */}
        <div className="hidden lg:block bg-navy px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-barlow-condensed text-[11px] uppercase tracking-widest text-white/40">Resumen en tiempo real</span>
            <div className="flex items-center gap-2">
              {todayTiendas.length > 0 && pendingTiendas.length === 0 && (
                <span className="font-barlow-condensed text-[12px] font-bold text-[#86EFAC] bg-[rgba(134,239,172,0.15)] px-2 py-0.5 rounded">✓ Hoy completo</span>
              )}
              {/* El lado de Odoo no depende de Bodega: existe desde temprano y se puede traer sin
                  esperar al registro. Solo admin. Ver `TraerOdooButton`. */}
              <TraerOdooButton rol={profile?.role} fechaISO={fechaChile()} showToast={showToast} />
            </div>
          </div>
          <div className="flex gap-5 mb-2">
            {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, ...(statCH > 0 ? [{ v: statCH, l: 'Choc.', color: '#FBB6A0' }] : []), { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }) => (
              <div key={l} className="text-center">
                <div className="font-barlow-condensed text-[24px] font-extrabold leading-none" style={{ color }}>{v}</div>
                <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
              </div>
            ))}
          </div>
          {todayTiendas.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                <span>{doneTiendas.length}/{todayTiendas.length} tiendas HOY</span>
                <span>{pendingTiendas.length > 0 ? `${pendingTiendas.length} pendiente${pendingTiendas.length > 1 ? 's' : ''}` : 'Todo registrado'}</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#86EFAC] rounded-full transition-all duration-500"
                  style={{ width: `${todayTiendas.length > 0 ? (doneTiendas.length / todayTiendas.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Mobile stats strip */}
        <div className="lg:hidden bg-navy flex-shrink-0">
          <div className="flex items-center">
            {[{ v: statP, l: 'Pallets', color: '#93C5FD' }, { v: statB, l: 'Bultos', color: '#FCD34D' }, ...(statCH > 0 ? [{ v: statCH, l: 'Choc.', color: '#FBB6A0' }] : []), { v: activeTiendasCount, l: 'Tiendas', color: '#86EFAC' }].map(({ v, l, color }, i, arr) => (
              <div key={l} className={`flex-1 py-3 text-center ${i < arr.length - 1 ? 'border-r border-white/10' : ''}`}>
                <div className="font-barlow-condensed text-[26px] font-bold leading-none" style={{ color }}>{v}</div>
                <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>


        {/* Ver todo / Colapsar — always visible on all screen sizes */}
        {activeTiendasCount > 1 && (
          <div className="flex justify-end px-3 py-1.5 bg-bg border-b border-border flex-shrink-0">
            <button
              onClick={() => {
                const allCods = activeTiendas.map(([c]) => c);
                setResumenExpanded(resumenExpanded.size === allCods.length ? new Set() : new Set(allCods));
              }}
              className="font-barlow-condensed text-[12px] font-bold text-text-3 hover:text-navy active:text-navy cursor-pointer transition-colors border-none bg-transparent">
              {resumenExpanded.size === activeTiendasCount ? '▲ Colapsar' : '▼ Ver todo'}
            </button>
          </div>
        )}
        {/* Accordion */}
        <div className="flex-1 overflow-y-auto">
          {activeTiendas.length === 0 ? (
            <div className="py-16 text-center text-text-3">
              <div className="text-4xl mb-3 opacity-20">📋</div>
              <p className="text-[13px] opacity-50">Sin items registrados aún</p>
            </div>
          ) : (
            activeTiendas.map(([cod, it]) => {
              const t           = getTiendaSantiagoByCod(cod);
              const pallets     = it.filter(i => i.tipo === 'Pallet').length;
              const bultos      = bultosSantiago(it);
              const contenedores = it.filter(i => i.tipo === 'Contenedor').length;
              const isOpen      = resumenExpanded.has(cod);
              const totalPeso = it.reduce((s, i) => s + i.peso, 0);

              return (
                <div key={cod} className={`border-b border-border ${isOpen ? 'bg-white' : ''}`}>
                  <div
                    onClick={() => { rCancelEdit(); toggleResumenExpanded(cod); }}
                    className={`flex items-center gap-2.5 px-3 py-3 cursor-pointer transition-all active:bg-bg ${isOpen ? 'bg-[#F0F2F7] border-b border-border' : 'bg-white'}`}>
                    <div className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded min-w-[42px] text-center flex-shrink-0">{formatCod(cod)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold text-navy truncate leading-tight">{t?.tienda || cod}</div>
                      <div className="text-[11px] text-text-3 truncate">{t?.comuna} · {t?.ventanaHoraria}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {pallets     > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-info bg-[rgba(37,99,235,0.10)] border border-[rgba(37,99,235,0.20)] px-2 py-0.5 rounded">{pallets}P</span>}
                      {bultos      > 0 && <span className="font-barlow-condensed text-[13px] font-bold text-warn bg-[rgba(217,119,6,0.10)] border border-[rgba(217,119,6,0.20)] px-2 py-0.5 rounded">{bultos}B</span>}
                      {contenedores > 0 && <span className="font-barlow-condensed text-[13px] font-bold px-2 py-0.5 rounded border" style={{ color:'#6B21A8', background:'rgba(107,33,168,0.10)', borderColor:'rgba(107,33,168,0.20)' }}>{contenedores}C</span>}
                      <span className="text-text-3 text-[12px] ml-0.5">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-bg border-b border-border">
                        <div className="font-mono text-[11px] text-text-3 flex-1">
                          {it.length} item{it.length > 1 ? 's' : ''} · {totalPeso.toLocaleString('es-CL')} kg
                        </div>
                      </div>

                      {it.map((item, idx) => {
                        const isEditing = resumenEditing?.cod === cod && resumenEditing?.idx === idx;
                        const re = resumenEditing;
                        const rIsChoc = re?.tipo === 'Bulto' && re?.contenido === 'Chocolate';

                        if (isEditing && re) {
                          return (
                            <div key={item.id} className="border-l-4 border-info bg-[rgba(37,99,235,0.04)] border-b border-border/40">
                              <div className="px-3 pt-3 pb-3">
                                {/* Tipo */}
                                <div className="mb-2.5">
                                  <div className={LABEL_CLS}>Tipo</div>
                                  <div className="flex gap-2 mt-1">
                                    {(['Pallet', 'Bulto', 'Contenedor'] as TipoCargamento[]).map(tp => (
                                      <button key={tp}
                                        onClick={() => setResumenEditing(prev => prev ? { ...prev, tipo: tp, contenido: tp === 'Pallet' ? 'Comida' : tp === 'Contenedor' ? 'Hogar' : 'Hogar' } : prev)}
                                        className={`flex-1 font-barlow-condensed text-[14px] font-bold py-2 rounded border transition-all ${
                                          re.tipo === tp
                                            ? tp === 'Pallet'     ? 'bg-info text-white border-info'
                                            : tp === 'Contenedor' ? 'bg-[#6B21A8] text-white border-[#6B21A8]'
                                            : 'bg-warn text-white border-warn'
                                            : 'bg-white text-text-2 border-border'
                                        }`}>{tp}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* Contenido */}
                                <div className="mb-2.5">
                                  <div className={LABEL_CLS}>Contenido</div>
                                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                                    {(re.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                                      <button key={c}
                                        onClick={() => setResumenEditing(prev => prev ? { ...prev, contenido: c } : prev)}
                                        className={`font-barlow-condensed text-[13px] font-bold py-2 rounded border transition-all ${
                                          re.contenido === c ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'
                                        }`}>{c}</button>
                                    ))}
                                  </div>
                                </div>
                                {/* Estado — solo Pallet */}
                                {re.tipo === 'Pallet' && (
                                  <div className="mb-2.5">
                                    <div className={LABEL_CLS}>Estado</div>
                                    <select value={re.estado}
                                      onChange={e => setResumenEditing(prev => prev ? { ...prev, estado: e.target.value as EstadoItem } : prev)}
                                      className="w-full border border-border rounded-btn px-2 py-2.5 text-[13px] text-navy bg-white mt-0.5">
                                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>
                                  </div>
                                )}
                                {/* Dimensiones */}
                                <div className={`grid gap-2 mb-3 ${re.tipo === 'Bulto' && !rIsChoc ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                  <div>
                                    <div className={LABEL_CLS}>Peso kg</div>
                                    <input type="text" inputMode="decimal" value={re.peso}
                                      onChange={e => setResumenEditing(prev => prev ? { ...prev, peso: limpiarTecleo(e.target.value) } : prev)}
                                      className={INPUT_CLS} />
                                  </div>
                                  {!rIsChoc && (
                                    <div>
                                      <div className={LABEL_CLS}>Alto cm</div>
                                      <input type="number" value={re.alto} max={MAX_ALTO_CM}
                                        onChange={e => setResumenEditing(prev => prev ? { ...prev, alto: e.target.value } : prev)}
                                        className={INPUT_CLS} />
                                      {excedeAltoMax(parseFloat(re.alto) || 0) && (
                                        <div className="text-[10px] text-warn mt-0.5">⚠ máx {MAX_ALTO_CM} cm</div>
                                      )}
                                    </div>
                                  )}
                                  {re.tipo === 'Bulto' && !rIsChoc && (
                                    <>
                                      <div>
                                        <div className={LABEL_CLS}>Largo cm</div>
                                        <input type="number" value={re.largo}
                                          onChange={e => setResumenEditing(prev => prev ? { ...prev, largo: e.target.value } : prev)}
                                          className={INPUT_CLS} />
                                      </div>
                                      <div>
                                        <div className={LABEL_CLS}>Ancho cm</div>
                                        <input type="number" value={re.ancho}
                                          onChange={e => setResumenEditing(prev => prev ? { ...prev, ancho: e.target.value } : prev)}
                                          className={INPUT_CLS} />
                                      </div>
                                    </>
                                  )}
                                  {rIsChoc && (
                                    <div className="text-[11px] text-text-3 bg-bg border border-border rounded-btn px-2 py-2 self-end">
                                      {CHOCOLATE_DIMS.alto}×{CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho} cm
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={rSaveEdit}
                                    className="flex-1 py-3 bg-info text-white border-none rounded-btn font-barlow-condensed text-[15px] font-bold cursor-pointer active:opacity-80">
                                    ✓ Guardar
                                  </button>
                                  <button onClick={rCancelEdit}
                                    className="px-5 py-3 bg-bg-2 text-text-2 border border-border rounded-btn font-barlow-condensed text-[15px] cursor-pointer active:bg-bg-3">
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const isRDrop    = rDragIdx !== null && rDragCod === cod && rDropIdx === idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo;
                        const isRDragging = rDragCod === cod && rDragIdx === idx;
                        return (
                          <div
                            key={item.id}
                            data-r-item-idx={idx}
                            data-r-item-cod={cod}
                            draggable
                            onDragStart={() => { setRDragIdx(idx); setRDragCod(cod); }}
                            onDragOver={(e) => {
                              if (rDragIdx !== null && rDragCod === cod && rDragIdx !== idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo)
                                { e.preventDefault(); setRDropIdx(idx); }
                            }}
                            onDragLeave={() => setRDropIdx(prev => prev === idx ? null : prev)}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (rDragIdx !== null && rDragCod === cod && rDragIdx !== idx && (items[cod]?.[rDragIdx])?.tipo === item.tipo)
                                setCombineModal({ srcIdx: rDragIdx, tgtIdx: idx, cod });
                              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
                            }}
                            onDragEnd={() => { setRDragIdx(null); setRDropIdx(null); setRDragCod(null); }}
                            onTouchStart={(e) => {
                              const t = e.touches[0];
                              (e.currentTarget as HTMLElement).dataset.txS = String(t.clientX);
                              (e.currentTarget as HTMLElement).dataset.tyS = String(t.clientY);
                              rLongPressRef.current = setTimeout(() => { setRDragIdx(idx); setRDragCod(cod); navigator.vibrate?.(25); }, 220);
                            }}
                            onTouchMove={(e) => {
                              const t = e.touches[0];
                              const el = e.currentTarget as HTMLElement;
                              if (rLongPressRef.current && (Math.abs(t.clientX - parseFloat(el.dataset.txS ?? '0')) > 8 || Math.abs(t.clientY - parseFloat(el.dataset.tyS ?? '0')) > 8))
                                { clearTimeout(rLongPressRef.current); rLongPressRef.current = null; }
                              if (rDragIdx === null) return;
                              e.preventDefault();
                              const under = document.elementFromPoint(t.clientX, t.clientY);
                              const itemEl = under?.closest('[data-r-item-idx]') as HTMLElement | null;
                              const tgt = itemEl ? parseInt(itemEl.dataset.rItemIdx ?? '-1') : -1;
                              const tgtCod = itemEl?.dataset.rItemCod;
                              setRDropIdx(tgt !== -1 && tgt !== rDragIdx && tgtCod === cod ? tgt : null);
                            }}
                            onTouchEnd={(e) => {
                              if (rLongPressRef.current) { clearTimeout(rLongPressRef.current); rLongPressRef.current = null; }
                              if (rDragIdx === null) return;
                              e.preventDefault();
                              const t = e.changedTouches[0];
                              const under = document.elementFromPoint(t.clientX, t.clientY);
                              const itemEl = under?.closest('[data-r-item-idx]') as HTMLElement | null;
                              const tgt = itemEl ? parseInt(itemEl.dataset.rItemIdx ?? '-1') : -1;
                              const tgtCod = itemEl?.dataset.rItemCod;
                              if (tgt !== -1 && tgt !== rDragIdx && tgtCod === cod && (items[cod]?.[rDragIdx])?.tipo === (items[cod]?.[tgt])?.tipo)
                                setCombineModal({ srcIdx: rDragIdx, tgtIdx: tgt, cod });
                              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
                            }}
                            className={[
                              'flex items-center gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-b-0 transition-all select-none',
                              isRDragging ? 'opacity-40 bg-bg' : isRDrop ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'bg-white',
                              rDragIdx !== null && rDragCod === cod ? 'cursor-grabbing' : 'cursor-grab',
                            ].join(' ')}
                          >
                            <GripVertical size={12} color="#CBD5E1" className="flex-shrink-0" />
                            <span className={`font-barlow-condensed text-[13px] font-bold min-w-[32px] ${item.tipo === 'Pallet' ? 'text-info' : 'text-warn'}`}>{item.orden}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded font-barlow-condensed ${item.tipo === 'Pallet' ? 'text-info bg-[rgba(37,99,235,0.10)]' : 'text-warn bg-[rgba(217,119,6,0.10)]'}`}>
                                  {item.tipo}
                                </span>
                                <span className="text-[12px] font-semibold text-text-2">{item.contenido === 'Chocolate' ? 'CH' : item.contenido}</span>
                                <span className="text-[12px] font-bold text-navy">
                                  {etiquetaDeUnidad(item) ?? `${item.peso}kg`}
                                </span>
                              </div>
                              <div className="text-[11px] text-text-3 mt-0.5 truncate">
                                {item.tipo === 'Bulto' && item.contenido === 'Chocolate'
                                  ? `${CHOCOLATE_DIMS.alto}×${CHOCOLATE_DIMS.largo}×${CHOCOLATE_DIMS.ancho} cm`
                                  : `${item.alto}cm${item.tipo === 'Bulto' ? ` · ${item.largo}×${item.ancho}cm` : ' · 120×100cm'}`
                                }
                                {' · '}{item.estado.split(' ').slice(0, 2).join(' ')}
                              </div>
                            </div>
                            <button onClick={() => rStartEdit(cod, idx)}
                              className="border border-border text-text-3 bg-bg-2 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] active:text-info flex-shrink-0">
                              ✎
                            </button>
                            <button onClick={() => { deletePickingSlot(item.pickingSlotId, { label: item.orden, codArg: cod }); dispatch({ type: 'DELETE_ITEM', tiendaCod: cod, idx }); armarUndo(`${item.orden} eliminado`, () => reAgregarItem(item)); }}
                              className="border-none text-text-3 cursor-pointer px-2 py-1.5 rounded-lg text-[15px] bg-bg-2 active:text-red flex-shrink-0">
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom action bar — Volver (solo móvil) + REGISTRAR al pie derecho (movido desde el
            header, igual que Nacional). El 🗑 "Nuevo despacho" se quitó. */}
        <div className="flex-shrink-0 bg-white border-t border-border px-3 py-2.5 flex gap-2 items-center"
             style={{ boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }}>
          <button
            onClick={() => setView('list')}
            className="lg:hidden w-12 flex items-center justify-center py-3.5 bg-bg-2 text-text-2 border border-border rounded-card text-[18px] cursor-pointer active:bg-bg-3"
            title="Volver">←</button>
          {registered ? (
            <button
              onClick={() => onReopen?.()}
              title={`Registrado${terminatedAt ? ` a las ${terminatedAt}` : ''} · toca para reabrir`}
              className="ml-auto py-2.5 px-5 bg-[#16A34A] text-white border-none rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              style={{ boxShadow: '0 4px 16px rgba(22,163,74,0.30)' }}>
              ✓ Completado
            </button>
          ) : (
            <button
              onClick={() => onRegistrar?.()}
              className="ml-auto py-2.5 px-5 bg-red text-white border-none rounded-card font-barlow-condensed text-[15px] font-bold tracking-wide cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.30)' }}>
              Registrar
            </button>
          )}
        </div>
      </div>
    );
  };

  /* Una unidad: la tarjeta de pesaje si está pendiente, o su línea si ya se pesó. */
  const renderUnidad = (row: FormRow) => {
              const rowLabel = labelDeFila(row, orderedRows);
              if (row.saved && row.savedItem) {
                const slotDeFila = row.pickingSlotId
                  ? (pickingSlotsFull[currentTienda?.cod ?? ''] ?? []).find(s => s.id === row.pickingSlotId)
                  : undefined;
                const contenido = row.savedItem.contenido === 'Chocolate' ? 'CH' : row.savedItem.contenido;
                return (
                  // [Handheld] El ancla también en la línea pesada: escanear una unidad ya pesada
                  // tiene que llegar a ella y mostrarla, no abrir la tienda y quedarse arriba.
                  <FilaPesada key={row.id} clase={claseUnidad(row.tipo)} etiqueta={rowLabel}
                    slotId={row.pickingSlotId}
                    resaltada={row.pickingSlotId != null && row.pickingSlotId === resaltado}
                    // Una adquisición no tiene peso ni medidas: escribir «0kg · 0cm» haría pasar la
                    // AUSENCIA de un dato por un dato. Dice qué es.
                    resumen={etiquetaDeUnidad(row.savedItem) ?? `${row.savedItem.peso} kg · ${row.savedItem.alto} cm`}
                    campos={etiquetaDeUnidad(row.savedItem) ? undefined : [
                      { rotulo: 'Peso', valor: `${row.savedItem.peso} kg` },
                      { rotulo: 'Alto', valor: `${row.savedItem.alto} cm` },
                      ...(contenido ? [{ rotulo: 'Contenido', valor: contenido }] : []),
                    ]}
                    aviso={esSinPesar(row.savedItem) ? (
                      <span className="text-rotulo font-bold uppercase text-est-aviso bg-est-aviso-suave rounded-full px-2 py-0.5">sin pesar</span>
                    ) : undefined}
                    detalle={
                      <>
                        {contenido}
                        {slotDeFila?.picker_label ? `${contenido ? ' · ' : ''}armó ${slotDeFila.picker_label}` : ''}
                      </>
                    }
                    seleccion={(row.tipo === 'Bulto' || row.tipo === 'Chocolate') ? (
                      <input type="checkbox" checked={mergeSel.has(row.id)} onChange={() => toggleMergeSel(row.id)}
                        aria-label={`Seleccionar ${rowLabel} para sumar en masa`}
                        className="w-5 h-5 cursor-pointer flex-shrink-0" style={{ accentColor: 'var(--uni-pallet)' }} />
                    ) : undefined}>
                    <div className="flex gap-2 flex-wrap">
                      <BotonAccion onClick={() => { if (confirmarCambioGuardado('editar', rowLabel)) editSavedRow(row.id); }}>Editar</BotonAccion>
                      {row.tipo === 'Bulto' && (
                        <BotonAccion onClick={() => { setDupN(2); setDupRow(dupRow === row.id ? null : row.id); }}
                          title="Duplicar bulto (mismo peso y medidas)">Duplicar</BotonAccion>
                      )}
                      <BotonAccion tono="peligro" onClick={() => { if (confirmarCambioGuardado('eliminar', rowLabel)) deleteSavedRow(row.id); }}>Eliminar</BotonAccion>
                    </div>
                    {dupRow === row.id && row.tipo === 'Bulto' && (
                      <div className="mt-2 pt-2 border-t border-black/[0.08] flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-warn">Duplicar</span>
                        <div className="flex items-center border border-black/[0.15] rounded-lg overflow-hidden bg-white">
                          <button onClick={() => setDupN(n => Math.max(1, n - 1))} className="w-7 h-8 text-navy font-bold text-[17px] leading-none">−</button>
                          <span className="w-8 text-center font-barlow-condensed font-bold text-[16px] tabular-nums">{dupN}</span>
                          <button onClick={() => setDupN(n => Math.min(20, n + 1))} className="w-7 h-8 text-navy font-bold text-[17px] leading-none">+</button>
                        </div>
                        <button onClick={() => { const n = dupN; setDupRow(null); void duplicarBulto(row, n); }}
                          className="h-8 px-3 rounded-lg bg-warn text-white text-[12px] font-bold flex items-center gap-1">⧉ Duplicar {dupN}</button>
                      </div>
                    )}
                    {/* P1: Sumar a Pallet directo en la card guardada (B/CH) sin abrir ✎ */}
                    {(row.tipo === 'Bulto' || row.tipo === 'Chocolate') && (() => {
                      const palletTargets = formRows.filter(r => r.id !== row.id && r.tipo === 'Pallet');
                      if (palletTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        return labelDeFila(r, formRows);
                      };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: 'rgba(37,99,235,0.30)' }}>
                          {isExpanded ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">Sumar a Pallet…</div>
                              <div className="flex flex-wrap gap-1">
                                {palletTargets.map(pl => (
                                  <button key={`sum-${pl.id}`}
                                    onClick={() => sumarBultoAPallet(row.id, getRowLabel(pl), pl.id)}
                                    className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                    style={{ borderColor: 'rgba(37,99,235,0.45)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                                    → {getRowLabel(pl)}
                                  </button>
                                ))}
                                <button onClick={() => setFormMergeState(null)}
                                  className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                              className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                              style={{ border: '1.5px dashed rgba(37,99,235,0.30)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                              SUMAR A PALLET
                            </button>
                          )}
                        </div>
                      );
                    })()}
                    {/* P3 #1: Unificar directo en la card guardada (Pallet/Contenedor) sin abrir ✎ */}
                    {(row.tipo === 'Pallet' || row.tipo === 'Contenedor') && (() => {
                      const combineTargets = formRows.filter(r => r.id !== row.id && r.tipo === row.tipo);
                      if (combineTargets.length === 0) return null;
                      const getRowLabel = (r: typeof row) => {
                        return labelDeFila(r, formRows);
                      };
                      const col = row.tipo === 'Contenedor'
                        ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)', solid: 'rgba(107,33,168,0.45)' }
                        : { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)', solid: 'rgba(37,99,235,0.45)' };
                      const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                      return (
                        <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: col.border }}>
                          {isExpanded ? (
                            <div className="flex flex-col gap-1">
                              <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">Unificar con…</div>
                              <div className="flex flex-wrap gap-1">
                                {combineTargets.map(other => (
                                  <button key={`uni-${other.id}`}
                                    onClick={() => { if (window.confirm(`${getRowLabel(row)} ya está guardado.\n\n¿Seguro que quieres unificarlo con ${getRowLabel(other)}?`)) iniciarUnionInline(row, other, getRowLabel(row), getRowLabel(other)); }}
                                    className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                    style={{ borderColor: col.solid, color: col.color, background: col.bg }}>
                                    {getRowLabel(other)}
                                  </button>
                                ))}
                                <button onClick={() => setFormMergeState(null)}
                                  className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                              className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                              style={{ border: `1.5px dashed ${col.border}`, color: col.color, background: col.bg }}>
                              UNIFICAR
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </FilaPesada>
                );
              }
              /* Active / unsaved card */
              const isChocRow  = row.tipo === 'Bulto' && row.contenido === 'Chocolate';
              const isChocTipo = row.tipo === 'Chocolate';
              // De qué caja es esta fila, para el aviso de la tara y la etiqueta.
              const cajaDeFila = isChocTipo && currentTienda
                ? subtipoDeCaja((pickingSlotsFull[currentTienda?.cod ?? ''] ?? []).find(s => s.id === row.pickingSlotId)?.subtipo)
                : null;
              const isContRow  = row.tipo === 'Contenedor';
              // [Presencia por pallet] Al enfocar cualquier input de esta tarjeta, avisar que
              // ESTA es la que se está escribiendo — no solo "estoy en la tienda".
              const marcarEnFoco = () => row.pickingSlotId && setSlotEnFoco(row.pickingSlotId);
              const quitarFoco = () => setSlotEnFoco(prev => prev === row.pickingSlotId ? null : prev);
              // [Buscar por número de pallet] `id` para que el salto directo la encuentre con
              // scrollIntoView; el resaltado marca la última escaneada hasta el próximo salto.
              const esResaltada = row.pickingSlotId != null && row.pickingSlotId === resaltado;
              return (
                <div key={row.id} id={row.pickingSlotId != null ? `pallet-card-${row.pickingSlotId}` : undefined}
                  data-tarjeta-bodega="" data-slot={row.pickingSlotId ?? undefined}
                  className={`relative bg-card rounded-kios border-2 px-3 py-3 shadow-kios ${ESTILO_ACTIVA[claseUnidad(row.tipo)]} ${esResaltada ? 'tarjeta-escaneada' : ''}`}>
                  {row.pickingSlotId != null && <PresenciaBadge viendo={viendoPorSlot.get(row.pickingSlotId)} contexto="tarjeta" />}
                  <div className="flex items-center gap-2 mb-2.5">
                    <EtiquetaUnidad clase={claseUnidad(row.tipo)} grande>{rowLabel}</EtiquetaUnidad>
                    {row.pickingSlotId ? <span className="font-mono text-cuerpo text-text">#{row.pickingSlotId}</span> : null}
                    <button onClick={() => removeUnsavedRow(row.id)} aria-label={`Quitar ${rowLabel}`}
                      className="ml-auto w-10 h-10 -mr-1 flex items-center justify-center rounded-btn text-text-sub bg-bg-2 active:bg-bg-3 cursor-pointer border-none text-cuerpo">✕</button>
                  </div>
                  {(() => {
                    const slot = row.pickingSlotId ? (pickingSlotsFull[currentTienda?.cod ?? ''] ?? []).find(s => s.id === row.pickingSlotId) : undefined;
                    if (!slot?.picker_label) return null;
                    return (
                      <div className="text-[11px] text-text-3 mb-2 flex items-center gap-1" title={`Armado por ${slot.picker_label}`}>
                        <User size={10} className="shrink-0" aria-hidden="true" /> {slot.picker_label}
                      </div>
                    );
                  })()}
                  {row.mergeReopened && (
                    <div className="mb-2 flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-bold"
                      style={{ border: '1.5px solid rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                      {bannerReapertura(row.mergeMotivo ?? 'union')}
                    </div>
                  )}
                  {!isContRow && !isChocTipo && (
                  <div className="mb-2">
                    <label className="text-rotulo font-bold text-text-sub uppercase block mb-1">Tipo de carga</label>
                    <div className="flex gap-0.5">
                      {(row.tipo === 'Pallet' ? CONTENIDO_PALLET : CONTENIDO_BULTO).map(c => (
                        <button key={c} onClick={() => updateRow(row.id, 'contenido', c)}
                          title={c}
                          className={`flex-1 py-1.5 rounded border text-[12px] font-bold cursor-pointer transition-all ${row.contenido === c ? 'bg-[rgba(37,99,235,0.10)] border-info text-info' : 'border-border bg-bg-2 text-text-3'}`}>
                          {c.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  )}
                  <div className={`grid ${row.tipo === 'Pallet' ? 'grid-cols-3' : 'grid-cols-2'} gap-1 mb-1.5`}>
                    <div>
                      <label className="text-rotulo font-bold text-text-sub uppercase block mb-1">
                        peso{cajaDeFila === 'negra' && <span className="normal-case text-[#C2410C] font-bold"> · se descuentan {String(TARA_CAJA_NEGRA).replace('.', ',')} kg de caja</span>}
                      </label>
                      <input type="text" value={row.peso} onChange={e => updateRow(row.id, 'peso', limpiarTecleo(e.target.value))}
                        onFocus={marcarEnFoco} onBlur={quitarFoco}
                        placeholder="kg" inputMode="decimal" data-campo="peso"
                        className={CAMPO_GRANDE} />
                    </div>
                    {!isChocRow && !isContRow && !isChocTipo && (
                      <div>
                        <label className="text-rotulo font-bold text-text-sub uppercase block mb-1">alto</label>
                        <input type="number" value={row.alto} onChange={e => updateRow(row.id, 'alto', e.target.value)}
                          onFocus={marcarEnFoco} onBlur={quitarFoco}
                          placeholder="cm" inputMode="decimal" max={MAX_ALTO_CM} data-campo="alto"
                          className={CAMPO_GRANDE} />
                        {excedeAltoMax(parseFloat(row.alto) || 0) && (
                          <div className="text-[10px] text-warn mt-0.5">⚠ máx {MAX_ALTO_CM} cm</div>
                        )}
                      </div>
                    )}
                    {row.tipo === 'Pallet' && (
                      <CampoPesoPallet peso={row.peso} valor={row.pesoPallet ?? ''} claseCampo={CAMPO_GRANDE}
                        onChange={v => updateRow(row.id, 'pesoPallet', v)} onFocus={marcarEnFoco} onBlur={quitarFoco} />
                    )}
                  </div>
                  {row.tipo === 'Bulto' && !isChocRow && (
                    <div className="grid grid-cols-2 gap-1 mb-1.5">
                      {(['largo', 'ancho'] as const).map(f => (
                        <div key={f}>
                          <label className="text-rotulo font-bold text-text-sub uppercase block mb-1">{f}</label>
                          <input type="number" value={row[f]} onChange={e => updateRow(row.id, f, e.target.value)}
                            onFocus={marcarEnFoco} onBlur={quitarFoco}
                            placeholder="cm" inputMode="decimal" data-campo={f}
                            className={CAMPO} />
                        </div>
                      ))}
                    </div>
                  )}
                  {row.tipo === 'Pallet' && (
                    <div className="mb-1.5 text-[11px] text-info bg-[rgba(37,99,235,0.06)] border border-[rgba(37,99,235,0.15)] rounded px-1.5 py-1">120×100 cm</div>
                  )}
                  {isChocRow && (
                    <div className="mb-1.5 text-[11px] text-navy/60 bg-bg border border-border rounded px-1.5 py-1">
                      {CHOCOLATE_DIMS.alto}×{CHOCOLATE_DIMS.largo}×{CHOCOLATE_DIMS.ancho} cm · fijas
                    </div>
                  )}
                  {isContRow && (
                    <div className="mb-1.5 text-[11px] text-[#6B21A8] bg-[rgba(107,33,168,0.06)] border border-[rgba(107,33,168,0.15)] rounded px-1.5 py-1">
                      110×80×150 cm · fijas
                    </div>
                  )}
                  {isChocTipo && (
                    <div className="mb-1.5 text-[11px] bg-[rgba(146,64,14,0.06)] border border-[rgba(146,64,14,0.15)] rounded px-1.5 py-1" style={{ color: '#92400E' }}>
                      {cajaDeFila ? etiquetaSubtipo(cajaDeFila) : 'Chocolate'}{cajaDeFila === 'negra' ? ` · ${CHOCOLATE_DIMS.largo}×${CHOCOLATE_DIMS.ancho}×${CHOCOLATE_DIMS.alto} cm fijas` : ' · sin medidas'}
                    </div>
                  )}
                  {/* UN solo botón: con peso guarda normal; sin peso ofrece "agregar sin pesar"
                      (confirmación) → dimensiones en 0. En filas mergeReopened siempre hay peso
                      real de la unificación, así que van por el camino normal. */}
                  <button
                    onClick={async () => {
                      const tienePeso = (leerPeso(row.peso) ?? 0) > 0;
                      if (!tienePeso && !row.mergeReopened) {
                        if (window.confirm('¿Agregar sin pesar? El peso y las medidas quedarán en 0.')) {
                          await saveRow(row, true);
                          showToast('Agregado sin pesar', '#D97706');
                        }
                        return;
                      }
                      await saveRow(row);
                    }}
                    data-accion="guardar"
                    className="w-full min-h-[50px] bg-navy text-white border-none rounded-btn font-barlow-condensed text-titulo font-bold cursor-pointer transition-transform active:scale-[0.98]">
                    {row.mergeReopened ? botonReapertura(row.mergeMotivo ?? 'union') : (pendientes.length > 1 ? 'Guardar y seguir' : 'Guardar')}
                  </button>
                  {!row.mergeReopened && (() => {
                    const esBultoOChoc = row.tipo === 'Bulto' || row.tipo === 'Chocolate';
                    // Combinar: mismo tipo, sin guardar (combine dimensional)
                    const combineTargets = (row.tipo === 'Pallet' || row.tipo === 'Bulto' || row.tipo === 'Contenedor')
                      ? formRows.filter(r => !r.saved && r.id !== row.id && r.tipo === row.tipo)
                      : [];
                    // Sumar a Pallet: solo para Bulto/Chocolate → cualquier Pallet (guardado o no)
                    const palletTargets = esBultoOChoc
                      ? formRows.filter(r => r.id !== row.id && r.tipo === 'Pallet')
                      : [];
                    if (combineTargets.length === 0 && palletTargets.length === 0) return null;
                    const gcStyle = row.tipo === 'Pallet'
                      ? { border: 'rgba(37,99,235,0.30)', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' }
                      : row.tipo === 'Contenedor'
                      ? { border: 'rgba(107,33,168,0.30)', color: '#6B21A8', bg: 'rgba(107,33,168,0.06)' }
                      : { border: 'rgba(217,119,6,0.30)', color: '#D97706', bg: 'rgba(217,119,6,0.06)' };
                    const isExpanded = formMergeState?.sourceId === row.id && formMergeState.targetId === null;
                    const getRowLabel = (r: typeof row) => labelDeFila(r, formRows);
                    return (
                      <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: gcStyle.border }}>
                        {isExpanded ? (
                          <div className="flex flex-col gap-1">
                            <div className="text-[9px] text-text-3 uppercase tracking-wide font-bold mb-0.5">
                              {palletTargets.length > 0 ? 'Sumar a Pallet / combinar…' : '¿Combinar con…?'}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {palletTargets.map(pl => (
                                <button key={`sum-${pl.id}`}
                                  onClick={() => sumarBultoAPallet(row.id, getRowLabel(pl), pl.id)}
                                  className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                  style={{ borderColor: 'rgba(37,99,235,0.45)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                                  → {getRowLabel(pl)}
                                </button>
                              ))}
                              {combineTargets.map(other => (
                                <button key={other.id}
                                  onClick={() => iniciarUnionInline(row, other, getRowLabel(row), getRowLabel(other))}
                                  className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer border-2 transition-all active:scale-[0.97]"
                                  style={{ borderColor: gcStyle.border, color: gcStyle.color, background: 'white' }}>
                                  {getRowLabel(other)}
                                </button>
                              ))}
                              <button onClick={() => setFormMergeState(null)}
                                className="px-2 py-1 rounded font-barlow-condensed text-[10px] cursor-pointer border transition-all"
                                style={{ borderColor: 'rgba(0,0,0,0.15)', color: '#9CA3AF', background: 'white' }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setFormMergeState({ sourceId: row.id, targetId: null })}
                            className="w-full py-1.5 rounded font-barlow-condensed text-[11px] font-bold tracking-widest cursor-pointer transition-all active:scale-[0.97]"
                            style={{ border: `1.5px dashed ${gcStyle.border}`, color: gcStyle.color, background: gcStyle.bg }}>
                            {palletTargets.length > 0 ? 'SUMAR / UNIFICAR' : 'UNIFICAR'}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
  };

  /* ════════════════════════════════════
     RIGHT PANEL — MULTI-FORM
  ════════════════════════════════════ */
  const renderMultiForm = (isMobile = false) => {
    if (!currentTienda) return null;
    const bloqueada = tiendaTerminada(currentTienda.cod);
    const swipeHandlers = isMobile ? { start: onSheetDragStart, move: onSheetDragMove, end: onSheetDragEnd } : undefined;
    return (
      <>
        <TiendaFormHeader tienda={currentTienda} avance={avance} itemCount={tiendaItems.length}
          onBack={() => setView('list')} swipe={swipeHandlers}
          terminadaInfo={terminadas.get(currentTienda.cod)} onToggleTerminada={marcarTerminada}
          sinPesarCount={tiendaItems.filter(esSinPesar).length}
          sinGuardar={avisoSinGuardar(unidadesSinGuardar(pickingSlotsFull[currentTienda.cod] ?? [], tiendaItems))}
          viendo={viendoPorTienda.get(currentTienda.cod)}
          canalSano={canalSano}
          agregar={{ bloqueado: bloqueada, opciones: [
            { texto: 'Pallet',      clase: 'pallet',     onClick: () => setDialogTipo('Pallet') },
            { texto: 'Bulto',       clase: 'bulto',      onClick: () => setDialogTipo('Bulto') },
            { texto: 'Cont.',       clase: 'contenedor', onClick: () => setDialogTipo('Contenedor') },
            { texto: 'Choc.',       clase: 'chocolate',  onClick: () => setDialogTipo('Chocolate') },
            // No piden medidas ni peso: se crean de un toque, sin diálogo. Ver shared/adquisicion.
            { texto: 'Adquisición', clase: 'agregado', detalle: 'no se pesa', onClick: () => void addFormRow('Adquisicion') },
            { texto: 'Web / retiro', clase: 'agregado', detalle: 'no se pesa', onClick: () => void addFormRow('WebRetiro') },
          ] }}
          botonRegistrar={
            <RegistrarTiendaButton rol={profile?.role} terminada={tiendaTerminada(currentTienda.cod)} variante="claro"
              unidades={tiendaItems.length} yaRegistrada={registroTiendas.registrada(currentTienda.cod)}
              onRegistrar={() => registrarSoloTienda(currentTienda.cod)} />
          } />

        {/* El cruce va JUSTO DEBAJO del encabezado porque contesta la pregunta que se hace un
            segundo antes de marcar la tienda terminada: ¿está todo lo que tenía que estar? */}
        {verCruce && (
          <div className="px-2 pt-2">
            <CruceDePesosCard cruce={cruceDelDia.porTienda.get(currentTienda.cod)}
              items={tiendaItems} listo={cruceDelDia.listo} />
          </div>
        )}

        <div ref={isMobile ? formScrollRef : formScrollDesktopRef} className="flex-1 overflow-y-auto px-2 py-2">
          {bloqueada && (
            <AvisoTiendaTerminada nuevas={nuevasDe(currentTienda.cod)}
              onReabrir={() => { if (window.confirm('¿Reabrir esta tienda para pesar lo nuevo? Ya no se mostrará como lista para despachar.')) marcarTerminada(currentTienda.cod, false); }} />
          )}
          {/* Terminada: todo lo de adentro queda deshabilitado de una vez (inputs y botones). */}
          <fieldset disabled={bloqueada} className="contents">
          {/* ── AHORA · FALTAN · PESADOS — la misma lectura que Nacional. Ver `TiendaAbierta`. */}
          <>
            {(() => {
              const activa = pendientes.find(r => r.id === activaId);
              const enCola = pendientes.filter(r => r.id !== activaId);
              const kgPesados = pesadas.reduce((t, r) => t + (Number(r.savedItem?.peso) || 0), 0);
              return (
                <>
                  {activa && (
                    <>
                      <RotuloSeccion>Ahora</RotuloSeccion>
                      {renderUnidad(activa)}
                    </>
                  )}
                  {(enCola.length > 0 || ghostCards.length > 0) && (
                    <>
                      <RotuloSeccion derecha={activa ? 'Escanea o toca' : undefined}>
                        {`Faltan ${enCola.length + ghostCards.length}`}
                      </RotuloSeccion>
                      <ColaPendientes onElegir={elegirActiva}
                        fichas={enCola.map(r => ({
                          id: r.id,
                          clase: claseUnidad(r.tipo),
                          etiqueta: labelDeFila(r, orderedRows),
                          slotId: r.pickingSlotId,
                          aMedias: !!r.tocada,
                        }))} />
                      {ghostCards.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {ghostCards.map(gc => {
              const tipoMap: Record<string, string> = { p: 'Pallet', b: 'Bulto', c: 'Contenedor' };
              const prefixMap: Record<string, string> = { p: 'P', b: 'B', c: 'C' };
              const regCount = tiendaItemsList.filter(i => i.tipo === tipoMap[gc.type]).length;
              const prefix = prefixMap[gc.type];
              const opts = Array.from({ length: regCount }, (_, i) => `${prefix}${i + 1}`);
              return (
                <div key={gc.key} className="rounded-lg border-2 border-dashed p-2 flex flex-col gap-1.5" style={{ borderColor: gc.border, background: gc.bg }}>
                  <div className="flex items-center justify-between">
                    <span className="font-barlow-condensed text-[13px] font-extrabold" style={{ color: gc.text }}>{gc.label}</span>
                    <span className="text-[9px] text-text-3 font-bold uppercase tracking-widest">picking</span>
                  </div>
                  <div className="text-[10px] text-text-3 leading-snug">¿Con cuál fue unificado?</div>
                  {opts.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {opts.map(opt => (
                        <button
                          key={opt}
                          onClick={() => absorbPickingSlotSant(cod, gc.type)}
                          className="flex-1 py-1 rounded font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97] border-2"
                          style={{ borderColor: gc.border, color: gc.text, background: 'white' }}>
                          ✓ {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => absorbPickingSlotSant(cod, gc.type)}
                      className="w-full py-1.5 rounded border-2 border-dashed font-barlow-condensed text-[11px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                      style={{ borderColor: gc.border, color: gc.text, background: 'white' }}>
                      ✓ Confirmar
                    </button>
                  )}
                </div>
              );
            })}
                        </div>
                      )}
                    </>
                  )}
                  {pesadas.length > 0 && (
                    <>
                      <RotuloSeccion derecha={`${kgPesados.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg`}>
                        {`Pesados ${pesadas.length}`}
                      </RotuloSeccion>
                      <div className="rounded-card border border-border overflow-hidden divide-y divide-border">
                        {pesadas.map(row => renderUnidad(row))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </>
          {(() => {
            // [Sumar en masa · botones] La barra aparece apenas hay ≥1 Bulto/CH guardado (aunque NO
            // haya pallet todavía). El destino se elige con UN clic en el botón del pallet (P1/P2…);
            // antes era un <select> + botón "Sumar" aparte. "+ Nuevo" abre el diálogo de "+ Pallet"
            // de siempre (no crea nada distinto): la selección se mantiene y al crear el pallet
            // aparece su botón para sumar.
            const sumableRows = formRows.filter(r => r.saved && r.savedItem && (r.tipo === 'Bulto' || r.tipo === 'Chocolate'));
            if (sumableRows.length === 0) return null;
            // Incluye pallets AÚN NO agregados (marcados con borde punteado). Sumar les fija el peso
            // en su card + slot; hay que acordarse de agregarlos para que queden registrados.
            const palletRows = formRows.filter(r => r.tipo === 'Pallet' && (r.savedItem || r.pickingSlotId));
            const getPalletLabel = (r: FormRow) => {
              const idx = formRows.slice(0, formRows.findIndex(x => x.id === r.id) + 1).filter(x => x.tipo === 'Pallet').length;
              return `P${idx}`;
            };
            const selectedCount = sumableRows.filter(r => mergeSel.has(r.id)).length;
            const allSelected = selectedCount > 0 && selectedCount === sumableRows.length;
            return (
              <div className="sticky bottom-0 z-10 -mx-2 mt-1 mb-2 px-3 py-2.5 flex items-center gap-2 flex-wrap shadow-lg"
                style={{ background: '#1B2A6B' }}>
                <button onClick={() => setMergeSel(allSelected ? new Set() : new Set(sumableRows.map(r => r.id)))}
                  className={`font-barlow-condensed px-2.5 py-1.5 rounded text-[12px] font-bold cursor-pointer border transition-all ${
                    allSelected ? 'bg-white text-navy border-white' : 'text-white border-white/35 bg-white/10'}`}>
                  Todos
                </button>
                <span className="font-barlow-condensed text-[12px] text-white/85 font-semibold flex-1 min-w-[96px]">
                  {selectedCount > 0 ? `${selectedCount} seleccionados` : 'Marcá varios o Todos'}
                </span>
                <span className="font-barlow-condensed text-[11px] font-bold uppercase tracking-wide text-white/55">Sumar a</span>
                {palletRows.map(r => {
                  const agregado = !!r.savedItem;
                  return (
                  <button key={r.id} disabled={selectedCount === 0}
                    onClick={() => sumarVariosAPallet([...mergeSel], r.id)}
                    title={agregado ? `Sumar los seleccionados a ${getPalletLabel(r)}` : `Sumar a ${getPalletLabel(r)} — aún sin agregar (acordate de agregarlo después)`}
                    className={`font-barlow-condensed px-3 py-1.5 rounded text-[13px] font-bold cursor-pointer transition-all border-[1.5px] text-white hover:bg-[#2f7bff] hover:border-[#2f7bff] disabled:opacity-40 disabled:cursor-not-allowed ${
                      agregado ? 'border-white/40 bg-white/10' : 'border-dashed border-amber-300 bg-transparent'}`}>
                    {getPalletLabel(r)}
                  </button>
                  );
                })}
                <button onClick={() => setDialogTipo('Pallet')}
                  title="Crear un pallet nuevo para sumar los seleccionados"
                  className="font-barlow-condensed px-3 py-1.5 rounded text-[13px] font-bold cursor-pointer transition-all border-[1.5px] border-dashed border-white/45 text-[#CDE0FF] hover:bg-white/10">
                  + Nuevo
                </button>
                <button disabled={selectedCount === 0}
                  onClick={() => { const ids = sumableRows.filter(r => mergeSel.has(r.id)).map(r => r.id); if (confirmarEliminarVarios(ids.length)) deleteSavedRows(ids); }}
                  title="Eliminar todos los seleccionados"
                  className="font-barlow-condensed px-3 py-1.5 rounded text-apoyo font-bold cursor-pointer transition-all border-[1.5px] border-red-300/70 text-red-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed">
                  Eliminar
                </button>
              </div>
            );
          })()}
          </fieldset>
          {dialogTipo && currentTienda && !bloqueada && (
            <AgregarPalletDialog
              tipoLabel={dialogTipo}
              storeCod={currentTienda.cod}
              date={fechaISOLocal()}
              refInicial={dialogRef ?? undefined}
              comprobarAlAbrir={dialogBorrado}
              onClose={() => setDialogTipo(null)}
              onNuevo={(cantidad) => { const t = dialogTipo; setDialogTipo(null); void (async () => { for (let i = 0; i < cantidad; i++) await addFormRow(t, undefined, i); })(); }}
              onExistente={(slot, yaEnCarga) => {
                setDialogTipo(null);
                // Si ya está a la vista no se duplica; si la base lo tenía y la pantalla no, se
                // materializa. Antes esto último era imposible: el servidor devolvía 409 y el
                // mensaje mandaba a "buscarlo en la lista", donde no estaba.
                if (accionReclamo(formRows, slot.id) === 'ya_visible') {
                  showToast(avisoYaVisible(slot.id), '#D97706');
                  return;
                }
                const t = SLOT_TIPO_TO_CARGAMENTO[slot.tipo] ?? 'Bulto';
                void addFormRow(t, slot);
                showToast(yaEnCarga ? avisoRecuperado(slot.id) : `✓ Pallet #${slot.id} agregado`, '#16A34A');
              }}
            />
          )}
          {activeTiendasCount > 0 && (
            <button onClick={goToResumen}
              className="w-full py-3.5 bg-navy text-white border-none rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer active:bg-navy-dark mb-4 lg:hidden"
              style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}>
              Ver resumen ({activeTiendasCount}) →
            </button>
          )}
          <div className="h-4" />
        </div>
      </>
    );
  };

  /* ════════════════════════════════════
     ROOT RENDER
  ════════════════════════════════════ */
  // Fecha de armado/despacho (se muestra dentro de la columna izquierda, como Regiones)
  const santiagoFechaDespacho = state.fechaDespacho ?? (() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">

      {/* ─── LEFT PANEL ─── always visible on mobile; hidden only in resumen view */}
      <div
        className={`${view === 'resumen' ? 'hidden' : 'flex'} lg:flex flex-1 lg:flex-none flex-col w-full overflow-hidden flex-shrink-0`}
        style={isDesktop ? { width: leftWidth } : undefined}
      >

        {/* Fechas y buscador: en el teléfono se pliegan al bajar por la lista (ver
            `usePlegarCabecera`). En escritorio quedan siempre. Igual que Regiones. */}
        <div ref={refCabecera} className={`flex-shrink-0 ${cabeceraPlegada ? 'max-lg:hidden' : ''}`}>
        <FechasBodega armado={todayKey} despacho={santiagoFechaDespacho} min={todayKey} registrado={!!state.registrado}
          onDespacho={fecha => dispatch({ type: 'SET_FECHA_DESPACHO', payload: fecha })}>
          {/* RM / Costa junto a las fechas: antes ocupaban una fila entera bajo el buscador. Al
              menos uno queda siempre elegido. */}
          <div role="group" aria-label="Grupos de tiendas" className="flex rounded-btn border border-border overflow-hidden">
            {([
              { id: 'rm'    as const, label: 'RM' },
              { id: 'costa' as const, label: 'Costa' },
            ]).map(({ id, label }) => {
              const active = selectedGrps.has(id);
              return (
                <button key={id} type="button" aria-pressed={active}
                  onClick={() => setSelectedGrps(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) { if (next.size > 1) next.delete(id); }
                    else next.add(id);
                    return next;
                  })}
                  className={`font-barlow-condensed text-apoyo font-extrabold min-w-[52px] px-3 py-2 cursor-pointer select-none transition-colors
                    ${active ? 'bg-navy text-white' : 'bg-card text-text-sub'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </FechasBodega>

        <div className="px-3 pt-2 pb-2.5 bg-bg border-b border-border flex-shrink-0">
          <div className="relative">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} data-buscador-bodega=""
              // La pistola de radiofrecuencia escribe el código y manda Enter, igual que un teclado.
              // Con esto, escanear termina el salto sin que nadie tenga que tocar el resultado.
              onKeyDown={e => { if (e.key === 'Enter' && palletEncontrado) { e.preventDefault(); saltarAPallet(); } }}
              onFocus={() => setBuscadorConFoco(true)} onBlur={() => setBuscadorConFoco(false)}
              placeholder="Buscar tienda, Nº de pallet o escanear…"
              className="w-full bg-white border border-border rounded-btn px-3 py-2.5 pr-9 text-text font-barlow text-[16px] outline-none focus:border-[#1E40AF] placeholder:text-text-3 transition-all" />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-text-3 hover:bg-bg-2 cursor-pointer border-none bg-transparent text-[15px]">
                ✕
              </button>
            )}
          </div>
          {palletEncontrado && tiendaDelPallet && (
            <button onClick={saltarAPallet}
              className="w-full mt-2 flex items-center gap-2.5 bg-white border-2 border-[#1E40AF] rounded-btn px-3 py-2.5 text-left cursor-pointer active:scale-[0.98] transition-all">
              <span className="text-[18px] shrink-0">📦</span>
              <span className="flex-1 min-w-0">
                <span className="block font-barlow-condensed text-[15px] font-bold text-navy">
                  Pallet #{palletEncontrado.slot.id}
                </span>
                <span className="block text-[11px] text-text-3 truncate">
                  {tiendaDelPallet.tienda} ({tiendaDelPallet.cod})
                </span>
                {avisoEscaneo.texto && (
                  <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold rounded px-1.5 py-0.5 ${
                    avisoEscaneo.advertir ? 'text-[#B45309] bg-[rgba(217,119,6,0.14)]' : 'text-text-3 bg-black/[0.05]'}`}>
                    {avisoEscaneo.advertir && <AlertTriangle size={11} aria-hidden="true" />}
                    {avisoEscaneo.texto}
                  </span>
                )}
              </span>
              <span className="text-[12px] font-bold text-[#1E40AF] shrink-0">Ir →</span>
            </button>
          )}
        </div>
        </div>

        {/* ── Subir guías PDF de Santiago ── */}
        <div className="hidden lg:flex px-2 py-1.5 bg-bg border-b border-border flex-shrink-0">
          <input
            ref={guideFileRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => e.target.files && handleGuideFiles(e.target.files)} />
          <button
            onClick={() => !guideUploading && guideFileRef.current?.click()}
            disabled={guideUploading}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setGuideDragOver(true); } }}
            onDragLeave={e => { e.stopPropagation(); setGuideDragOver(false); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); setGuideDragOver(false); if (!guideUploading && e.dataTransfer.files.length) handleGuideFiles(e.dataTransfer.files); }}
            className={`flex-1 py-3 border-2 rounded-btn font-barlow-condensed text-[16px] font-extrabold tracking-wide cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${guideDragOver ? 'border-[#1E40AF] bg-[rgba(30,64,175,0.18)] text-[#1E40AF] scale-[1.02]' : 'border-[#1E40AF] bg-[rgba(30,64,175,0.06)] text-[#1E40AF] active:bg-[rgba(30,64,175,0.12)]'}`}>
            {guideUploading
              ? <><div className="w-3 h-3 border-2 border-[#1E40AF]/30 border-t-[#1E40AF] rounded-full animate-spin" />Procesando…</>
              : guideDragOver ? '↓ Suelta PDFs' : 'Subir guías'}
          </button>
        </div>

        {renderStoreGrid()}
        {renderStatsBar()}
      </div>

      {/* Divider: Left ↔ Center — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={handleLeftMouseDown}
          onTouchStart={handleLeftTouchStart}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* ─── CENTER PANEL — form (desktop only) ─── */}
      <div className="hidden lg:flex flex-1 flex-col overflow-hidden">
        {!currentTienda
          ? (
            // [Rediseño enterprise] El panel vacío ocupaba flex-1 completo en navy saturado —
            // ahora es un bloque compacto arriba (icono + texto), sobre superficie neutra.
            <div className="flex-1 flex flex-col bg-bg" style={{ minHeight: 0 }}>
              <div className="flex-shrink-0 flex flex-col items-center gap-1 py-8 px-6">
                <Store size={24} className="text-text-3/50 mb-1" strokeWidth={1.5} aria-hidden="true" />
                <p className="font-barlow-condensed text-[15px] font-bold text-text-2">Selecciona una tienda</p>
              </div>
            </div>
          )
          : renderMultiForm(false)
        }
      </div>

      {/* Divider: Center ↔ Right — desktop only */}
      {isDesktop && (
        <div
          className="group flex-shrink-0 cursor-col-resize flex items-center justify-center relative select-none z-10"
          style={{ width: 6, background: 'rgba(0,0,0,0.06)' }}
          onMouseDown={handleRightMouseDown}
          onTouchStart={handleRightTouchStart}
        >
          <div className="absolute inset-0 group-hover:bg-amber-400/25 transition-colors duration-150" />
          <div className="flex flex-col gap-[5px] relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {[0,1,2].map(i => <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: '#D97706' }} />)}
          </div>
        </div>
      )}

      {/* ─── RIGHT PANEL — resumen (desktop only) ─── */}
      <div className="hidden lg:flex flex-col overflow-hidden flex-shrink-0"
           style={isDesktop ? { width: rightWidth } : undefined}>
        {renderResumenPanel()}
      </div>

      {/* ─── MOBILE: resumen view ─── */}
      {view === 'resumen' && (
        <div className="flex lg:hidden flex-1 flex-col overflow-hidden">
          {/* Cabecera con VOLVER. En el teléfono, el Resumen ocupa la pantalla entera: la columna
              de las tarjetas queda `hidden` y la barra de abajo —donde viven Resumen, Enrutador y
              Manual— se va con ella. Sin esta cabecera no quedaba ninguna salida dentro de la
              aplicación: había que usar el botón del navegador. Bodega Nacional ya la tenía (su
              Resumen es un overlay con su propio encabezado); acá faltaba, porque el panel que se
              reutiliza es el de ESCRITORIO, y su encabezado es `hidden lg:block`.
              Va en la vista y no dentro de `renderResumenPanel`, que también es la columna derecha
              del escritorio — ahí un "volver" no significa nada. */}
          <div className="bg-navy px-3 py-3 flex items-center gap-3 flex-shrink-0"
               style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
            <button
              onClick={() => setView('list')}
              aria-label="Volver a las tiendas"
              className="flex items-center justify-center rounded-full flex-shrink-0 cursor-pointer transition-all active:scale-95 border-none"
              style={{
                width: 36, height: 36,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <span className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-wide flex-1">Resumen</span>
            <button
              onClick={enrutar}
              className="flex items-center gap-2 py-2 px-3 rounded cursor-pointer transition-all active:opacity-70"
              style={{ background: 'rgba(30,64,175,0.25)', border: '1px solid rgba(30,64,175,0.60)' }}>
              <Navigation size={13} color="#93C5FD" strokeWidth={2} />
              <span className="font-barlow-condensed text-[13px] font-bold tracking-wide" style={{ color: '#93C5FD' }}>Enrutador</span>
            </button>
          </div>
          {renderResumenPanel()}
        </div>
      )}

      {/* ── MOBILE BOTTOM SHEET ── (lg:hidden) */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 lg:hidden"
        style={{
          background: 'rgba(15,23,42,0.55)',
          backdropFilter: 'blur(3px)',
          opacity: currentTienda ? 1 : 0,
          pointerEvents: currentTienda ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        onClick={() => { dispatch({ type: 'CLEAR_TIENDA' }); setView('list'); }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 lg:hidden flex flex-col rounded-t-[28px] bg-white overflow-hidden"
        style={{
          minHeight: '82vh',
          maxHeight: '92vh',
          transform: currentTienda ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Form content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {currentTienda && renderMultiForm(true)}
        </div>
      </div>

      {/* Calendar modals */}
      {confirmAdd && (
        <ConfirmCalendarModal name={confirmAdd} mode="add"
          onConfirm={() => { addToToday(confirmAdd); setConfirmAdd(null); }}
          onCancel={() => setConfirmAdd(null)} />
      )}
      {confirmRemove && (
        <ConfirmCalendarModal name={confirmRemove} mode="remove"
          viendo={viendoPorTienda.get(TIENDAS_SANTIAGO.find(t => t.tienda === confirmRemove)?.cod ?? '')}
          onConfirm={() => { removeFromToday(confirmRemove); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)} />
      )}

      {combineModal && (() => {
        const activeCod = combineModal.cod ?? rDragCod ?? currentTienda?.cod;
        const allItems  = activeCod ? (items[activeCod] || []) : [];
        const src = allItems[combineModal.srcIdx];
        const tgt = allItems[combineModal.tgtIdx];
        if (!src || !tgt) return null;
        const srcLabel = `${src.orden || src.tipo} · ${src.peso}kg · ${src.contenido}`;
        const tgtLabel = `${tgt.orden || tgt.tipo} · ${tgt.peso}kg · ${tgt.contenido}`;
        return (
          <CombineItemsModal
            pkgLabel={src.tipo === 'Pallet' ? 'Pallets' : 'Bultos'}
            srcLabel={srcLabel}
            tgtLabel={tgtLabel}
            onConfirm={(peso, alto) => handleSantiagoCombineConfirm(peso, alto, activeCod)}
            onCancel={() => {
              setCombineModal(null);
              setRDragIdx(null); setRDropIdx(null); setRDragCod(null);
            }}
          />
        );
      })()}

      {/* [Unificar inline] La unificación P3→P1 ya no usa modal flotante: es automática
          (iniciarUnionInline) y el target se reabre como card editable para la altura. */}

      <CalManualSheet
        open={showCalManual}
        onClose={() => setShowCalManual(false)}
        title="METROPOLITANA / COSTA"
        lines={calManualLines}
      />

      <UndoBar pending={undoPending} onRevert={revertirUndo} onClose={descartarUndo} />
    </div>
  );
}
