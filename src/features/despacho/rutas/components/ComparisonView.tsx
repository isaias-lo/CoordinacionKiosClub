'use client';
import { dkm, formatCod } from '../utils/helpers';
import type { Ruta, StoreItem } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';

interface RutaConKm extends Ruta { kmEst: number; }

function estimarKmRuta(stores: StoreItem[], gps: Record<string, number[]>, cd: number[]): number {
  if (!stores.length) return 0;
  let km = 0, prev = cd;
  stores.forEach(t => {
    const g = gps[t.c];
    if (g) { km += dkm(prev, g); prev = g; }
  });
  if (stores.length && gps[stores[stores.length - 1].c]) {
    km += dkm(prev, cd);
  }
  return Math.round(km);
}

function getResumen(rutas: Ruta[], gps: Record<string, number[]>, cd: number[]) {
  const withKm: RutaConKm[] = rutas.map(r => ({
    ...r,
    kmEst: estimarKmRuta(r.ts, gps, cd),
  }));
  const totalKm = withKm.reduce((s, r) => s + r.kmEst, 0);
  const totalPct = withKm.reduce((s, r) => {
    const cap = r.v.c || 10;
    return s + (cap > 0 ? r.tp / cap : 0);
  }, 0);
  const avgPct = rutas.length ? Math.round((totalPct / rutas.length) * 100) : 0;
  const issues = withKm
    .filter(r => r.tp > r.v.c)
    .map(r => `${r.v.p} excede capacidad`);
  return { withKm, totalKm, avgPct, issues };
}

interface Props {
  data: {
    manual: Ruta[];
    optima: Ruta[];
    ts: StoreItem[];
    rebalanceada?: boolean;
  };
  gps: Record<string, number[]>;
  cd: number[];
  tiendas: Record<string, TiendaInfo>;
  onUsar: (rutas: Ruta[], ts: StoreItem[]) => void;
  onVolver: () => void;
}

