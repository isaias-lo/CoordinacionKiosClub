'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Check, Calendar, ClipboardList, TriangleAlert } from 'lucide-react';
import CalendarioColumnas from '@/features/control-interno/CalendarioColumnas';
import { fetchCounts, type SesionRow } from '@/lib/despachoSesion';
import { todayStr } from '@/features/despacho/rutas/utils/helpers';
import { getTiendaSantiagoByCod } from '@/features/despacho/santiago/data/tiendasSantiago';
import { partsOf, buildManualText, lineaTotal, type ManualLine, type ManualGrupo } from './manualText';
import {
  resumenPesaje, textoResumenPesaje, avisosAltoPorTienda, ALTO_AVISO_CM, type SlotPesaje,
} from './manualPesaje';
import { MAX_ALTO_CM } from './palletLimits';
import { supabase } from '@/lib/supabase';

export { partsOf, buildManualText };
export type { ManualLine };

const GRUPOS: { id: ManualGrupo; label: string }[] = [
  { id: 'rm',    label: 'RM' },
  { id: 'costa', label: 'COSTA' },
  { id: 'fal',   label: 'REGIONES' },
];

// Fila de despacho_sesion (data global del día) → línea del Manual, con su grupo.
function rowToLine(r: SesionRow): ManualLine {
  const cod = r.tienda_cod;
  const g: ManualGrupo = r.fuente === 'regiones'
    ? 'fal'
    : (getTiendaSantiagoByCod(cod)?.region === 'VR' ? 'costa' : 'rm');
  return { cod, g, p: r.pallets, b: r.bultos, c: r.contenedores, ch: r.chocolates ?? 0 };
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;             // ej. "METROPOLITANA / COSTA" o "REGIONES"
  lines: ManualLine[];       // lo cargado en ESTA pantalla (overlay sobre la data global)
}

/**
 * Hoja inferior con dos pestañas, "a la mano" en Santiago y Regiones:
 *  - Calendario: el MISMO calendario general que se ve en Picking (CalendarioColumnas).
 *  - Manual: muestra TODO el día (RM + COSTA + REGIONES) leyendo la data global
 *    (despacho_sesion, igual que el Enrutador), con filtros de grupo y botón copiar.
 *    Se hace overlay de lo cargado en esta pantalla para que vaya sin lag.
 */
