'use client';
import { useState } from 'react';
import RouteCard  from './RouteCard';
import MapSection from './MapSection';
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
  onGenerarPDF: () => void;
  onGuardarHistorial: () => void;
  onChoferChange: (ri: number, nombre: string) => void;
  historialStatus: string;
  historialMsg: string;
  onKmTotalReal: (km: number) => void;
  onCdUpdate: (coords: number[]) => void;
}

export default function ResultsSection({
  results, supervisor, fecha, tiendas, gps, cd, flota,
  onLimpiar, onGenerarPDF, onGuardarHistorial,
  onChoferChange, historialStatus, historialMsg,
  onKmTotalReal, onCdUpdate,
}: Props) {
  const { ts, rutas } = results;
  const tp = ts.reduce((s, t) => s + t.p, 0);
  const tb = ts.reduce((s, t) => s + t.b, 0);

  const conductores = [
    ...new Set(flota.filter(v => v.ch?.trim()).map(v => v.ch!.trim())),
    'Conductor externo',
  ];

  const [kmPorRuta,      setKmPorRuta]      = useState<Record<number, number>>({});
  const [legDataPorRuta, setLegDataPorRuta] = useState<Record<number, {dist: string; dur: string}[]>>({});

  function handleKmReady(kmMap: Record<number, number>, legMap: Record<number, {dist: string; dur: string}[]>) {
    setKmPorRuta(kmMap);
    setLegDataPorRuta(legMap || {});
    const total = Object.values(kmMap).reduce((s, v) => s + v, 0);
    onKmTotalReal(Math.round(total * 10) / 10);
    rutas.forEach((r, ri) => { if (kmMap[ri] !== undefined) r._kmReal = kmMap[ri]; });
  }

  const histBg    = historialStatus === 'success' ? '#EAF7EE' : '#FFF3E0';
  const histColor = historialStatus === 'success' ? '#34C759' : '#FF9500';

  return (
    <div id="res" className="mt-[22px]">

      <div id="pdfHeader" className="print-flex hidden items-center justify-between pb-3.5 mb-4 border-b-[3px] border-kred">
        <div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[22px] font-extrabold text-kred tracking-tight">KIOS</span>
            <span className="text-[18px] italic font-bold text-kred">Club</span>
          </div>
          <div className="bg-knavy rounded-[2px] px-1.5 py-0.5 inline-flex gap-[3px] mt-0.5">
            {[0,1,2,3,4].map(i => <span key={i} className="text-white text-[8px]">★</span>)}
          </div>
        </div>
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
            <div className="sn text-[30px] font-extrabold text-kred leading-none tracking-tight">{n}</div>
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
          conductores={conductores}
          onChoferChange={onChoferChange}
          kmReal={kmPorRuta[ri]}
          legData={legDataPorRuta[ri]}
        />
      ))}

      <MapSection
        rutas={rutas}
        gps={gps}
        cd={cd}
        tiendas={tiendas}
        onKmReady={handleKmReady}
        onCdUpdate={onCdUpdate}
      />

      <div className="flex gap-[9px] mt-4 no-print">
        <button onClick={onLimpiar} className="flex-1 h-[42px] rounded-kios2 bg-kbg text-kmuted text-[14px] font-semibold border-[1.5px] border-black/[0.09]">
          ← Nueva consulta
        </button>
        <button onClick={onGenerarPDF} className="btn-pdf flex-1 h-[50px] px-6 rounded-kios2 bg-knavy text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(27,42,107,0.3)]">
          📄 Exportar PDF
        </button>
      </div>

      <div className="mt-[9px] no-print">
        <button
          onClick={onGuardarHistorial}
          disabled={historialStatus === 'loading'}
          className="w-full h-[46px] rounded-kios2 bg-white text-knavy text-[14px] font-bold border-2 border-knavy flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
        >
          {historialStatus === 'loading' ? '⏳ Guardando...' : '📊 Guardar Historial'}
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
    </div>
  );
}
