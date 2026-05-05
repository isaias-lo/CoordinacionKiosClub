'use client';
import { dkm } from '../utils/helpers';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';

interface Props {
  ruta: Ruta;
  index: number;
  tiendas: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }>;
  gps: Record<string, number[]>;
  cd: number[];
  conductores: string[];
  onChoferChange: (idx: number, nombre: string) => void;
  kmReal?: number;
  legData?: {dist: string; dur: string}[];
}

export default function RouteCard({ ruta, index, tiendas, gps, cd, conductores, onChoferChange, kmReal, legData }: Props) {
  const r    = ruta;
  const pct  = Math.min((r.tp / r.v.c) * 100, 120);
  const over = pct > 100;
  const cls  = pct > 100 ? 'bg-gradient-to-r from-[#FF3B30] to-[#FF6B6B]'
             : pct > 80  ? 'bg-gradient-to-r from-[#FF9500] to-[#FFCC00]'
             :              'bg-gradient-to-r from-[#34C759] to-[#30D158]';
  const vuelta = r.v.tlbd ? '2' : '1';
  const km     = kmReal !== undefined ? kmReal : (() => {
    let k = 0, prev = cd;
    r.ts.forEach(t => { const g = gps[t.c]; if (g) { k += dkm(prev, g); prev = g; } });
    return k;
  })();

  return (
    <div className="rc bg-white rounded-kios shadow-kios overflow-hidden mb-[11px]">
      <div className="px-4 py-3 border-b border-black/[0.09] flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[15px] font-bold text-ktext">{r.v.p}</span>
        <span className={`vbdg h-[23px] px-[9px] rounded-[6px] font-mono text-[10px] font-bold flex items-center ${vuelta==='1'?'v1 bg-knavy/[0.1] text-knavy border border-knavy/[0.18]':'v2 bg-kred/[0.09] text-kred border border-kred/[0.18]'}`}>
          {vuelta}a VUELTA
        </span>
        {r.v.porton === true  && <span className="text-[9px] font-semibold text-[#34C759] bg-[#EAF7EE] border border-[#34C759] rounded px-1.5 py-px">Portón</span>}
        {r.v.porton === false && <span className="text-[9px] text-kmuted bg-kbg border border-[#E5E5EA] rounded px-1.5 py-px">Sin portón</span>}
        {r.v.refrigerado      && <span className="text-[9px] font-semibold text-[#5856D6] bg-[#EBEAFC] border border-[#5856D6] rounded px-1.5 py-px">Frío</span>}
      </div>

      <div className="px-4 py-2.5 border-b border-black/[0.09] flex items-center gap-2.5">
        <span className="text-[11px] font-semibold text-kmuted uppercase tracking-[0.5px] whitespace-nowrap">🚛 Conductor</span>
        <select
          value={r._choferAsignado !== undefined ? r._choferAsignado : r.v.ch}
          onChange={e => onChoferChange(index, e.target.value)}
          className={`flex-1 h-[34px] px-2.5 rounded-[8px] border-[1.5px] bg-kbg text-[13px] font-sans text-ktext cursor-pointer transition-colors focus:outline-none
            ${(r._choferAsignado || r.v.ch) ? 'border-knavy bg-knavy/[0.04] text-knavy font-semibold' : 'border-black/[0.09]'}`}
        >
          <option value="">— Seleccionar conductor —</option>
          {conductores.map(nombre => (
            <option key={nombre} value={nombre}>{nombre}</option>
          ))}
        </select>
      </div>

      <div className="px-4 py-[11px] border-b border-black/[0.09] flex gap-3.5 items-center">
        <div><div className="text-[17px] font-extrabold text-kred">{r.tp}</div><div className="text-[11px] text-kmuted">pallets</div></div>
        <div className="text-black/[0.09] text-[16px]">·</div>
        <div><div className="text-[17px] font-extrabold text-korange">{r.tb}</div><div className="text-[11px] text-kmuted">bultos</div></div>
        <div className="text-black/[0.09] text-[16px]">·</div>
        <div><div className="text-[17px] font-extrabold text-ktext">{r.ts.length}</div><div className="text-[11px] text-kmuted">tiendas</div></div>
        <div className="text-black/[0.09] text-[16px]">·</div>
        <div>
          <div className="text-[13px] font-extrabold text-ktext">{typeof km === 'number' ? km.toFixed(1) : '?'}</div>
          <div className="text-[11px] text-kmuted">{kmReal !== undefined ? 'km reales' : 'km aprox'}</div>
        </div>
      </div>

      <div className="px-4 py-[9px] border-b border-black/[0.09]">
        <div className="flex justify-between text-[11px] text-kmuted mb-1">
          <span>Ocupación</span>
          {over
            ? <span className="text-[#ff3b30] font-bold">⚠️ SOBRE CAPACIDAD</span>
            : <span className="font-bold">{r.tp}/{r.v.c}P ({Math.round(pct)}%)</span>
          }
        </div>
        <div className="h-[5px] bg-kbg rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${cls}`} style={{width: `${Math.min(pct,100)}%`}} />
        </div>
      </div>

      {r.ts.map((t, i) => {
        const g    = gps[t.c];
        const prev = i === 0 ? cd : gps[r.ts[i-1].c] || cd;
        const dist = g ? dkm(prev, g).toFixed(1) : '?';
        const inf  = tiendas[t.c];
        const leg  = legData ? legData[i] : null;
        const isParada = inf?._parada;

        if (isParada) {
          const isEntrega = inf._tipo === 'entrega';
          return (
            <div key={t.c} className={`si px-4 py-[11px] border-b border-black/[0.09] last:border-b-0 flex items-start gap-[11px]
              ${isEntrega ? 'bg-blue-50/40' : 'bg-orange-50/40'}`}>
              <div className={`min-w-[24px] h-[24px] rounded-full font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5
                ${isEntrega ? 'bg-blue-100 text-blue-600 border border-blue-200' : 'bg-orange-100 text-orange-600 border border-orange-200'}`}>
                {isEntrega ? '↓' : '↑'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-[7px] flex-wrap">
                  <span className={`text-[11px] font-bold px-2 py-px rounded border
                    ${isEntrega ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                    {isEntrega ? 'ENTREGA' : 'RETIRO'}
                  </span>
                  {(t.p > 0 || t.b > 0) && (
                    <div className="ml-auto font-mono text-[11px] font-bold text-kmuted">
                      {t.p > 0 && `${t.p}P`}{t.p > 0 && t.b > 0 && ' '}{t.b > 0 && <span className="text-korange">+{t.b}B</span>}
                    </div>
                  )}
                </div>
                <div className="text-[13px] font-semibold text-ktext mt-0.5 leading-snug">{inf.n}</div>
                {inf._desc && <div className="text-[11px] text-kmuted mt-px">{inf._desc}</div>}
                <div className={`sdst text-[11px] mt-1 ${leg ? 'text-[#34C759]' : 'text-kmuted'}`}>
                  {leg ? `📍 ${leg.dist} · ⏳ ${leg.dur} desde punto anterior` : `📍 ~${dist}km del punto anterior`}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={t.c} className="si px-4 py-[11px] border-b border-black/[0.09] last:border-b-0 flex items-start gap-[11px]">
            <div className="min-w-[24px] h-[24px] rounded-full bg-kbg border-[1.5px] border-black/[0.09] font-mono text-[10px] font-bold text-kmuted flex items-center justify-center flex-shrink-0 mt-0.5">
              {String(i+1).padStart(2,'0')}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-[7px] flex-wrap">
                <span className="scod font-mono text-[14px] font-extrabold text-kred">{t.c}</span>
                <span className="szon text-[10px] font-semibold text-knavy bg-knavy/[0.08] border border-knavy/[0.12] rounded px-1.5 py-px">
                  {inf ? inf.z : ''}
                </span>
                <div className="ml-auto font-mono text-[11px] font-bold text-kred">
                  {t.p}P{t.b ? <span className="text-korange"> +{t.b}B</span> : null}
                </div>
              </div>
              <div className="text-[12px] text-ktext2 mt-0.5">{inf ? inf.n : ''}</div>
              <div className={`sdst text-[11px] mt-px ${leg ? 'text-[#34C759]' : 'text-kmuted'}`}>
                {leg
                  ? `📍 ${leg.dist} · ⏳ ${leg.dur} desde punto anterior`
                  : `📍 ~${dist}km del punto anterior${inf?.v ? ' · ' + inf.v : ''}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
