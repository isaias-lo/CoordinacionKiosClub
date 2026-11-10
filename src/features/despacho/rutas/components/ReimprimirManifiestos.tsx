'use client';

// [Reimprimir manifiestos · 10/11/2026] Pedido de Isaias: «se cierra el camión y ya no se puede
// volver a ver esos documentos». Lista los manifiestos YA guardados de un día —por el día en que
// el camión SALE, que es como se los busca a la mañana— y abre los elegidos para imprimir, con su
// código y su QR reales. No guarda ni cambia nada: solo lee `rutas_despacho`.

import { useEffect, useMemo, useState } from 'react';
import ManifiestoPanel from './ManifiestoPanel';
import { SegmentadoA, BotonA, INPUT_A } from './ControlesA';
import { fetchCounts } from '../../../../lib/despachoSesion';
import { fechaTxt } from '../utils/helpers';
import type { TiendaInfo } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';
import {
  chocolatesPorTienda, filasReimpresion, manifiestoDesdeGuardado, idsDePatente,
  type ManifiestoData, type ManifiestoGuardadoCompleto,
} from '../utils/manifiestoReimpresion';
import { diaVecino, type BuscarPor } from '../utils/reimprimirDia';

export interface PedidoReimpresion {
  por: BuscarPor;
  dia: string;
  /** Desde «✓ Cerrado · ver manifiesto»: abre directo los de esa patente, sin pasar por la lista. */
  patente?: string;
}

interface Props {
  pedido: PedidoReimpresion;
  hoy: string;
  supervisor: string;
  tiendas: Record<string, TiendaInfo & { _parada?: boolean }>;
  flota: Vehiculo[];
  onClose: () => void;
}

