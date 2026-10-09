'use client';

// Calendario de picking en escritorio: qué días se pickea cada tienda, en una tabla.
// Diseño: /mnt/project-files/disenos/picking/Calendario.dc.html. Es de solo lectura, como era en
// Picking: el calendario lo arma Control interno y lo comparte con el Enrutador.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCalendarioCompleto, subscribeToCalendarChanges } from '@/features/despacho/utils/useCalendario';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados } from '@/lib/calendarioCongeladosSync';
import {
  DIAS, NOMBRE_DIA, NOMBRE_GRUPO, diaDe, filasCalendario, tiendasDelDia, textoPorGrupo, usaDomingo,
  type CalRecord, type Grupo,
} from './calendario';

export type FuenteCalendario = 'despacho' | 'congelados';

interface Props {
  fuente: FuenteCalendario;
  onFuente: (f: FuenteCalendario) => void;
  nombreTienda: (cod: string) => string;
  /** Elige las tiendas del día en Seco o Congelados. */
  onUsarHoy: (codigos: string[], fuente: FuenteCalendario) => void;
  /** La vista por días de siempre (CalendarioColumnas). */
  vistaPorDia: ReactNode;
}

export function VistaCalendario({ fuente, onFuente, nombreTienda, onUsarHoy, vistaPorDia }: Props) {
  const [cal, setCal] = useState<CalRecord | null>(null);
  const [error, setError] = useState(false);
  const [grupo, setGrupo] = useState<Grupo>('rm');
  const [q, setQ] = useState('');
  const [porDia, setPorDia] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCal(null); setError(false);
    const cargar = fuente === 'congelados' ? fetchCalendarioCongelados() : fetchCalendarioCompleto();
    cargar.then(c => { if (vivo) setCal(c); }).catch(() => { if (vivo) setError(true); });
    const quitar = fuente === 'congelados'
      ? subscribeToCalendarioCongelados(c => { if (vivo) setCal(c); })
      : subscribeToCalendarChanges(c => { if (vivo) setCal(c); });
    return () => { vivo = false; quitar(); };
  }, [fuente]);

  const hoy = diaDe(new Date());
  const dias = useMemo(() => (cal && usaDomingo(cal) ? DIAS : DIAS.slice(0, 6)), [cal]);
  const deHoy = useMemo(() => (cal ? tiendasDelDia(cal, hoy) : null), [cal, hoy]);
  const filas = useMemo(() => {
    if (!cal) return [];
    const t = q.trim().toLowerCase();
    return filasCalendario(cal, grupo)
      .map(f => ({ ...f, nombre: nombreTienda(f.cod) }))
      .filter(f => !t || f.cod.toLowerCase().includes(t) || f.nombre.toLowerCase().includes(t))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [cal, grupo, q, nombreTienda]);
  const usar = () => { if (deHoy?.codigos.length) onUsarHoy(deHoy.codigos, fuente); };
  const destino = fuente === 'congelados' ? 'Congelados' : 'Seco';

  return (
    <main className="pk-main pk-seguimiento" aria-label="Calendario de picking">
      <div className="pk-head">
        <div className="pk-hrow">
          <span className="pk-h1">Calendario de picking</span>
          <span className="pk-seg" role="group" aria-label="Calendario" style={{ marginLeft: 10 }}>
            {([['despacho', 'Seco'], ['congelados', 'Congelados']] as const).map(([k, l]) => (
              <button key={k} type="button" className={fuente === k ? 'on' : ''} aria-pressed={fuente === k} onClick={() => onFuente(k)}>{l}</button>
            ))}
          </span>
          <span className="pk-sp" />
          {!porDia && (
            <span className="pk-field" style={{ width: 220 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tienda…" aria-label="Buscar tienda" />
            </span>
          )}
          <button type="button" className="pk-btn" onClick={() => setPorDia(v => !v)}>{porDia ? 'Ver como tabla' : 'Ver por día'}</button>
          <button type="button" className="pk-btn pri" onClick={usar} disabled={!deHoy?.codigos.length}>Usar tiendas de hoy</button>
        </div>
        {!porDia && (
          <span className="pk-seg" role="group" aria-label="Zona" style={{ alignSelf: 'flex-start' }}>
            {(['rm', 'costa', 'fal'] as const).map(g => (
              <button key={g} type="button" className={grupo === g ? 'on' : ''} aria-pressed={grupo === g} onClick={() => setGrupo(g)}>{NOMBRE_GRUPO[g]}</button>
            ))}
          </span>
        )}
      </div>

      <div className="pk-content">
        {porDia ? vistaPorDia : (
          <div className="pk-cal">
            <div className="pk-card tabla">
              {error ? (
                <div className="pk-vacio" style={{ margin: 14 }}><b>No se pudo leer el calendario</b><span>Revisa la conexión y vuelve a abrir esta pestaña.</span></div>
              ) : !cal ? (
                <div className="pk-vacio" style={{ margin: 14 }}><span>Cargando calendario…</span></div>
              ) : filas.length === 0 ? (
                <div className="pk-vacio" style={{ margin: 14 }}>
                  <b>{q ? 'Ninguna tienda con esa búsqueda' : `Sin tiendas de ${NOMBRE_GRUPO[grupo]} en este calendario`}</b>
                </div>
              ) : (
                <table className="pk-tabla" aria-label={`Calendario ${destino}, ${NOMBRE_GRUPO[grupo]}`}>
                  <thead>
                    <tr>
                      <th>TIENDA</th>
                      {dias.map(d => (
                        <th key={d} className={`d${d === hoy ? ' hoy' : ''}`}>{d}{d === hoy ? ' · hoy' : ''}</th>
                      ))}
                      <th className="r" style={{ textAlign: 'right' }}>VECES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.cod}>
                        <td className="t"><span className="c pk-mono pk-sub">{f.cod}</span>{f.nombre}</td>
                        {dias.map(d => (
                          <td key={d} className={`d${d === hoy ? ' hoy' : ''}`}>
                            <span className={`pk-cuadro${f.dias.has(d) ? ' si' : ''}`}
                              role="img" aria-label={`${NOMBRE_DIA[d]}: ${f.dias.has(d) ? 'sí' : 'no'}`} />
                          </td>
                        ))}
                        <td className="pk-n pk-sub" style={{ padding: '6px 12px' }}>{f.veces}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pk-lado">
              <div className="pk-card">
                <span className="pk-ttl">Hoy, {NOMBRE_DIA[hoy]}</span>
                <span className="grande">{deHoy ? `${deHoy.codigos.length} ${deHoy.codigos.length === 1 ? 'tienda' : 'tiendas'}` : '—'}</span>
                {deHoy && deHoy.codigos.length > 0 && <span className="pk-sub">{textoPorGrupo(deHoy.porGrupo)}</span>}
                <button type="button" className="pk-btn pri" style={{ marginTop: 6 }} onClick={usar} disabled={!deHoy?.codigos.length}>
                  Cargarlas en {destino}
                </button>
              </div>
              <div className="pk-card">
                <span className="pk-ttl">De dónde sale</span>
                <span className="pk-sub">
                  Lo arma Control interno y es el mismo que ve el Enrutador. Acá se mira; los cambios se hacen en el calendario de Control interno.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
