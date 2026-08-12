'use client';
import { useState } from 'react';
import { FileText, Loader2, BarChart3, ClipboardList, Check, Flag, AlertTriangle } from 'lucide-react';
import RouteCard          from './RouteCard';
import ManifiestoPanel    from './ManifiestoPanel';
import { fechaTxt, fechaLargaTxt } from '../utils/helpers';
import type { Ruta, StoreItem } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';

interface Props {
  results: { ts: StoreItem[]; rutas: Ruta[] };
  supervisor: string;
  fecha: string;
  tiendas: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }>;
  gps: Record<string, number[]>;
  cd: number[];
  flota: Vehiculo[];
  onLimpiar: () => void;
  onVolver: () => void;
  onGenerarPDF: () => void;
  onGuardarHistorial: () => Promise<boolean>;
  historialStatus: string;
  historialMsg: string;
  // El mapa (MapSection) ahora es un panel fijo fuera de este componente — el km real
  // y el detalle por tramo llegan calculados desde ahí (RutasScreen), no se calculan acá.
  kmPorRuta: Record<number, number>;
  legDataPorRuta: Record<number, {dist: string; dur: string}[]>;
  pendientesV2: { c: string; p: number; b: number; ch: number }[];
  cerrado: boolean;
  // Fase B: patentes ya cerradas (badge "Cerrado" informativo). El cierre por camión se hace
  // en el board DESPACHO (ManualDispatch), no aquí en el post-ruta.
  cerradasV1: Set<string>;
  // El panel de Cierre de Jornada (CierreJornadaPanel) ahora vive en RutasScreen — también
  // se puede abrir desde el tablero DESPACHO ("Terminar día"), sin pasar por "Calcular"
  // primero. Este botón solo dispara la apertura del panel compartido.
  onAbrirCierre: () => void;
}

