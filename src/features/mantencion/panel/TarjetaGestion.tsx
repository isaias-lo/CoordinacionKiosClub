'use client';

import { useState } from 'react';
import { comentar, decidir } from '../apiCliente';
import { haceCuanto, preguntasSinResponder } from '../utils/conversacion';
import { tituloDeSolicitud } from '../utils/formulario';
import { esTrabajoAbierto } from '../utils/tablero';
import { URGENCIAS, type SolicitudMant, type Urgencia } from '../tipos';
import { Insignia, Tarjeta, estiloCampo } from '../ui';
import type { Tono } from '../utils/conversacion';

const URGENCIA: Record<Urgencia, { texto: string; tono: Tono }> = {
  leve:    { texto: 'Leve',    tono: 'verde' },
  media:   { texto: 'Media',   tono: 'ambar' },
  urgente: { texto: 'Urgente', tono: 'rojo' },
};

/**
 * Una solicitud vista por Mantención, con lo que puede decidir sobre ella: urgencia, pregunta a la
 * tienda, nota para el técnico y descartar. Se usa en «Por revisar» y en el detalle de tienda.
 */
export function TarjetaGestion(
  { s, alCambiar, abiertaDeEntrada = false }:
  { s: SolicitudMant; alCambiar: () => void; abiertaDeEntrada?: boolean },
) {
  const [abierta, setAbierta] = useState(abiertaDeEntrada);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activa = esTrabajoAbierto(s);
  const esperaRespuesta = preguntasSinResponder(s.comentarios).length > 0;

  /** Devuelve si se guardó: el campo de texto solo se vacía si el envío salió. */
  const hacer = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setOcupado(true);
    setError(null);
    try { await fn(); alCambiar(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); return false; }
    finally { setOcupado(false); }
  };

  return (
    <Tarjeta>
      <button type="button" onClick={() => setAbierta(a => !a)} aria-expanded={abierta} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
              {s.nombreTienda} · {s.categoria ?? 'Sin categoría'} · {haceCuanto(s.creadaEn)}
              {s.origen === 'whatsapp' ? ' · por WhatsApp' : ''}
            </p>
            <p className="mt-0.5 font-semibold">{tituloDeSolicitud(s.descripcion)}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {s.duplicadaDe ? <Insignia tono="gris">Unida a otra</Insignia>
              : s.estado === 'descartada' ? <Insignia tono="gris">Descartada</Insignia>
              : s.urgencia ? <Insignia tono={URGENCIA[s.urgencia].tono}>{URGENCIA[s.urgencia].texto}</Insignia>
              : <Insignia tono="neutro">Sin clasificar</Insignia>}
            {esperaRespuesta && <Insignia tono="azul">Esperando a la tienda</Insignia>}
          </div>
        </div>
      </button>

      {abierta && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-sub)' }}>Dice la tienda</p>
            <p className="mt-1 whitespace-pre-line text-sm">{s.descripcion}</p>
            {s.creadaPorNombre && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-sub)' }}>— {s.creadaPorNombre}</p>
            )}
          </div>

          {s.fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {s.fotos.map((f, i) => f.url ? (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${i + 1} de ${tituloDeSolicitud(s.descripcion, 40)}`} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <div key={f.id} className="flex aspect-square items-center justify-center rounded-lg text-xs"
                  style={{ background: 'var(--color-bg-2)', color: 'var(--color-text-sub)' }}>Foto no disponible</div>
              ))}
            </div>
          )}

          {s.comentarios.length > 0 && (
            <ul className="space-y-1 text-sm">
              {s.comentarios.map(c => (
                <li key={c.id}>
                  <span className="font-semibold">
                    {c.tipo === 'pregunta' ? 'Pregunta de Mantención' : c.tipo === 'respuesta' ? 'Respuesta de la tienda' : 'Nota para el técnico'}:
                  </span>{' '}{c.texto}
                  <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}> · {haceCuanto(c.creadoEn)}</span>
                </li>
              ))}
            </ul>
          )}

          {activa && (
            <>
              <div>
                <p className="text-sm font-semibold">{s.urgencia ? 'Urgencia' : 'Clasifica la urgencia'}</p>
                <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Urgencia">
                  {URGENCIAS.map(u => (
                    <button key={u} type="button" disabled={ocupado} aria-pressed={s.urgencia === u}
                      onClick={() => hacer(() => decidir(s.id, { accion: 'clasificar', urgencia: u }))}
                      className="min-h-[40px] rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
                      style={s.urgencia === u
                        ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                        : { background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                      {URGENCIA[u].texto}
                    </button>
                  ))}
                </div>
              </div>

              <CampoEnvio
                id={`preg-${s.id}`} etiqueta="Preguntar a la tienda" boton="Enviar pregunta" ocupado={ocupado}
                ayuda="La tienda la ve arriba de su pantalla, en «Te esperan»."
                alEnviar={texto => hacer(() => comentar(s.id, 'pregunta', texto))}
              />
              <CampoEnvio
                id={`nota-${s.id}`} etiqueta="Nota de Mantención para el técnico" boton="Guardar nota" ocupado={ocupado}
                ayuda="La tienda no la ve."
                alEnviar={texto => hacer(() => comentar(s.id, 'nota_mantencion', texto))}
              />

              <div className="flex justify-end">
                <button type="button" disabled={ocupado}
                  onClick={() => {
                    if (window.confirm('¿Descartar esta solicitud? Queda registrada, pero deja de contar.')) {
                      void hacer(() => decidir(s.id, { accion: 'descartar' }));
                    }
                  }}
                  className="text-sm font-semibold underline disabled:opacity-50" style={{ color: 'var(--est-error)' }}>
                  Descartar solicitud
                </button>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-sm" style={{ color: 'var(--est-error)' }}>{error}</p>}
        </div>
      )}
    </Tarjeta>
  );
}

function CampoEnvio(
  { id, etiqueta, boton, ayuda, ocupado, alEnviar }:
  { id: string; etiqueta: string; boton: string; ayuda: string; ocupado: boolean; alEnviar: (t: string) => Promise<boolean> },
) {
  const [texto, setTexto] = useState('');
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <textarea id={id} value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={2000}
          className="flex-1 rounded-xl p-2 text-sm" style={estiloCampo} />
        <button type="button" disabled={ocupado || !texto.trim()}
          onClick={async () => { if (await alEnviar(texto.trim())) setTexto(''); }}
          className="min-h-[40px] rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
          style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          {boton}
        </button>
      </div>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-sub)' }}>{ayuda}</p>
    </div>
  );
}
