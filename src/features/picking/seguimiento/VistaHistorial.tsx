'use client';

// Historial del día en escritorio: impresiones, resumen por tienda y cambios de nombre.
// Diseño: /mnt/project-files/disenos/picking/Historial.dc.html.

import { useMemo } from 'react';
import type { PickerGroup, PrintRecord, PickerNameChange, PalletSlot } from '../picking-types';
import { fmtHoraChile } from '@/lib/fechaChile';
import { SelectorDia } from './controles';
import { aCsv, descargarCsv } from './actividad';
import { contar, contenidoDe, resumenHistorial, slotsPorClave, textoConteo } from './historial';

interface Props {
  records: PrintRecord[];
  nameChanges: PickerNameChange[];
  palletSlots: PalletSlot[];
  allGroups: PickerGroup[];
  dia: string;
  hoy: string;
  onDia: (d: string) => void;
  cargando: boolean;
  nombreTienda: (cod: string) => string;
  /** Imprime el resumen (la hoja que ya existía). */
  onImprimirResumen: () => void;
  /** Abre al encargado en Seco o Congelados, donde se reimprime. Solo para hoy. */
  onAbrir?: (stateKey: string, tipo: string) => void;
}

export function VistaHistorial({
  records, nameChanges, palletSlots, allGroups, dia, hoy, onDia, cargando, nombreTienda, onImprimirResumen, onAbrir,
}: Props) {
  const porClave = useMemo(() => slotsPorClave(palletSlots), [palletSlots]);
  const resumen = useMemo(() => resumenHistorial(records, porClave), [records, porClave]);
  const filas = useMemo(() => [...records]
    .sort((a, b) => new Date(b.printed_at).getTime() - new Date(a.printed_at).getTime())
    .map(r => {
      const slots = porClave[r.state_key] ?? [];
      const conteo = contar(slots);
      const contenido = contenidoDe(r.state_key, allGroups, slots).join(' · ');
      return {
        r, conteo, cod: r.state_key.split('__')[0],
        contenido: conteo.cajas > 0 ? [contenido, `${conteo.cajas} ${conteo.cajas === 1 ? 'caja' : 'cajas'}`].filter(Boolean).join(' · ') : contenido,
      };
    }), [records, porClave, allGroups]);
  const cambios = useMemo(() => [...nameChanges]
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()), [nameChanges]);
  const esHoy = dia === hoy;

  const exportar = () => descargarCsv(`historial-picking-${dia}.csv`, aCsv(
    ['Hora', 'Tienda', 'Código', 'Picker', 'Contenido', 'Batch', 'Pallets', 'Bultos', 'Cajas', 'Veces'],
    filas.map(({ r, conteo, cod, contenido }) => [
      fmtHoraChile(r.printed_at), nombreTienda(cod), cod, r.picker_label, contenido, r.batch ?? '',
      String(conteo.P), String(conteo.B), String(conteo.cajas), String(r.print_count ?? 1),
    ]),
  ));

  const etiquetas = resumen.etiquetas.P + resumen.etiquetas.B + resumen.etiquetas.cajas;

  return (
    <main className="pk-main pk-seguimiento" aria-label="Historial del día">
      <div className="pk-head">
        <div className="pk-hrow">
          <span className="pk-h1">Historial del día</span>
          <span style={{ marginLeft: 10 }}><SelectorDia dia={dia} hoy={hoy} onDia={onDia} /></span>
          <span className="pk-sp" />
          <button type="button" className="pk-btn" onClick={onImprimirResumen} disabled={records.length === 0}>Imprimir resumen</button>
          <button type="button" className="pk-btn" onClick={exportar} disabled={records.length === 0}>Exportar</button>
        </div>
        <div className="pk-kpis">
          <div className="pk-kpi"><span className="l">Impresiones</span><span className="v">{resumen.impresiones}</span></div>
          <div className="pk-kpi"><span className="l">Etiquetas</span>
            <span className="v">{etiquetas} {etiquetas > 0 && <small>{textoConteo(resumen.etiquetas)}</small>}</span></div>
          <div className="pk-kpi"><span className="l">Reimpresiones</span>
            <span className="v" style={resumen.reimpresiones > 0 ? { color: '#8A4A06' } : undefined}>{resumen.reimpresiones}</span></div>
          <div className="pk-kpi"><span className="l">Cambios de nombre</span><span className="v">{nameChanges.length}</span></div>
        </div>
      </div>

      <div className="pk-content">
        <div className="pk-dos hist">
          <div className="pk-card tabla">
            <div className="pk-card-t">Impresiones</div>
            {cargando && records.length === 0 ? (
              <div className="pk-vacio" style={{ margin: 14 }}><span>Cargando historial…</span></div>
            ) : records.length === 0 ? (
              <div className="pk-vacio" style={{ margin: 14 }}>
                <b>{esHoy ? 'Sin impresiones hoy' : 'Sin impresiones ese día'}</b>
                <span>Aparecen acá cuando se imprimen etiquetas.</span>
              </div>
            ) : (
              <table className="pk-tabla" aria-label="Impresiones">
                <thead>
                  <tr>
                    <th>HORA</th><th>TIENDA</th><th>PICKER</th><th>CONTENIDO</th><th>BATCH</th>
                    <th className="r">PALLETS</th><th className="r">BULTOS</th><th className="c">VECES</th>
                    {esHoy && onAbrir && <th><span className="sr-only">Abrir</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ r, conteo, cod, contenido }) => (
                    <tr key={r.state_key + r.printed_at}>
                      <td className="pk-mono">{fmtHoraChile(r.printed_at)}</td>
                      <td title={cod}>{nombreTienda(cod)}</td>
                      <td><b style={{ fontWeight: 600 }}>{r.picker_label}</b></td>
                      <td>{contenido || <span className="pk-sub">—</span>}</td>
                      <td className="pk-mono pk-sub">{r.batch || '—'}</td>
                      <td className="pk-n">{conteo.P}</td>
                      <td className="pk-n">{conteo.B}</td>
                      <td className="c">{(r.print_count ?? 1) > 1 ? <span className="pk-pill warn">×{r.print_count}</span> : 1}</td>
                      {esHoy && onAbrir && (
                        <td className="r">
                          <button type="button" className="pk-btn" style={{ padding: '4px 9px' }}
                            title="Abre al encargado, donde se reimprimen sus etiquetas"
                            onClick={() => onAbrir(r.state_key, r.tipo)}>Reimprimir</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr className="tot">
                    <td>Total</td><td /><td /><td /><td />
                    <td className="pk-n">{resumen.etiquetas.P}</td>
                    <td className="pk-n">{resumen.etiquetas.B}</td>
                    <td />
                    {esHoy && onAbrir && <td />}
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="pk-col">
            <div className="pk-card">
              <div className="pk-card-t">Resumen por tienda</div>
              {resumen.porTienda.length === 0 ? (
                <div className="pk-sub" style={{ padding: '12px 14px' }}>Sin tiendas impresas.</div>
              ) : (
                <table className="pk-tabla" aria-label="Resumen por tienda">
                  <tbody>
                    {resumen.porTienda.map(t => (
                      <tr key={t.cod}>
                        <td title={t.cod}>{nombreTienda(t.cod)}</td>
                        <td className="pk-n">{textoConteo(t.conteo) || '—'}</td>
                        <td className="pk-n">{t.impresiones} impr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pk-card">
              <div className="pk-card-t">Cambios de nombre</div>
              {cambios.length === 0 ? (
                <div className="pk-sub" style={{ padding: '12px 14px' }}>Nadie cambió nombres {esHoy ? 'hoy' : 'ese día'}.</div>
              ) : (
                <table className="pk-tabla" aria-label="Cambios de nombre">
                  <tbody>
                    {cambios.map(c => (
                      <tr key={c.id}>
                        <td className="pk-mono" style={{ verticalAlign: 'top' }}>{fmtHoraChile(c.changed_at)}</td>
                        <td>
                          <span className="pk-sub">{c.old_name || c.picker_key}</span> → <b style={{ fontWeight: 600 }}>{c.new_name || '—'}</b>
                          {c.changed_by_name && <div className="pk-sub">por {c.changed_by_name}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
