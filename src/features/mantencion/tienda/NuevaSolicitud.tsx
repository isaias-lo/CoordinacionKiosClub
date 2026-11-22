'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ImagePlus, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { processPhoto } from '@/features/auditoria/utils/photos';
import { useContextoMant } from '../useContextoMant';
import { crearSolicitud, traerSolicitudes } from '../apiCliente';
import { encolarSolicitud, type CuerpoSolicitud } from '../colaMantencion';
import { MAX_FOTOS } from '../utils/validarSolicitud';
import { leerFotos } from '../utils/fotos';
import { faltaParaEnviar, posibleDuplicadoAlCrear, tituloDeSolicitud } from '../utils/formulario';
import { haceCuanto } from '../utils/conversacion';
import type { SolicitudMant } from '../tipos';
import { Aviso, BotonPrincipal, Tarjeta, estiloCampo } from '../ui';

interface FotoLocal { id: string; file: File; previewUrl: string; aviso: string }

function nuevoId(): string {
  try { return crypto.randomUUID(); }
  catch { return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function aDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer la foto'));
    r.readAsDataURL(file);
  });
}

/**
 * /mantencion/tienda/nueva — el supervisor pide un arreglo desde el celular.
 *
 * Reglas del negocio que viven en esta pantalla (ver docs/PROMPT_Mantencion_Fase1.md):
 *   · La urgencia NO la elige la tienda: no hay campo, y el texto fijo lo explica.
 *   · Categoría opcional: sugerida o escrita.
 *   · De 1 a 5 fotos, comprimidas en el celular antes de mandarlas.
 *   · Sin señal se guarda en la cola offline y sale sola.
 *
 * Con `modo="whatsapp"` es la misma pantalla para Mantención (`/mantencion/nueva`): Jesús carga a
 * nombre de una tienda lo que le llegó por WhatsApp, y la solicitud queda con `origen = whatsapp`.
 */
