'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useContextoMant } from '../useContextoMant';
import { comentar, traerSolicitudes } from '../apiCliente';
import {
  descartarDeCola, drenarSolicitudes, solicitudesEnCola, type SolicitudPendiente,
} from '../colaMantencion';
import {
  esAbierta, estadoParaTienda, haceCuanto, historialParaTienda, preguntasSinResponder,
} from '../utils/conversacion';
import { tituloDeSolicitud } from '../utils/formulario';
import type { ComentarioMant, SolicitudMant } from '../tipos';
import { Aviso, BotonSecundario, Insignia, Tarjeta, estiloCampo } from '../ui';

type FiltroEstado = 'abiertas' | 'cerradas' | 'todas';

/**
 * /mantencion/tienda — lo que ve el supervisor de tienda: arriba las preguntas de Mantención que lo
 * esperan, abajo sus solicitudes. Celular primero.
 */
export function MisSolicitudes() {
  const params = useSearchParams();
  const aviso = params.get('aviso');
  const { contexto, error: errorContexto } = useContextoMant();

  const [solicitudes, setSolicitudes] = useState<SolicitudMant[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [cola, setCola] = useState<SolicitudPendiente[]>([]);
  const [sinSenal, setSinSenal] = useState(false);
  const [tienda, setTienda] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('abiertas');
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    try {
      setSolicitudes(await traerSolicitudes());
      setErrorLista(null);
    } catch (e) {
      setErrorLista(e instanceof Error ? e.message : 'No se pudieron cargar');
    }
  }, []);

  const refrescarCola = useCallback(async () => setCola(await solicitudesEnCola()), []);

  const enviarCola = useCallback(async () => {
    const r = await drenarSolicitudes();
    await refrescarCola();
    if (r.enviadas > 0) await cargarLista();
  }, [cargarLista, refrescarCola]);

  useEffect(() => {
    setSinSenal(typeof navigator !== 'undefined' && !navigator.onLine);
    void cargarLista();
    void refrescarCola().then(enviarCola);
    // Al volver la señal se manda lo que quedó en el celular, sin que nadie tenga que tocar nada.
    const alVolver = () => { setSinSenal(false); void enviarCola(); };
    const alCortarse = () => setSinSenal(true);
    window.addEventListener('online', alVolver);
    window.addEventListener('offline', alCortarse);
    return () => {
      window.removeEventListener('online', alVolver);
      window.removeEventListener('offline', alCortarse);
    };
  }, [cargarLista, refrescarCola, enviarCola]);

  const alResponder = (c: ComentarioMant) => {
    setSolicitudes(prev => prev?.map(s => s.id === c.solicitudId ? { ...s, comentarios: [...s.comentarios, c] } : s) ?? prev);
  };

  const todas = useMemo(() => solicitudes ?? [], [solicitudes]);
  const esperan = useMemo(() => {
    const porId = new Map(todas.map(s => [s.id, s]));
    return preguntasSinResponder(todas.flatMap(s => s.comentarios))
      .map(p => ({ pregunta: p, solicitud: porId.get(p.solicitudId)! }))
      .filter(x => x.solicitud);
  }, [todas]);

  const visibles = todas.filter(s =>
    (!tienda || s.codigoTienda === tienda)
    && (filtro === 'todas' || (filtro === 'abiertas' ? esAbierta(s.estado) : !esAbierta(s.estado))));
  const enCola = cola.filter(i => !i.bloqueado && (!tienda || i.payload.cuerpo.codigoTienda === tienda));
  const rechazadas = cola.filter(i => i.bloqueado);

  const tiendas = contexto?.tiendas ?? [];
  const sinTiendas = contexto !== null && tiendas.length === 0;

  return (
    <div className="min-h-full" style={{ background: 'var(--color-bg)' }}>
      <PageHeader
        title="Mantención"
        subtitle={tiendas.length ? `${tiendas.length} ${tiendas.length === 1 ? 'tienda' : 'tiendas'} a cargo` : 'Solicitudes de tienda'}
      />
      <main className="mx-auto max-w-xl px-4 py-4 space-y-4">
        {sinSenal && (
          <Aviso tono="aviso">
            Sin señal. Lo que envíes queda guardado en el celular y sale solo cuando vuelva la conexión.
          </Aviso>
        )}
        {aviso === 'enviada' && <Aviso tono="ok">Solicitud enviada. Mantención la va a revisar.</Aviso>}
        {aviso === 'guardada' && (
          <Aviso tono="aviso">Quedó guardada en el celular y se envía sola cuando vuelva la señal.</Aviso>
        )}
        {rechazadas.map(r => (
          <Aviso key={r.id} tono="error">
            <div>No se pudo enviar «{tituloDeSolicitud(r.payload.cuerpo.descripcion, 50)}»: {r.ultimoError ?? 'el servidor la rechazó'}.</div>
            <button type="button" className="mt-2 underline font-semibold"
              onClick={async () => { await descartarDeCola(r.id); await refrescarCola(); }}>
              Descartarla y crearla de nuevo
            </button>
          </Aviso>
        ))}

        {sinTiendas ? (
          <Tarjeta>
            <p className="font-semibold">Todavía no tienes tiendas asignadas.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-sub)' }}>
              Pídele a Mantención que te asigne las tuyas. Cuando lo haga, aquí vas a poder crear solicitudes.
            </p>
          </Tarjeta>
        ) : (
          <Link href="/mantencion/tienda/nueva"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-base font-bold"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>
            <Plus className="h-5 w-5" aria-hidden="true" /> Nueva solicitud
          </Link>
        )}

        {esperan.length > 0 && (
          <section aria-labelledby="te-esperan" className="space-y-3">
            <h2 id="te-esperan" className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--est-aviso)' }}>
              Te esperan · {esperan.length} {esperan.length === 1 ? 'pregunta' : 'preguntas'} de Mantención
            </h2>
            {esperan.map(({ pregunta, solicitud }) => (
              <Responder key={pregunta.id} pregunta={pregunta} solicitud={solicitud} alResponder={alResponder} />
            ))}
          </section>
        )}

        <section aria-labelledby="mis-solicitudes" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="mis-solicitudes" className="text-base font-bold" style={{ color: 'var(--color-text)' }}>Mis solicitudes</h2>
            <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>{visibles.length + enCola.length}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {tiendas.length > 1 && (
              <label className="flex-1 min-w-[10rem]">
                <span className="sr-only">Tienda</span>
                <select value={tienda} onChange={e => setTienda(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl px-3 text-sm" style={estiloCampo}>
                  <option value="">Todas mis tiendas</option>
                  {tiendas.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                </select>
              </label>
            )}
            <div role="group" aria-label="Estado" className="flex gap-1">
              {(['abiertas', 'cerradas', 'todas'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
                  className="min-h-[44px] rounded-xl px-3 text-sm font-semibold capitalize"
                  style={filtro === f
                    ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                    : { background: 'var(--color-bg-2)', color: 'var(--color-text-sub)' }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {errorLista && !solicitudes && (
            <Aviso tono="error">
              No se pudieron cargar tus solicitudes ({errorLista}).{' '}
              <button type="button" className="underline font-semibold" onClick={() => void cargarLista()}>Reintentar</button>
            </Aviso>
          )}
          {errorContexto && !contexto && <Aviso tono="error">No se pudo cargar Mantención ({errorContexto}).</Aviso>}
          {solicitudes === null && !errorLista && (
            <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>Cargando…</p>
          )}

          {filtro !== 'cerradas' && enCola.map(i => (
            <Tarjeta key={i.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{tituloDeSolicitud(i.payload.cuerpo.descripcion)}</p>
                  <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-sub)' }}>
                    {i.payload.vista.nombreTienda} · {i.payload.cuerpo.categoria || 'Sin categoría'} · {haceCuanto(i.payload.vista.creadaEn)}
                  </p>
                </div>
                <Insignia tono="ambar">Por enviar</Insignia>
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--color-text-sub)' }}>
                Guardada en el celular: se envía sola al volver la señal.
              </p>
            </Tarjeta>
          ))}

          {solicitudes !== null && visibles.length === 0 && enCola.length === 0 && !sinTiendas && (
            <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {filtro === 'abiertas' ? 'No hay solicitudes abiertas.' : 'No hay solicitudes.'}
            </p>
          )}

          {visibles.map(s => (
            <FichaSolicitud key={s.id} s={s} abierta={abierta === s.id}
              alternar={() => setAbierta(a => a === s.id ? null : s.id)} />
          ))}
        </section>
      </main>
    </div>
  );
}

function FichaSolicitud({ s, abierta, alternar }: { s: SolicitudMant; abierta: boolean; alternar: () => void }) {
  const e = estadoParaTienda(s.estado, { unida: !!s.duplicadaDe });
  return (
    <Tarjeta>
      <button type="button" onClick={alternar} aria-expanded={abierta} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{tituloDeSolicitud(s.descripcion)}</p>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {s.nombreTienda} · {s.categoria ?? 'Sin categoría'} · {haceCuanto(s.creadaEn)}
            </p>
          </div>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
        </div>
      </button>
      {abierta && (
        <div className="mt-3 space-y-3">
          {s.descripcion.trim() !== tituloDeSolicitud(s.descripcion) && (
            <p className="text-sm whitespace-pre-line">{s.descripcion}</p>
          )}
          {s.fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {s.fotos.map((f, i) => f.url ? (
                <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${i + 1} de la solicitud`} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ) : (
                <div key={f.id} className="flex aspect-square items-center justify-center rounded-lg text-xs"
                  style={{ background: 'var(--color-bg-2)', color: 'var(--color-text-sub)' }}>
                  Foto no disponible
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-sub)' }}>
              Historial y conversación
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {historialParaTienda(s, s.comentarios).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

function Responder(
  { pregunta, solicitud, alResponder }:
  { pregunta: ComentarioMant; solicitud: SolicitudMant; alResponder: (c: ComentarioMant) => void },
) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `resp-${pregunta.id}`;

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      alResponder(await comentar(solicitud.id, 'respuesta', texto.trim()));
      setTexto('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <p className="text-xs font-semibold" style={{ color: 'var(--est-aviso)' }}>
        Mantención pregunta · {solicitud.nombreTienda}
      </p>
      <p className="mt-1 text-sm font-semibold">{tituloDeSolicitud(solicitud.descripcion)}</p>
      <p className="mt-2">{pregunta.texto}</p>
      <label htmlFor={id} className="mt-3 block text-sm font-medium">Tu respuesta</label>
      <textarea id={id} value={texto} onChange={e => setTexto(e.target.value)} rows={2}
        className="mt-1 w-full rounded-xl p-3 text-base" style={estiloCampo} />
      {error && <p className="mt-1 text-sm" style={{ color: 'var(--est-error)' }}>{error}</p>}
      <div className="mt-2 flex justify-end">
        <BotonSecundario onClick={enviar} disabled={!texto.trim() || enviando}>
          {enviando ? 'Enviando…' : 'Responder'}
        </BotonSecundario>
      </div>
    </Tarjeta>
  );
}
