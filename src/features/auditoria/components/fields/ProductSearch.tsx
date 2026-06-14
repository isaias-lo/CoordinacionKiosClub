'use client';

import { useState, useEffect, useMemo } from 'react';
import { buscarProducto } from '../../utils/odooApi';
import type { TipoError, ProductoError, ProductoOdoo, OdooConfig } from '../../types';
import { calcAuditado } from '../../utils/calculos';

export function ProductSearch({ odooConfig, tiposError, operacionCodes, onAdd, onNeedConfig }: {
  odooConfig: OdooConfig; tiposError: TipoError[]; operacionCodes: string[];
  onAdd: (p: ProductoError) => void; onNeedConfig: () => void;
}) {
  const hasOdoo = !!odooConfig.url;
  const [manualMode, setManualMode] = useState(!hasOdoo);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<ProductoOdoo | null>(null);
  const [error, setError] = useState('');
  const [unidades, setUnidades] = useState('');
  const [tipoProd, setTipoProd] = useState<TipoError>(tiposError[0] ?? 'faltante');
  const [manualNombre, setManualNombre] = useState('');
  const [selectedOp, setSelectedOp] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tiposError.includes(tipoProd)) setTipoProd(tiposError[0] ?? 'faltante'); }, [tiposError]);
  const cleanCodigo = (raw: string) => {
    const stripped = raw.replace(/[\[\]]/g, '').trim().toUpperCase();
    return stripped;
  };
  const buscar = async () => {
    if (!odooConfig.url) { onNeedConfig(); return; }
    const cod = cleanCodigo(codigo); if (!cod) return;
    setLoading(true); setError(''); setFound(null);
    try {
      const ops = selectedOp ? [selectedOp] : operacionCodes.filter(Boolean);
      const prod = await buscarProducto(odooConfig, cod, ops);
      if (prod) setFound(prod);
      else setError(`"${cod}" no encontrado`);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally { setLoading(false); }
  };
  const confirmar = () => {
    if (!found || !unidades || parseInt(unidades) <= 0) return;
    onAdd({ codigo: found.codigo, nombre: found.nombre, unidades: parseInt(unidades), tipo: tipoProd, cantidadEsperada: found.cantidadEsperada, operacionCod: selectedOp || undefined });
    setCodigo(''); setFound(null); setUnidades(''); setError('');
  };
  const confirmarManual = () => {
    const cod = cleanCodigo(codigo);
    if (!cod || !unidades || parseInt(unidades) <= 0) return;
    onAdd({ codigo: cod, nombre: manualNombre.trim() || cod, unidades: parseInt(unidades), tipo: tipoProd, operacionCod: selectedOp || undefined });
    setCodigo(''); setManualNombre(''); setUnidades('');
  };
  const ratioPreview = useMemo(() => {
    if (!found?.cantidadEsperada || !unidades || isNaN(parseInt(unidades))) return null;
    const u = parseInt(unidades); if (u <= 0) return null;
    return { auditado: calcAuditado(u, tipoProd, found.cantidadEsperada), esperado: found.cantidadEsperada, delta: tipoProd === 'faltante' ? -u : +u };
  }, [found, unidades, tipoProd]);
  return (
    <div className="border border-dashed border-navy/20 rounded-card p-3 bg-bg">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide flex-1">Agregar producto</div>
        {hasOdoo && (
          <div className="flex gap-1">
            <button onClick={() => { setManualMode(false); setError(''); setFound(null); }} className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${!manualMode ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Odoo</button>
            <button onClick={() => { setManualMode(true); setFound(null); setError(''); }} className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${manualMode ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Manual</button>
          </div>
        )}
      </div>
      {operacionCodes.filter(Boolean).length > 1 && (
        <div className="mb-2">
          <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1">Operación de origen</div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setSelectedOp('')} className={`px-2 py-1 rounded-btn text-[10px] font-bold border cursor-pointer ${!selectedOp ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Todas</button>
            {operacionCodes.filter(Boolean).map(op => (
              <button key={op} onClick={() => setSelectedOp(op === selectedOp ? '' : op)} className={`px-2 py-1 rounded-btn text-[10px] font-bold font-mono border cursor-pointer ${selectedOp === op ? 'bg-info text-white border-info' : 'bg-white text-text-2 border-border'}`}>{op}</button>
            ))}
          </div>
        </div>
      )}
      {manualMode ? (
        <div className="flex flex-col gap-2">
          <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código (con o sin corchetes, o últimos 6 dígitos)"
            className="bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-mono text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
          <input type="text" value={manualNombre} onChange={e => setManualNombre(e.target.value)} placeholder="Nombre (opcional)"
            className="bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-barlow text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
          <div className="flex gap-2 items-center">
            {tiposError.length > 1 && <div className="flex gap-1 flex-shrink-0">{tiposError.map(t => <button key={t} onClick={() => setTipoProd(t)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-btn border cursor-pointer ${tipoProd === t ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}>{t === 'faltante' ? '↓' : '↑'}</button>)}</div>}
            <input type="number" inputMode="numeric" min="1" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Unidades"
              className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-2 py-1.5 text-center font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
            <button onClick={confirmarManual} disabled={!codigo.trim() || !unidades || parseInt(unidades) <= 0} className="py-1.5 px-3 bg-success text-white border-none rounded-btn text-[12px] font-bold cursor-pointer disabled:opacity-40 flex-shrink-0">+ Add</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input type="text" value={codigo} onChange={e => { setCodigo(e.target.value); setFound(null); setError(''); }} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="[NLAVINF031] o VINF031"
              className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-mono text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
            <button onClick={buscar} disabled={loading || !codigo.trim()} className="px-3 py-2 bg-navy text-white border-none rounded-btn font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center w-12">
              {loading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔍'}
            </button>
          </div>
          {error && <div className="mt-1.5 text-[11px] text-red">{error}</div>}
          {found && (
            <div className="mt-2">
              <div className="bg-white border border-success/30 rounded-btn px-3 py-2 mb-2.5 flex items-center justify-between">
                <div><div className="font-mono text-[10px] text-text-3">[{found.codigo}]</div><div className="text-[13px] font-semibold text-text">{found.nombre}</div></div>
                {found.cantidadEsperada !== undefined && <div className="text-right ml-3 flex-shrink-0"><div className="text-[10px] text-text-3 uppercase">Esperado</div><div className="font-barlow-condensed text-[22px] font-bold text-navy leading-tight">{found.cantidadEsperada}</div></div>}
              </div>
              <div className="flex gap-2 items-center">
                {tiposError.length > 1 && <div className="flex gap-1 flex-shrink-0">{tiposError.map(t => <button key={t} onClick={() => setTipoProd(t)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-btn border cursor-pointer ${tipoProd === t ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}>{t === 'faltante' ? '↓ Falt.' : '↑ Sobr.'}</button>)}</div>}
                <div className="flex-1">
                  <input type="number" inputMode="numeric" min="1" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Error qty"
                    className="w-full bg-white border-[1.5px] border-border rounded-btn px-2 py-1.5 text-center font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
                  {ratioPreview && <div className={`text-center mt-1 font-barlow-condensed font-bold text-[15px] ${tipoProd === 'faltante' ? 'text-red' : 'text-warn'}`}>{ratioPreview.auditado}/{ratioPreview.esperado} <span className="text-[12px] opacity-70">({ratioPreview.delta > 0 ? '+' : ''}{ratioPreview.delta})</span></div>}
                </div>
                <button onClick={confirmar} disabled={!unidades || parseInt(unidades) <= 0} className="py-1.5 px-3 bg-success text-white border-none rounded-btn text-[12px] font-bold cursor-pointer disabled:opacity-40 flex-shrink-0">+ Add</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