export default function ComparisonView({ data, gps, cd, tiendas, onUsar, onVolver }: Props) {
  const { manual, optima, ts, rebalanceada } = data;

  const resManual = getResumen(manual, gps, cd);
  const resOptima = getResumen(optima, gps, cd);

  const kmDiff = resManual.totalKm - resOptima.totalKm;
  const manualEsMejor = kmDiff <= 0 && resManual.issues.length === 0;

  return (
    <div id="sec-comparison">
      <div className="mb-4">
        <button
          onClick={onVolver}
          className="flex items-center gap-1 text-[12px] text-kmuted hover:text-ktext transition-colors mb-3"
        >
          ← Volver a editar
        </button>
        <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-1">
          02 — Comparación de rutas
        </div>
        <div className="text-[24px] font-bold text-ktext tracking-tight mb-[3px]">
          ¿Cuál ruta usamos?
        </div>
        <div className="text-[13px] text-kmuted">
          Compara tu asignación manual con la sugerencia del sistema.
        </div>
        {rebalanceada && (
          <div className="mt-2 bg-blue-50 border border-blue-200 rounded-kios2 px-3 py-2 text-[12px] text-blue-700">
            ℹ️ Las tiendas que excedían la capacidad de un vehículo fueron redistribuidas automáticamente.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <SummaryCard
          title="Tu Ruta" icon="✋"
          rutas={resManual.withKm} totalKm={resManual.totalKm}
          avgPct={resManual.avgPct} issues={resManual.issues}
          highlighted={manualEsMejor}
          badge={
            manualEsMejor ? '✓ Más eficiente'
            : kmDiff > 0   ? `+${kmDiff} km más largo`
            : resManual.issues.length > 0 ? `${resManual.issues.length} problema(s)` : null
          }
          badgeColor={manualEsMejor ? 'green' : 'amber'}
        />
        <SummaryCard
          title="Ruta Óptima" icon="🤖"
          rutas={resOptima.withKm} totalKm={resOptima.totalKm}
          avgPct={resOptima.avgPct} issues={resOptima.issues}
          highlighted={!manualEsMejor}
          badge={
            !manualEsMejor
              ? kmDiff > 0 ? `Ahorra ~${kmDiff} km` : '✓ Igual de eficiente'
              : 'Alternativa del sistema'
          }
          badgeColor={!manualEsMejor ? 'green' : 'gray'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <RouteDetail rutas={resManual.withKm} tiendas={tiendas} title="Tu distribución" />
        <RouteDetail rutas={resOptima.withKm} tiendas={tiendas} title="Distribución óptima" />
      </div>

      {Math.abs(kmDiff) > 2 && (
        <div className="bg-kbg rounded-kios2 border border-black/[0.09] px-3 py-2.5 mb-4">
          <div className="text-[11px] font-bold text-ktext mb-1.5">Diferencia principal</div>
          {kmDiff > 0 ? (
            <p className="text-[12px] text-kmuted">
              Tu ruta recorre <span className="font-bold text-amber-600">~{kmDiff} km más</span> que la ruta óptima
              ({resManual.totalKm} vs {resOptima.totalKm} km estimados).
            </p>
          ) : (
            <p className="text-[12px] text-kmuted">
              Tu ruta es <span className="font-bold text-green-600">~{Math.abs(kmDiff)} km más corta</span> que la sugerencia del sistema.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => onUsar(manual, ts)}
          className={`h-[52px] rounded-kios2 text-[14px] font-bold transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-0.5
            ${manualEsMejor
              ? 'bg-kred text-white shadow-[0_4px_14px_rgba(212,43,43,0.3)]'
              : 'bg-white border-[2px] border-kred text-kred'}`}
        >
          <span>✋ Usar Mi Ruta</span>
          <span className="text-[10px] opacity-70 font-normal">{resManual.totalKm} km est. · {manual.length} vehículo{manual.length !== 1 ? 's' : ''}</span>
        </button>
        <button
          onClick={() => onUsar(optima, ts)}
          className={`h-[52px] rounded-kios2 text-[14px] font-bold transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-0.5
            ${!manualEsMejor
              ? 'bg-kred text-white shadow-[0_4px_14px_rgba(212,43,43,0.3)]'
              : 'bg-white border-[2px] border-kred text-kred'}`}
        >
          <span>🤖 Usar Ruta Óptima</span>
          <span className="text-[10px] opacity-70 font-normal">{resOptima.totalKm} km est. · {optima.length} vehículo{optima.length !== 1 ? 's' : ''}</span>
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ title, icon, rutas, totalKm, avgPct, issues, highlighted, badge, badgeColor }: {
  title: string; icon: string; rutas: RutaConKm[]; totalKm: number; avgPct: number;
  issues: string[]; highlighted: boolean; badge: string | null;
  badgeColor: 'green' | 'amber' | 'gray';
}) {
  const borderClass = highlighted ? 'border-kred' : 'border-black/[0.09]';
  const badgeClasses = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray:  'bg-gray-50 text-gray-500 border-gray-200',
  };

  return (
    <div className={`bg-white rounded-kios border-[1.5px] ${borderClass} overflow-hidden`}>
      <div className={`px-3 py-2 border-b ${highlighted ? 'border-kred/20 bg-kred/[0.03]' : 'border-black/[0.06]'}`}>
        <div className="text-[12px] font-bold text-ktext">{icon} {title}</div>
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        <Stat label="Km estimados" value={`~${totalKm} km`} bold />
        <Stat label="Vehículos" value={String(rutas.length)} />
        <Stat label="Uso promedio" value={`${avgPct}%`} />
        {issues.length > 0 && (
          <div className="text-[10px] text-red-600 font-semibold">⚠ {issues[0]}</div>
        )}
        {badge && (
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit ${badgeClasses[badgeColor]}`}>
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-kmuted">{label}</span>
      <span className={`text-[12px] ${bold ? 'font-bold text-ktext' : 'text-ktext'}`}>{value}</span>
    </div>
  );
}

function RouteDetail({ rutas, tiendas, title }: { rutas: RutaConKm[]; tiendas: Record<string, TiendaInfo>; title: string }) {
  return (
    <div className="bg-white rounded-kios border border-black/[0.09] overflow-hidden">
      <div className="px-3 py-2 border-b border-black/[0.06]">
        <span className="text-[11px] font-bold text-ktext">{title}</span>
      </div>
      <div className="divide-y divide-black/[0.05]">
        {rutas.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-kmuted italic">Sin rutas</div>
        )}
        {rutas.map((r, i) => {
          const pct = r.v.c > 0 ? Math.round((r.tp / r.v.c) * 100) : 0;
          const pctColor = pct > 100 ? 'text-red-500' : pct > 85 ? 'text-amber-500' : 'text-ktext';
          return (
            <div key={i} className="px-3 py-2">
              <div className="flex justify-between items-center mb-1">
                <span className="font-mono font-bold text-[11px] text-ktext">{r.v.p}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold ${pctColor}`}>{pct}%</span>
                  {r.kmEst > 0 && <span className="text-[10px] text-kmuted">~{r.kmEst}km</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {r.ts.map((t, j) => {
                  const inf = tiendas[t.c];
                  const isParada = t.c.startsWith('_P');
                  if (isParada) {
                    const stopLabel = t.c.replace(/^_/, '');
                    const isEntrega = inf?._tipo === 'entrega';
                    return (
                      <div key={t.c} className={`rounded-[4px] px-2 py-1 border text-[9px] max-w-[160px] ${isEntrega ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`font-mono font-bold text-[10px] ${isEntrega ? 'text-blue-700' : 'text-orange-700'}`}>{stopLabel}</span>
                          <span className={`text-[8px] font-bold px-1 rounded ${isEntrega ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>{isEntrega ? 'ENT' : 'RET'}</span>
                        </div>
                        {inf?.n && <div className="text-kmuted leading-tight truncate">{inf.n}</div>}
                      </div>
                    );
                  }
                  return (
                    <div key={t.c} className="bg-kbg border border-black/[0.08] rounded-[4px] px-2 py-1 max-w-[160px]">
                      <div className="font-mono font-bold text-[10px] text-kred">{j + 1}. {formatCod(t.c)}</div>
                      {inf?.n && <div className="text-[9px] text-ktext font-medium truncate">{inf.n}</div>}
                      {inf?.d && <div className="text-[9px] text-kmuted truncate">{inf.d}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