export default function ResultsSection({
  results, supervisor, fecha, tiendas, gps, cd,
  onLimpiar, onVolver, onGenerarPDF, onGuardarHistorial,
  historialStatus, historialMsg,
  kmPorRuta, legDataPorRuta,
  pendientesV2, cerrado,
  cerradasV1, onAbrirCierre,
}: Props) {
  const { ts, rutas } = results;
  const tp = ts.reduce((s, t) => s + t.p, 0);
  const tb = ts.reduce((s, t) => s + t.b, 0);

  const [manifiestoOpen, setManifiestoOpen] = useState(false);

  // Registrar despacho y, si el guardado primario fue exitoso, encadenar
  // automáticamente con la generación de manifiestos (panel reutilizable y cerrable).
  async function handleRegistrarYManifiesto() {
    const ok = await onGuardarHistorial();
    if (ok) setManifiestoOpen(true);
  }

  const histBg    = historialStatus === 'success' ? '#EAF7EE' : '#FFF3E0';
  const histColor = historialStatus === 'success' ? '#34C759' : '#FF9500';

  return (
    <div id="res" className="mt-[22px]">

      <div id="pdfHeader" className="print-flex hidden items-center justify-between pb-3.5 mb-4 border-b-[3px] border-knavy">
        {/* Logo oficial (fondo claro en impresión). Fallback al wordmark si la imagen no carga. */}
        <img
          src="/logo-kiosclub.webp"
          alt="KIOS Club — American Supermarket"
          className="h-[48px] w-auto"
        />
        <div className="text-right text-[11px] text-[#888] leading-[1.6] font-mono">
          <div><strong className="text-ktext text-[13px]">Centro de Distribución — Despacho</strong></div>
          <div>Fecha: {fechaLargaTxt(fecha)}</div>
          <div>Supervisor: {supervisor || 'Sin especificar'}</div>
          <div>Sistema de Enrutamiento v4.3</div>
        </div>
      </div>

      <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-1 no-print">02 — Rutas sugeridas</div>
      <div className="text-[20px] font-bold text-ktext leading-tight mb-[3px]">
        Despacho {fechaTxt(fecha)}
      </div>
      <div className="text-[13px] text-kmuted mb-3.5">
        {supervisor || 'Supervisor'} · {ts.length} tiendas · {rutas.length} rutas · {tp}P + {tb}B
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[9px] mb-3.5">
        {([
          [ts.length, 'Tiendas'],
          [tp,        'Pallets'],
          [tb,        'Bultos'],
          [rutas.length, 'Rutas'],
        ] as [number, string][]).map(([n, l]) => (
          <div key={l} className="sc bg-white rounded-kios shadow-kios px-4 py-3.5">
            <div className="sn text-[30px] font-extrabold text-knavy leading-none tracking-tight">{n}</div>
            <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[0.8px] mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {rutas.map((r, ri) => (
        <RouteCard
          key={r.v.p}
          ruta={r}
          index={ri}
          tiendas={tiendas}
          gps={gps}
          cd={cd}
          kmReal={kmPorRuta[ri]}
          legData={legDataPorRuta[ri]}
          cerrada={cerradasV1.has((r.v.p ?? '').trim().toUpperCase())}
        />
      ))}

      <div className="flex gap-[9px] mt-4 no-print">
        <button onClick={onVolver} className="h-[42px] px-4 rounded-kios2 bg-kbg text-kmuted text-[13px] font-semibold border-[1.5px] border-black/[0.09] whitespace-nowrap flex items-center gap-1.5">
          ← Volver
        </button>
        <button onClick={onLimpiar} className="flex-1 h-[42px] rounded-kios2 bg-kbg text-kmuted text-[14px] font-semibold border-[1.5px] border-black/[0.09]">
          Nueva consulta
        </button>
        <button onClick={onGenerarPDF} className="btn-pdf flex-1 h-[50px] px-6 rounded-kios2 bg-knavy text-white text-[15px] font-bold flex items-center justify-center gap-2">
          <FileText size={16} aria-hidden="true" /> Exportar PDF
        </button>
      </div>

      <div className="mt-[9px] no-print">
        <button
          onClick={() => void handleRegistrarYManifiesto()}
          disabled={historialStatus === 'loading'}
          className="w-full h-[46px] rounded-kios2 bg-white text-knavy text-[14px] font-bold border-2 border-knavy flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
        >
          {historialStatus === 'loading'
            ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Registrando...</>
            : <><BarChart3 size={16} aria-hidden="true" /> REGISTRAR DESPACHO Y GENERAR MANIFIESTOS</>}
        </button>
        {historialMsg && (
          <div
            className="mt-[7px] px-3 py-2.5 rounded-kios2 text-[12px] font-semibold text-center border"
            style={{ background: histBg, color: histColor, borderColor: histColor }}
          >
            {historialMsg}
          </div>
        )}
      </div>

      {/* Manifiesto de Ruta */}
      <div className="mt-[9px] no-print">
        <button
          onClick={() => setManifiestoOpen(true)}
          className="w-full h-[46px] rounded-kios2 bg-knavy text-white text-[14px] font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <ClipboardList size={16} aria-hidden="true" /> Generar Manifiestos de Ruta
        </button>
        <div className="mt-[5px] text-[10px] text-kmuted text-center">
          Genera el documento único por ruta · incluye QR maestro · reemplaza guías físicas
        </div>
      </div>

      {/* Cierre de jornada */}
      <div className="mt-[9px] no-print">
        <button
          onClick={onAbrirCierre}
          className="w-full h-[46px] rounded-kios2 bg-white text-knavy text-[14px] font-bold border-2 border-knavy/30 flex items-center justify-center gap-2 transition-all cursor-pointer hover:border-knavy"
        >
          {cerrado
            ? <><Check size={16} aria-hidden="true" /> Jornada cerrada — ver resumen</>
            : <><Flag size={16} aria-hidden="true" /> Cierre de jornada</>}
        </button>
        {pendientesV2.length > 0 && (
          <div className="mt-[5px] text-[10px] text-kred text-center font-semibold flex items-center justify-center gap-1">
            <AlertTriangle size={12} aria-hidden="true" /> {pendientesV2.length} tienda{pendientesV2.length !== 1 ? 's' : ''} pendiente{pendientesV2.length !== 1 ? 's' : ''} para 2ª vuelta
          </div>
        )}
      </div>

      <ManifiestoPanel
        rutas={rutas}
        fecha={fecha}
        supervisor={supervisor}
        tiendas={tiendas}
        isOpen={manifiestoOpen}
        onClose={() => setManifiestoOpen(false)}
      />
    </div>
  );
}
