'use client';
import { useEffect, useRef, useState, useMemo } from 'react';

interface CalData { on: boolean; p: number; b: number; c?: number; ch?: number; g?: string; }

interface Props {
  value: string;
  onChange: (v: string) => void;
  calT: Record<string, CalData>;
  modo: string;
}

type Grupo = 'rm' | 'costa' | 'fal';
const GRUPOS: { id: Grupo; label: string }[] = [
  { id: 'fal',   label: 'REGIONES' },
  { id: 'costa', label: 'COSTA' },
  { id: 'rm',    label: 'RM' },
];

/** Construye la línea "COD: 2P - 1B - 2CH" (omite los conteos en cero). */
function buildLine(cod: string, d: CalData): string {
  const parts: string[] = [];
  if (d.p)  parts.push(`${d.p}P`);
  if (d.b)  parts.push(`${d.b}B`);
  if (d.ch) parts.push(`${d.ch}CH`);
  return parts.length ? `${cod}: ${parts.join(' - ')}` : `${cod}:`;
}

export default function ManualMode({ value, onChange, calT, modo }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  // Filtro de grupos — multi-selección, por defecto los tres activos
  const [activeGroups, setActiveGroups] = useState<Set<Grupo>>(new Set(['rm', 'costa', 'fal']));
  const showAll = activeGroups.size === GRUPOS.length;

  const toggleGroup = (g: Grupo) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(g)) { if (next.size > 1) next.delete(g); } // siempre al menos uno
      else next.add(g);
      return next;
    });
  };

  // Tiendas visibles según filtro — calT ya viene ordenado (Regiones → Costa → RM)
  const visibleStores = useMemo(() => {
    return Object.keys(calT || {}).filter(cod => {
      const g = calT[cod]?.g as Grupo | undefined;
      if (showAll) return true;
      return g !== undefined && activeGroups.has(g);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calT, [...activeGroups].sort().join(',')]);

  // Generar el texto filtrado y empujarlo hacia arriba
  const groupsKey = [...activeGroups].sort().join(',');
  useEffect(() => {
    if (modo !== 'man') return;
    if (visibleStores.length === 0) return;
    const text = visibleStores.map(cod => buildLine(cod, calT[cod])).join('\n');
    if (value !== text) onChange(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calT, groupsKey, modo, visibleStores.length]);

  // Auto-resize a contenido
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Totales de las tiendas visibles
  const totals = useMemo(() => {
    return visibleStores.reduce(
      (acc, cod) => {
        const d = calT[cod];
        acc.p  += d?.p  || 0;
        acc.b  += d?.b  || 0;
        acc.ch += d?.ch || 0;
        return acc;
      },
      { p: 0, b: 0, ch: 0 }
    );
  }, [visibleStores, calT]);

  // En Manual, el TOTAL combina Bultos + Chocolates en un solo total de Bultos
  const totalBcombinado = totals.b + totals.ch;
  const totalParts = [
    totals.p        ? `${totals.p}P`        : '',
    totalBcombinado ? `${totalBcombinado}B` : '',
  ].filter(Boolean).join(' - ') || '0';

  const handleCopy = () => {
    const texto = `${value.trim()}\n\nTOTAL: ${totalParts}`;
    navigator.clipboard?.writeText(texto).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div>
      {/* ── Tabs de filtro RM / COSTA / REGIONES ── */}
      <div className="flex gap-2 mb-3">
        {GRUPOS.map(({ id, label }) => {
          const active = activeGroups.has(id);
          return (
            <button
              key={id}
              onClick={() => toggleGroup(id)}
              style={active ? { boxShadow: '0 2px 8px rgba(212,43,43,0.20)' } : undefined}
              className={`flex-1 h-[34px] rounded-[10px] text-[12px] font-extrabold tracking-wide transition-all border
                ${active
                  ? 'bg-kred text-white border-kred'
                  : 'bg-white border-black/[0.10] text-kmuted hover:border-kred/[0.3] hover:text-kred'}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={"LP: 3P - 2B\nMQH: 1P - 2B\nTRE: 5P"}
        rows={Math.max(6, (value.match(/\n/g) || []).length + 2)}
        className="w-full min-h-[160px] px-3 py-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 resize-none overflow-hidden text-[14px] font-mono text-ktext leading-[1.8] transition-colors focus:border-kred focus:outline-none"
      />

      {/* ── Botón copiar (para WhatsApp / Email) ── */}
      <button
        onClick={handleCopy}
        className="mt-3 w-full h-[40px] rounded-[12px] flex items-center justify-center gap-2 text-[13px] font-bold transition-all active:scale-[0.98]"
        style={copied
          ? { background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1.5px solid rgba(22,163,74,0.35)' }
          : { background: 'white', color: '#1B2A6B', border: '1.5px solid rgba(27,42,107,0.20)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
      >
        {copied ? '✓ Copiado al portapapeles' : '📋 Copiar todo (texto + total)'}
      </button>

      {/* ── Resumen de totales ── */}
      <div className="mt-2 flex items-center justify-between px-3.5 py-2.5 rounded-[12px] bg-knavy text-white"
        style={{ boxShadow: '0 2px 10px rgba(27,42,107,0.20)' }}>
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">Total</span>
        <span className="font-mono text-[15px] font-extrabold">{totalParts}</span>
      </div>

      <div className="text-[11px] text-kmuted mt-2 leading-relaxed space-y-0.5">
        <div>Una tienda por línea: <code className="font-mono bg-kbg px-1 py-px rounded text-kred">CÓDIGO  2P - 1B - 2CH</code></div>
        <div className="text-kmuted/70">
          Acepta: <code className="font-mono">LP 3P 2B</code> · <code className="font-mono">LP: 3P - 2B - 1CH</code>
        </div>
      </div>
    </div>
  );
}
