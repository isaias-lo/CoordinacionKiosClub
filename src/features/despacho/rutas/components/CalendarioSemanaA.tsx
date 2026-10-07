'use client';

// [Vista nueva · Calendario] El calendario como lo dibuja el diseño A: a la izquierda los días con
// cuántas tiendas recibe cada uno, al centro las tiendas del día elegido por grupo, y a la derecha
// la semana en barras. Solo lectura, igual que el calendario de la vista clásica dentro del
// Enrutador: se edita en Control interno.

import { semanaCalendario, textoGrupoVacio, notaDiasVacios, GRUPOS_CAL, type CalSemana } from '../utils/semanaCalendario';

const ACENTO = '#B45309';

export default function CalendarioSemanaA({
  cal, dia, onDia, fuente, nombre,
}: {
  cal: CalSemana;
  dia: string;
  onDia: (dia: string) => void;
  fuente: 'despacho' | 'armado' | 'congelados';
  nombre: (cod: string) => string;
}) {
  const semana = semanaCalendario(cal);
  const elegido = semana.find(d => d.dia === dia) ?? semana[0];
  const carga = fuente === 'congelados' ? 'congelados' : 'seco';
  const max = Math.max(1, ...semana.map(d => d.total));
  const nota = notaDiasVacios(semana);
  const delDia = cal[elegido.dia];

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_360px] items-start">
      <aside className="bg-white border border-black/[0.09] rounded-[16px] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-black/[0.07] text-cuerpo font-bold text-ktext">Elige un día</div>
        <div className="flex lg:flex-col overflow-x-auto">
          {semana.map(d => {
            const sel = d.dia === elegido.dia;
            return (
              <button key={d.dia} type="button" onClick={() => onDia(d.dia)} aria-pressed={sel}
                className="flex items-center gap-3 px-4 py-3 min-h-[48px] flex-shrink-0 text-left border-b border-black/[0.05] lg:border-r-0 border-r"
                style={sel ? { background: '#FFF8EE', boxShadow: `inset 4px 0 0 ${ACENTO}` } : { background: '#FFFFFF' }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: sel ? ACENTO : '#D5D9E3' }} />
                <span className="flex-1 text-cuerpo font-semibold text-ktext whitespace-nowrap">{d.nombre}</span>
                <span className={`text-apoyo whitespace-nowrap ${d.total ? 'text-kmuted' : 'text-black/30'}`}>
                  {d.total} {d.total === 1 ? 'tienda' : 'tiendas'}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="bg-white border border-black/[0.09] rounded-[16px] overflow-hidden">
        <div className="px-4 py-3 border-b border-black/[0.07] flex items-baseline gap-3">
          <span className="text-cuerpo font-bold text-ktext flex-1">{elegido.nombre} · {carga}</span>
          <span className="text-apoyo text-kmuted">{elegido.total} {elegido.total === 1 ? 'tienda' : 'tiendas'}</span>
        </div>
        {GRUPOS_CAL.map(g => {
          const cods = delDia?.[g.id] ?? [];
          return (
            <div key={g.id} className="px-4 py-3 border-b border-black/[0.05] last:border-b-0 flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-rotulo font-bold uppercase text-black/60">{g.rotulo}</span>
                <span className="text-rotulo text-kmuted">{cods.length}</span>
              </div>
              {cods.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {cods.map(c => (
                    <span key={c} title={c} className="rounded-[8px] px-2.5 py-1 text-apoyo font-semibold"
                      style={{ border: '1px solid #E8D3B5', background: '#FFF8EE', color: '#3F2A0C' }}>
                      {nombre(c)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-apoyo text-kmuted">{textoGrupoVacio(g.id, elegido.dia)}</span>
              )}
            </div>
          );
        })}
      </section>

      <section className="bg-white border border-black/[0.09] rounded-[16px] p-4 flex flex-col gap-3.5 lg:col-span-2 xl:col-span-1">
        <span className="text-cuerpo font-bold text-ktext">La semana de un vistazo</span>
        <div className="flex gap-3.5 text-rotulo tracking-normal text-black/70">
          {GRUPOS_CAL.map(g => (
            <span key={g.id} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: g.color }} />{g.id === 'rm' ? 'RM' : g.rotulo}
            </span>
          ))}
        </div>
        {semana.map(d => {
          const sel = d.dia === elegido.dia;
          return (
            <button key={d.dia} type="button" onClick={() => onDia(d.dia)} aria-label={`${d.nombre}: ${d.total} tiendas`}
              className="grid grid-cols-[30px_minmax(0,1fr)_30px] gap-2.5 items-center text-left">
              <span className={`text-apoyo ${sel ? 'font-extrabold' : 'font-semibold text-kmuted'}`} style={sel ? { color: ACENTO } : undefined}>{d.dia}</span>
              <span className="flex h-[22px] rounded-[6px] overflow-hidden" style={{ background: '#F1F2F6' }}>
                {GRUPOS_CAL.map(g => (
                  <span key={g.id} style={{ width: `${(d[g.id] / max) * 100}%`, background: g.color }} />
                ))}
              </span>
              <span className="font-mono text-apoyo text-right text-ktext">{d.total}</span>
            </button>
          );
        })}
        {nota && (
          <div className="rounded-[12px] p-3 text-apoyo" style={{ background: '#FFF8EE', border: '1px solid #E8D3B5', color: '#3F2A0C' }}>
            {nota}
          </div>
        )}
      </section>
    </div>
  );
}