export default function ReimprimirManifiestos({ pedido, hoy, supervisor, tiendas, flota, onClose }: Props) {
  const [por, setPor] = useState<BuscarPor>(pedido.por);
  const [dia, setDia] = useState(pedido.dia);
  const [guardados, setGuardados] = useState<ManifiestoGuardadoCompleto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chocolates, setChocolates] = useState<Map<string, number>>(new Map());
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [abiertos, setAbiertos] = useState<ManifiestoData[] | null>(null);
  // La patente pedida se abre una sola vez; si se cierra el manifiesto, queda la lista.
  const [patentePendiente, setPatentePendiente] = useState(pedido.patente);

  useEffect(() => {
    let cancel = false;
    setGuardados(null); setError(null);
    const q = por === 'salida' ? `salida=${encodeURIComponent(dia)}` : `fecha=${encodeURIComponent(dia)}`;
    fetch(`/api/rutas-despacho?${q}`)
      .then(async r => {
        const j = await r.json().catch(() => ({})) as { data?: ManifiestoGuardadoCompleto[]; error?: string };
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        return Array.isArray(j.data) ? j.data : [];
      })
      .then(async rows => {
        // Chocolates: `ruta_tiendas` no los guarda; salen de lo registrado en Bodega el día de armado.
        const dias = [...new Set(rows.map(r => r.fecha))];
        const sesion = (await Promise.all(dias.map(d => fetchCounts(d).catch(() => [])))).flat();
        if (cancel) return;
        setChocolates(chocolatesPorTienda(sesion));
        setGuardados(rows);
        setElegidos(new Set(rows.map(r => r.id)));
      })
      .catch(e => { if (!cancel) { setError(e instanceof Error ? e.message : 'No se pudo leer'); setGuardados([]); } });
    return () => { cancel = true; };
  }, [por, dia]);

  const filas = useMemo(() => filasReimpresion(guardados), [guardados]);

  const armar = (ids: number[]): ManifiestoData[] => {
    const porId = new Map((guardados ?? []).map(g => [g.id, g]));
    const transporte = (p: string) => flota.find(v => v.p.trim().toUpperCase() === p.trim().toUpperCase())?.empresa;
    const tienda = (c: string) => tiendas[c] ?? tiendas[c.toUpperCase()];
    return filas.filter(f => ids.includes(f.id))
      .map((f, i) => manifiestoDesdeGuardado(porId.get(f.id)!, i, { tienda, transporte, chocolates }));
  };

  // Abrir directo los de la patente pedida en cuanto llegan.
  useEffect(() => {
    if (!patentePendiente || guardados == null) return;
    const ids = idsDePatente(guardados, patentePendiente);
    setPatentePendiente(undefined);
    if (ids.length) setAbiertos(armar(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardados, patentePendiente]);

  const toggle = (id: number) => setElegidos(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  if (abiertos) {
    return (
      <ManifiestoPanel
        rutas={[]}
        fecha={abiertos[0]?.fecha ?? dia}
        supervisor={supervisor}
        tiendas={tiendas}
        isOpen={true}
        onClose={() => setAbiertos(null)}
        reimpresion={abiertos}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.5)' }}
      role="dialog" aria-label="Reimprimir manifiestos">
      <div className="bg-white rounded-[16px] w-full max-w-[640px] max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-black/[0.07] flex-shrink-0">
          <div>
            <div className="text-[17px] font-bold text-ktext">Manifiestos guardados</div>
            <div className="text-apoyo text-kmuted mt-0.5">Elige un día y vuelve a abrir o imprimir los camiones ya cerrados.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center text-kmuted hover:text-ktext bg-black/[0.04] flex-shrink-0">✕</button>
        </div>

        <div className="px-5 py-3 flex flex-col gap-2.5 border-b border-black/[0.07] flex-shrink-0">
          <SegmentadoA etiqueta="Buscar por" valor={por} onCambio={setPor}
            opciones={[['salida', 'Día que sale'], ['armado', 'Día que se armó']] as const} />
          <div className="flex items-center gap-2 flex-wrap">
            <BotonA onClick={() => setDia(diaVecino(dia, -1))} aria-label="Día anterior">←</BotonA>
            <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)}
              className={`${INPUT_A} !w-auto`} aria-label="Día" />
            <BotonA onClick={() => setDia(diaVecino(dia, 1))} aria-label="Día siguiente">→</BotonA>
            {dia !== hoy && <BotonA variante="suave" onClick={() => setDia(hoy)}>Hoy</BotonA>}
          </div>
          <div className="text-apoyo text-kmuted first-letter:uppercase">
            {por === 'salida' ? 'Salen el' : 'Se armaron el'} {fechaTxt(dia)}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {guardados == null ? (
            <div className="p-6 text-center text-apoyo text-kmuted">Buscando…</div>
          ) : error ? (
            <div className="p-6 text-center text-apoyo text-[#D42B2B]">No se pudieron leer los manifiestos: {error}</div>
          ) : !filas.length ? (
            <div className="p-6 text-center text-apoyo text-kmuted">
              No hay camiones cerrados que {por === 'salida' ? 'salgan' : 'se hayan armado'} ese día.
              {por === 'salida' ? ' Prueba con «Día que se armó».' : ' Prueba con «Día que sale».'}
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {filas.map(f => (
                <li key={f.id}>
                  <label className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-black/[0.02]">
                    <input type="checkbox" checked={elegidos.has(f.id)} onChange={() => toggle(f.id)} className="w-4 h-4 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-ktext">{f.patente}</span>
                        <span className="text-apoyo text-kmuted">{f.codigo_ruta}</span>
                        {f.tipo === 'congelado' && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#E0F2FE] text-[#0E7490]">Congelado</span>
                        )}
                      </div>
                      <div className="text-apoyo text-kmuted truncate">
                        {f.chofer} · {f.tiendas} tienda{f.tiendas !== 1 ? 's' : ''} · {f.pallets} pallet{f.pallets !== 1 ? 's' : ''} · {f.bultos} bulto{f.bultos !== 1 ? 's' : ''}
                        {por === 'salida' ? ` · armado ${f.fecha.split('-').reverse().slice(0, 2).join('/')}` : f.fecha_salida ? ` · sale ${f.fecha_salida.split('-').reverse().slice(0, 2).join('/')}` : ''}
                      </div>
                    </div>
                    <button type="button"
                      onClick={e => { e.preventDefault(); setAbiertos(armar([f.id])); }}
                      className="text-apoyo font-bold px-3 py-1.5 rounded-[8px] border border-knavy/40 text-knavy hover:bg-knavy/5 flex-shrink-0">
                      Ver
                    </button>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {filas.length > 0 && (
          <div className="px-5 py-3 border-t border-black/[0.07] flex items-center gap-2 flex-shrink-0">
            <span className="text-apoyo text-kmuted">{elegidos.size} de {filas.length}</span>
            <div className="flex-1" />
            <BotonA variante="primario" disabled={!elegidos.size}
              onClick={() => setAbiertos(armar([...elegidos]))}>
              Abrir {elegidos.size > 1 ? `los ${elegidos.size}` : ''} para imprimir
            </BotonA>
          </div>
        )}
      </div>
    </div>
  );
}