export function CalManualSheet({ open, onClose, title, lines }: Props) {
  const [tab, setTab]       = useState<'cal' | 'man'>('man'); // abre en Manual (se usa más que el calendario)
  const [copied, setCopied] = useState(false);
  const [activeGroups, setActiveGroups] = useState<Set<ManualGrupo>>(new Set(['rm', 'costa', 'fal']));
  const [globalLines, setGlobalLines] = useState<ManualLine[]>([]);
  // Peso y alto por bulto — no están en despacho_sesion (que solo lleva conteos), así que el
  // pesaje y los avisos de alto se leen de picking_pallets.
  const [slots, setSlots] = useState<SlotPesaje[]>([]);

  // Al abrir, traer la data global del día (todas las bodegas) — como el Enrutador.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchCounts(todayStr()).then(rows => {
      if (!cancelled) setGlobalLines(rows.map(rowToLine));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  // Slots del día para el resumen de pesaje y los avisos de alto.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase.from('picking_pallets')
      .select('store_cod,tipo,peso_kg,alto')
      .eq('date', todayStr())
      .eq('is_active', true)
      .then(({ data }: { data: SlotPesaje[] | null }) => { if (!cancelled && data) setSlots(data); });
    return () => { cancelled = true; };
  }, [open]);

  // Data global + overlay de la pantalla actual (esta pantalla manda para sus cods).
  const manualSource = useMemo(() => {
    const map = new Map<string, ManualLine>();
    for (const gl of globalLines) map.set(gl.cod, gl);
    for (const ll of lines)       map.set(ll.cod, ll);
    return [...map.values()];
  }, [globalLines, lines]);

  const filteredLines = useMemo(
    () => manualSource.filter(l => !l.g || activeGroups.has(l.g)),
    [manualSource, activeGroups],
  );

  if (!open) return null;

  const toggleGroup = (g: ManualGrupo) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) { if (next.size > 1) next.delete(g); } // siempre al menos uno
      else next.add(g);
      return next;
    });
  };

  const { text: manualText, withItems, tot } = buildManualText(filteredLines);

  // Solo las tiendas que se están viendo: el resumen y los avisos siguen al filtro de grupo.
  const codsVisibles = new Set(withItems.map(l => l.cod));
  const resumen      = resumenPesaje(slots, codsVisibles);
  const lineaPesaje  = textoResumenPesaje(resumen);
  const avisos       = avisosAltoPorTienda(slots, codsVisibles);

  // El resumen de pesaje viaja en el copiado (es una línea de cierre, como el TOTAL). Los avisos
  // de alto NO: el formato "COD: 2P" se pega en otros lados y tiene que quedar parseable.
  const textoCopiar = manualText && lineaPesaje ? `${manualText}\n${lineaPesaje}` : manualText;

  const copy = async () => {
    if (!textoCopiar) return;
    try {
      await navigator.clipboard.writeText(textoCopiar);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard no disponible */ }
  };

  const TabBtn = ({ id, icon, label, count }: { id: 'cal' | 'man'; icon: React.ReactNode; label: string; count?: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-card border-none font-barlow-condensed text-[15px] font-bold cursor-pointer transition-colors ${
        tab === id ? 'bg-navy text-white' : 'bg-bg-2 text-text-2'
      }`}
    >
      {icon}{label}{count !== undefined ? <span className="opacity-70"> ({count})</span> : null}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-t-[20px] px-4 pb-9 pt-5 w-full min-h-[78vh] max-h-[94vh] overflow-y-auto flex flex-col"
        style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4 flex-shrink-0" />

        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h3 className="font-barlow-condensed text-[20px] font-bold text-navy tracking-wide">
            {title}
          </h3>
          <button onClick={onClose} className="bg-bg-2 text-text-2 rounded-full p-1.5 border-none cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-shrink-0">
          <TabBtn id="man" icon={<ClipboardList size={16} />} label="Manual" count={withItems.length} />
          <TabBtn id="cal" icon={<Calendar size={16} />}      label="Calendario" />
        </div>

        {tab === 'cal' ? (
          // El mismo calendario general de Picking: solo lectura, vista General.
          <div className="flex-1">
            <CalendarioColumnas readOnly forceGeneral />
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Filtros RM / COSTA / REGIONES — mismos chips del Enrutador */}
            <div className="flex gap-2 mb-3 flex-shrink-0">
              {GRUPOS.map(({ id, label }) => {
                const active = activeGroups.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleGroup(id)}
                    style={active ? { boxShadow: '0 2px 8px rgba(212,43,43,0.20)' } : undefined}
                    className={`flex-1 h-[34px] rounded-[10px] text-[12px] font-extrabold tracking-wide transition-all border ${
                      active
                        ? 'bg-kred text-white border-kred'
                        : 'bg-white border-black/[0.10] text-kmuted hover:border-kred/[0.3] hover:text-kred'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <span className="text-sm text-text-2">
                {withItems.length} tiendas · {partsOf(tot.p, tot.b + tot.ch, tot.c, 0) || '0'}
              </span>
              <button
                onClick={copy}
                disabled={!textoCopiar}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white rounded-card border-none font-bold text-[13px] cursor-pointer disabled:opacity-40"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar todo'}
              </button>
            </div>
            <div className="flex-1 text-[13px] font-mono whitespace-pre-wrap bg-bg-2 rounded-[12px] p-3 text-text min-h-[120px]">
              {withItems.length === 0 ? 'Sin items cargados.' : (
                <>
                  {withItems.map(l => {
                    const av = avisos[l.cod];
                    const n  = av ? av.cerca + av.excede : 0;
                    return (
                      <div key={l.cod} className="flex items-center gap-2 flex-wrap">
                        <span>{l.cod}: {partsOf(l.p, l.b, l.c, l.ch)}</span>
                        {av && (
                          <span
                            title={av.excede
                              ? `${av.excede} pallet${av.excede === 1 ? '' : 's'} sobre los ${MAX_ALTO_CM} cm de límite${av.cerca ? ` y ${av.cerca} cerca` : ''}`
                              : `${av.cerca} pallet${av.cerca === 1 ? '' : 's'} entre ${ALTO_AVISO_CM} y ${MAX_ALTO_CM} cm — van a llegar altos`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold font-sans"
                            style={av.excede
                              ? { background: 'rgba(211,47,47,0.10)', color: '#D32F2F', border: '1px solid rgba(211,47,47,0.30)' }
                              : { background: 'rgba(217,119,6,0.10)', color: '#B45309', border: '1px solid rgba(217,119,6,0.30)' }}
                          >
                            <TriangleAlert size={11} aria-hidden="true" />
                            {n} alto{n === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="mt-3 font-bold">{lineaTotal(tot, withItems.length)}</div>
                  {lineaPesaje && <div className="text-text-2">{lineaPesaje}</div>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