export function NuevaSolicitud({ modo = 'tienda' }: { modo?: 'tienda' | 'whatsapp' } = {}) {
  const porWhatsapp = modo === 'whatsapp';
  const volver = porWhatsapp ? '/mantencion' : '/mantencion/tienda';
  const router = useRouter();
  const { contexto } = useContextoMant();
  const tiendas = useMemo(() => contexto?.tiendas ?? [], [contexto]);
  const categorias = contexto?.categorias ?? [];

  const [tienda, setTienda] = useState('');
  const [cat, setCat] = useState('');
  const [otraActiva, setOtraActiva] = useState(false);
  const [otra, setOtra] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existentes, setExistentes] = useState<SolicitudMant[]>([]);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  // Con una sola tienda no hay nada que elegir. Con varias se elige a propósito: preseleccionar la
  // primera haría que una solicitud de Ñuñoa saliera a nombre de Maipú por no mirar el selector.
  useEffect(() => {
    if (tiendas.length === 1 && !tienda) setTienda(tiendas[0].codigo);
  }, [tiendas, tienda]);

  // Para el aviso de posible duplicado. Sin señal no hay lista y no se avisa: no es un bloqueo.
  useEffect(() => {
    traerSolicitudes().then(setExistentes).catch(() => setExistentes([]));
  }, []);

  // Las vistas previas son URLs de objeto: hay que liberarlas o el celular se queda sin memoria.
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => { fotosRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl)); }, []);

  const categoria = otraActiva ? otra.trim() : cat;
  const duplicado = posibleDuplicadoAlCrear({ codigoTienda: tienda, categoria }, existentes);
  const falta = faltaParaEnviar({ tienda, descripcion, fotos: fotos.length });

  const agregarFotos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setProcesando(true);
    setError(null);
    try {
      const libres = MAX_FOTOS - fotos.length;
      const nuevas: FotoLocal[] = [];
      for (const file of Array.from(lista).slice(0, libres)) {
        const p = await processPhoto(file);
        nuevas.push({ id: nuevoId(), file: p.compressed, previewUrl: p.previewUrl, aviso: p.warning });
      }
      if (lista.length > libres) setError(`Máximo ${MAX_FOTOS} fotos: se agregaron las primeras ${libres}.`);
      setFotos(prev => [...prev, ...nuevas]);
    } catch {
      setError('No se pudo procesar la foto. Intenta tomarla de nuevo.');
    } finally {
      setProcesando(false);
      if (camara.current) camara.current.value = '';
      if (galeria.current) galeria.current.value = '';
    }
  };

  const quitarFoto = (id: string) => {
    setFotos(prev => {
      const f = prev.find(x => x.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  const enviar = async () => {
    if (falta.length || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const datos = await Promise.all(fotos.map(f => aDataUrl(f.file)));
      const chequeo = leerFotos(datos);
      if (!chequeo.ok) { setError(chequeo.errores.join('. ')); return; }

      const cuerpo: CuerpoSolicitud = {
        codigoTienda: tienda, categoria, descripcion: descripcion.trim(), fotos: datos, clientOpId: nuevoId(),
        origen: porWhatsapp ? 'whatsapp' : 'app',
      };
      const vista = {
        nombreTienda: tiendas.find(t => t.codigo === tienda)?.nombre ?? tienda,
        creadaEn: new Date().toISOString(),
      };

      const guardarEnCelular = async () => {
        if (await encolarSolicitud({ cuerpo, vista })) {
          router.push(`${volver}?aviso=guardada`);
        } else {
          // Ni salió ni quedó guardada: decirlo, nunca un «listo» falso.
          setError('No se pudo enviar ni guardar en el celular. Revisa la señal e intenta de nuevo.');
        }
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) { await guardarEnCelular(); return; }
      const r = await crearSolicitud(cuerpo);
      if (r.ok) router.push(porWhatsapp ? '/mantencion?tab=revisar&aviso=enviada' : `${volver}?aviso=enviada`);
      else if (r.red) await guardarEnCelular();
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-full" style={{ background: 'var(--color-bg)' }}>
      <PageHeader title={porWhatsapp ? 'Ingresar por WhatsApp' : 'Nueva solicitud'} backHref={volver} />
      <main className="mx-auto max-w-xl px-4 py-4 space-y-4" style={{ color: 'var(--color-text)' }}>
        <Tarjeta className="space-y-2">
          <label htmlFor="mant-tienda" className="block font-semibold">Tienda</label>
          <select id="mant-tienda" value={tienda} onChange={e => setTienda(e.target.value)}
            className="w-full min-h-[48px] rounded-xl px-3 text-base" style={estiloCampo}>
            <option value="">Elige una de tus tiendas</option>
            {tiendas.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre} ({t.codigo})</option>)}
          </select>
        </Tarjeta>

        <Tarjeta className="space-y-2">
          <p className="font-semibold">
            Categoría <span className="font-normal text-sm" style={{ color: 'var(--color-text-sub)' }}>(opcional: elige una o escribe la tuya)</span>
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
            {categorias.map(c => {
              const activa = !otraActiva && cat === c;
              return (
                <button key={c} type="button" aria-pressed={activa}
                  onClick={() => { setOtraActiva(false); setCat(activa ? '' : c); }}
                  className="min-h-[40px] rounded-full px-3 text-sm font-medium"
                  style={activa
                    ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                    : { background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                  {c}
                </button>
              );
            })}
            <button type="button" aria-pressed={otraActiva} onClick={() => setOtraActiva(v => !v)}
              className="min-h-[40px] rounded-full px-3 text-sm font-medium"
              style={otraActiva
                ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                : { background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px dashed var(--color-border)' }}>
              Otra categoría
            </button>
          </div>
          {otraActiva && (
            <>
              <label htmlFor="mant-otra" className="sr-only">Escribe la categoría</label>
              <input id="mant-otra" value={otra} onChange={e => setOtra(e.target.value)} maxLength={60}
                placeholder="Escribe la categoría" className="w-full min-h-[44px] rounded-xl px-3 text-base" style={estiloCampo} />
            </>
          )}
        </Tarjeta>

        {duplicado && (
          <Aviso tono="aviso">
            Ya hay una solicitud abierta de {duplicado.categoria} en esta tienda:
            «{tituloDeSolicitud(duplicado.descripcion, 60)}» ({haceCuanto(duplicado.creadaEn)}). Si es lo mismo,
            no hace falta crear otra. Si es otra cosa, envíala igual.
          </Aviso>
        )}

        <Tarjeta className="space-y-2">
          <label htmlFor="mant-desc" className="block font-semibold">¿Qué pasa y dónde?</label>
          <textarea id="mant-desc" value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4}
            maxLength={2000} placeholder="Ej.: la vitrina de lácteos marca 12 °C desde la mañana"
            className="w-full rounded-xl p-3 text-base" style={estiloCampo} />
          <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            {porWhatsapp
              ? 'Queda a nombre de la tienda y marcada «por WhatsApp». La urgencia la clasificas después, en «Por revisar».'
              : 'La urgencia la define Mantención. Si es una emergencia, llama o escribe por WhatsApp.'}
          </p>
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Fotos</p>
            <span className="text-sm" style={{ color: 'var(--color-text-sub)' }}>{fotos.length} de {MAX_FOTOS}</span>
          </div>
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map((f, i) => (
                <div key={f.id} className="relative aspect-square overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.previewUrl} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => quitarFoto(f.id)} aria-label={`Quitar foto ${i + 1}`}
                    className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {f.aviso && (
                    <span className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[10px] leading-tight"
                      style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}>{f.aviso}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {fotos.length < MAX_FOTOS && (
            <div className="grid grid-cols-2 gap-2">
              <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden"
                aria-hidden="true" tabIndex={-1} onChange={e => void agregarFotos(e.target.files)} />
              <input ref={galeria} type="file" accept="image/*" multiple className="hidden"
                aria-hidden="true" tabIndex={-1} onChange={e => void agregarFotos(e.target.files)} />
              <button type="button" disabled={procesando} onClick={() => camara.current?.click()}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                <Camera className="h-5 w-5" aria-hidden="true" /> Tomar foto
              </button>
              <button type="button" disabled={procesando} onClick={() => galeria.current?.click()}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                <ImagePlus className="h-5 w-5" aria-hidden="true" /> De la galería
              </button>
            </div>
          )}
          {procesando && <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>Preparando la foto…</p>}
        </Tarjeta>

        {error && <Aviso tono="error">{error}</Aviso>}

        <div className="space-y-2 pb-8">
          <BotonPrincipal onClick={enviar} disabled={falta.length > 0 || enviando || procesando}>
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </BotonPrincipal>
          {falta.length > 0 && (
            <p className="text-center text-sm" style={{ color: 'var(--color-text-sub)' }}>
              Falta: {falta.join(', ')}.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
