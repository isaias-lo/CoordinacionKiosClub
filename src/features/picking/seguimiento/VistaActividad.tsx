'use client';

// Actividad en escritorio: tabla de todo lo que pasó en picking, de quién y cuándo.
// Diseño: /mnt/project-files/disenos/picking/Actividad.dc.html.

import { useMemo, useState } from 'react';
import type { SupervisorPresence } from '../picking-types';
import { detectarReincidencia } from '../picking-utils';
import { fmtHoraChile } from '@/lib/fechaChile';
import type { ActivityData } from './cargarDia';
import { SelectorDia, Desplegable } from './controles';
import {
  filasActividad, pasaFiltros, opciones, aCsv, descargarCsv,
  NOMBRE_ACCION, TONO_ACCION, SIN_FILTROS, type Filtros, type FiltroAccion,
} from './actividad';

const POR_PAGINA = 50;

const ACCIONES: { key: FiltroAccion; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'creo', label: 'Creó' },
  { key: 'elimino', label: 'Eliminó' },
  { key: 'imprimio', label: 'Imprimió' },
  { key: 'renombro', label: 'Renombró' },
];

interface Props {
  datos: ActivityData & { supervisors: Record<string, SupervisorPresence> };
  dia: string;
  hoy: string;
  onDia: (d: string) => void;
  cargando: boolean;
  nombreTienda: (cod: string) => string;
}

export function VistaActividad({ datos, dia, hoy, onDia, cargando, nombreTienda }: Props) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const filtrar = (f: Partial<Filtros>) => { setFiltros(prev => ({ ...prev, ...f })); setVisibles(POR_PAGINA); };
  const cambiarDia = (d: string) => { setFiltros(SIN_FILTROS); setVisibles(POR_PAGINA); onDia(d); };

  const filas = useMemo(() => filasActividad(datos), [datos]);
  const filtradas = useMemo(() => filas.filter(f => pasaFiltros(f, filtros)), [filas, filtros]);
  const reincidentes = useMemo(
    () => Object.entries(detectarReincidencia(datos.eventos).porSupervisor).sort((a, b) => b[1] - a[1]),
    [datos.eventos],
  );
  const errores = filas.filter(f => f.error).length;

  const exportar = () => descargarCsv(`actividad-picking-${dia}.csv`, aCsv(
    ['Hora', 'Quién', 'Acción', 'Tienda', 'Detalle', 'Batch', 'Veces'],
    filtradas.map(f => [
      fmtHoraChile(f.at), f.quien, NOMBRE_ACCION[f.accion], f.tienda ? nombreTienda(f.tienda) : '',
      f.detalle, f.batch ?? '', f.veces != null ? String(f.veces) : '',
    ]),
  ));

  return (
    <main className="pk-main pk-seguimiento" aria-label="Actividad">
      <div className="pk-head">
        <div className="pk-hrow">
          <span className="pk-h1">Actividad</span>
          <span className="pk-sub" style={{ marginLeft: 6 }}>Todo lo que pasó en picking, de quién y cuándo</span>
          <span className="pk-sp" />
          <button type="button" className="pk-btn" onClick={exportar} disabled={filtradas.length === 0}>Exportar</button>
        </div>
        <div className="pk-hrow">
          <SelectorDia dia={dia} hoy={hoy} onDia={cambiarDia} />
          <Desplegable etiqueta="Tienda" todos="todas" valor={filtros.tienda} opciones={opciones(filas, 'tienda')}
            nombre={c => `${nombreTienda(c)} · ${c}`} onCambio={v => filtrar({ tienda: v })} />
          <Desplegable etiqueta="Picker" todos="todos" valor={filtros.picker} opciones={opciones(filas, 'picker')}
            onCambio={v => filtrar({ picker: v })} />
          <Desplegable etiqueta="Quién" todos="todos" valor={filtros.quien} opciones={opciones(filas, 'quien')}
            onCambio={v => filtrar({ quien: v })} />
          <span className="pk-seg" role="group" aria-label="Acción">
            {ACCIONES.map(a => (
              <button key={a.key} type="button" className={filtros.accion === a.key ? 'on' : ''}
                aria-pressed={filtros.accion === a.key} onClick={() => filtrar({ accion: a.key })}>{a.label}</button>
            ))}
            {errores > 0 && (
              <button type="button" className={filtros.accion === 'errores' ? 'on' : ''} aria-pressed={filtros.accion === 'errores'}
                onClick={() => filtrar({ accion: 'errores' })} style={{ color: filtros.accion === 'errores' ? undefined : '#A3271A' }}>
                Posibles errores {errores}
              </button>
            )}
          </span>
          <span className="pk-sp" />
          <span className="pk-sub">
            {cargando ? 'Cargando…' : `Mostrando ${Math.min(visibles, filtradas.length)} de ${filtradas.length}`}
          </span>
        </div>
      </div>

      <div className="pk-content">
        {reincidentes.length > 0 && (
          <div className="pk-alert" role="status">
            <span>
              <b>Creó y borró el mismo pallet:</b>{' '}
              {reincidentes.map(([n, k]) => `${n} (${k} ${k === 1 ? 'vez' : 'veces'})`).join(', ')}.
              {' '}Pueden ser errores; revísalos con «Posibles errores».
            </span>
          </div>
        )}

        {cargando && filas.length === 0 ? (
          <div className="pk-vacio"><span>Cargando actividad…</span></div>
        ) : filtradas.length === 0 ? (
          <div className="pk-vacio">
            <b>{filas.length > 0 ? 'Nada con estos filtros' : 'Sin actividad registrada'}</b>
            {filas.length > 0 && (
              <button type="button" className="pk-btn" onClick={() => filtrar(SIN_FILTROS)}>Quitar filtros</button>
            )}
          </div>
        ) : (
          <div className="pk-card tabla">
            <table className="pk-tabla" aria-label="Actividad del día">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>HORA</th>
                  <th style={{ width: 160 }}>QUIÉN</th>
                  <th style={{ width: 130 }}>ACCIÓN</th>
                  <th style={{ width: 170 }}>TIENDA</th>
                  <th>DETALLE</th>
                </tr>
              </thead>
              <tbody aria-live="polite" aria-relevant="additions">
                {filtradas.slice(0, visibles).map(f => (
                  <tr key={f.id} className={f.error ? 'conf' : undefined}>
                    <td className="pk-mono">{fmtHoraChile(f.at)}</td>
                    <td>{f.quien}</td>
                    <td><span className={`pk-pill ${TONO_ACCION[f.accion]}`}>{NOMBRE_ACCION[f.accion]}</span></td>
                    <td title={f.tienda ?? undefined}>{f.tienda ? nombreTienda(f.tienda) : '—'}</td>
                    <td>
                      {f.detalle}
                      {f.batch && <span className="pk-mono pk-sub" style={{ marginLeft: 8 }}>{f.batch}</span>}
                      {(f.veces ?? 1) > 1 && <span className="pk-pill warn" style={{ marginLeft: 8 }}>×{f.veces}</span>}
                      {f.error && <span className="pk-pill bad" style={{ marginLeft: 8 }}>Posible error</span>}
                      {f.enVivo && <span className="pk-sub" style={{ marginLeft: 8 }}>en vivo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtradas.length > visibles && (
          <div className="pk-mas">
            <button type="button" className="pk-btn" onClick={() => setVisibles(v => v + POR_PAGINA)}>Cargar más</button>
          </div>
        )}
        {dia !== hoy && <span className="pk-sub">Día anterior: lo que quedó guardado ese día.</span>}
      </div>
    </main>
  );
}
