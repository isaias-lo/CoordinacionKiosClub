'use client';

import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatTimer } from '../../constants';
import { displayPicker } from '../dashboard/helpers';
import type { AuditEntry, TipoError } from '../../types';

function calcAuditado(u: number, tipo: TipoError, esp: number) {
  return tipo === 'faltante' ? esp - u : esp + u;
}

export function HistoryContent({ history, today, onReaudit, onExportPDF, onRefresh, pickerNames }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void;
  onExportPDF?: (entries: AuditEntry[], fecha: string) => void;
  onRefresh?: () => void;
  pickerNames: Record<string, string>;
}) {
  const [histFecha, setHistFecha] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const fechasDisponibles = useMemo(() => Array.from(new Set(history.map(e => e.fecha))).sort((a, b) => b.localeCompare(a)), [history]);
  const filtrado = history.filter(e => e.fecha === (histFecha || today));

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 300));
    onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 bg-white border-b border-border flex items-center gap-2 flex-shrink-0 overflow-x-auto">
        {fechasDisponibles.length === 0 ? <span className="text-[12px] text-text-3">Sin registros</span>
          : fechasDisponibles.map(f => <button key={f} onClick={() => setHistFecha(f)} className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${histFecha === f ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>{f === today ? 'Hoy' : f}</button>)}
        {onRefresh && (
          <button onClick={handleRefresh} className={`flex-shrink-0 ml-auto border-none bg-transparent text-text-3 cursor-pointer transition-all ${refreshing ? 'animate-spin' : 'hover:text-navy'}`} title="Actualizar">
            <RefreshCw size={16} strokeWidth={2} />
          </button>
        )}
      </div>
      {filtrado.length > 0 && (
        <div className="px-4 py-1.5 bg-white border-b border-border flex gap-3 flex-shrink-0 text-[12px] items-center">
          <strong className="text-navy">{filtrado.length}</strong> aud. &nbsp;·&nbsp;
          <strong className="text-success">{filtrado.filter(e => e.resultado === 'bueno').length}</strong> buenas &nbsp;·&nbsp;
          <strong className="text-red">{filtrado.filter(e => e.resultado === 'malo').length}</strong> malas
          {onExportPDF && <button onClick={() => onExportPDF(filtrado, histFecha || today)} disabled={!filtrado.length} className="ml-auto border-none bg-transparent text-navy text-[12px] font-bold cursor-pointer disabled:opacity-40">🖨 PDF</button>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3.5">
        {!filtrado.length
          ? <div className="text-center py-16 text-text-3 text-[15px]">Sin auditorías para esta fecha.</div>
          : filtrado.map(e => (
            <div key={e.id} className={`bg-white border border-border rounded-card p-3.5 mb-2.5 ${e.reauditoriaDeId ? 'border-l-[3px] border-l-info' : ''}`} style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.05)' }}>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-barlow-condensed text-base font-bold text-navy">{e.tiendaNombre}</div>
                    {e.reauditoriaDeId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">↩ Re-auditoría</span>}
                  </div>
                  <div className="text-[11px] text-text-3 mt-0.5">{e.hora} · {e.auditor}{e.picker ? ` · ${displayPicker(e.picker, pickerNames)}` : ''}{e.durationSeconds ? ` · ⏱ ${formatTimer(e.durationSeconds)}` : ''}</div>
                </div>
                <span className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${e.resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.10)] border-success text-success' : 'bg-[rgba(211,47,47,0.10)] border-red text-red'}`}>
                  {e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] mb-2">
                <div><span className="text-text-3">Tipo:</span> <strong className="capitalize">{e.tipo}</strong></div>
                <div><span className="text-text-3">Pallets:</span> <strong>{e.pallets}</strong></div>
                <div><span className="text-text-3">Corrección:</span> <strong className={`ml-1 ${e.correccion === 'correcto' ? 'text-success' : e.correccion === 'faltante' ? 'text-red' : e.correccion === 'sobrante' ? 'text-warn' : 'text-info'}`}>{e.correccion}</strong></div>
                <div><span className="text-text-3">Errores:</span> <strong className={`ml-1 ${e.tieneErrores ? 'text-red' : 'text-success'}`}>{e.tieneErrores ? 'Sí' : 'No'}</strong></div>
              </div>
              {e.operaciones?.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{e.operaciones.map((op, i) => <span key={i} className="font-mono text-[10px] bg-bg-2 border border-border px-2 py-0.5 rounded">{op.subTipo}: {op.codigo}</span>)}</div>}
              {e.productos?.length > 0 && (
                <div className="mb-2">{e.productos.map((p, i) => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return <div key={i} className="flex items-center gap-2 text-[11px] mb-0.5"><span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{p.tipo}</span><span className="font-mono text-text-3 flex-shrink-0">[{p.codigo}]</span><span className="text-text flex-1 truncate">{p.nombre}</span><span className={`font-bold flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span></div>; })}
                </div>
              )}
              {e.observaciones && <div className="mt-1.5 px-2.5 py-1.5 bg-bg rounded-btn text-[11px] text-text-2 italic border-l-2 border-navy/20 mb-2">{e.observaciones}</div>}
              {e.fotoUrl && (
                <a href={e.fotoUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 mb-2 rounded-card overflow-hidden border border-border">
                  <img src={e.fotoUrl} alt="foto del error" className="w-full object-cover" style={{ maxHeight: 160 }} />
                  <div className="px-2 py-1 bg-bg text-[10px] text-text-3 flex items-center gap-1">📷 Foto adjunta · toca para abrir</div>
                </a>
              )}
              {e.resultado === 'malo' && <button onClick={() => onReaudit(e)} className="w-full py-2 border border-dashed border-info/40 rounded-btn text-info text-[12px] font-bold cursor-pointer bg-transparent transition-all">↩ Re-auditar</button>}
            </div>
          ))}
      </div>
    </div>
  );
}
