'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import {
  almacenCampana, etiquetaCampana, llegoAvisoNuevo, nivelMaximo, textoContador,
  type EstadoCampana, type NivelAviso,
} from './avisosCampana';

const VACIO: EstadoCampana = { avisos: [], campanas: 0, abierta: false };

const COLOR_CONTADOR: Record<NivelAviso, string> = {
  error: 'bg-[#D32F2F] text-white',
  aviso: 'bg-[#D97706] text-white',
  info:  'bg-navy text-white',
};

/** Cuelga el nodo de un aviso dentro del panel. El aviso se dibuja en él con un portal. */
function Ranura({ nodo }: { nodo: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.appendChild(nodo);
    return () => { if (nodo.parentNode === el) el.removeChild(nodo); };
  }, [nodo]);
  // flex-shrink-0: en la columna del panel, sin esto cada aviso se encogía y cortaba su final
  // (el mismo problema que la tabla de encargados de /picking, 13/10/2026).
  return <div ref={ref} className="flex-shrink-0 rounded-card overflow-hidden border border-border bg-white" />;
}

/**
 * La campana de la cabecera: un botón con contador y, al tocarlo, el panel con los avisos de la
 * pantalla. En el teléfono el panel sube desde abajo; en el escritorio cuelga arriba a la derecha.
 * Ver `avisosCampana.ts` para qué va acá y qué no.
 */
export function CampanaAvisos({ className = '' }: { className?: string }) {
  const estado = useSyncExternalStore(almacenCampana.suscribir, almacenCampana.leer, () => VACIO);
  const { avisos, abierta } = estado;
  const n = avisos.length;
  const nivel = nivelMaximo(avisos);

  useEffect(() => almacenCampana.montarCampana(), []);

  // El contador late un rato cuando llega un aviso nuevo; con los que ya estaban, quieto.
  const idsAntes = useRef<string[]>([]);
  const [latiendo, setLatiendo] = useState(false);
  useEffect(() => {
    const ids = avisos.map(a => a.id);
    const nuevo = llegoAvisoNuevo(idsAntes.current, ids);
    idsAntes.current = ids;
    if (!nuevo) return;
    setLatiendo(true);
    const t = setTimeout(() => setLatiendo(false), 4000);
    return () => clearTimeout(t);
  }, [avisos]);

  useEffect(() => {
    if (!abierta) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') almacenCampana.abrir(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierta]);

  const [montada, setMontada] = useState(false);
  useEffect(() => setMontada(true), []);

  return (
    <>
      <button type="button" onClick={() => almacenCampana.abrir(!abierta)}
        aria-label={etiquetaCampana(n)} aria-expanded={abierta} aria-haspopup="dialog"
        title={n ? avisos.map(a => a.titulo).join(' · ') : 'Sin avisos'}
        className={`relative w-[44px] h-[44px] flex-shrink-0 flex items-center justify-center rounded-[10px] cursor-pointer transition-colors print:hidden ${
          abierta ? 'bg-navy text-white' : n ? 'text-navy hover:bg-bg-2' : 'text-text-sub hover:bg-bg-2'} ${className}`}>
        <Bell size={20} aria-hidden="true" />
        {n > 0 && nivel && (
          <span aria-hidden="true"
            className={`absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[11px] font-extrabold leading-none ${COLOR_CONTADOR[nivel]}`}>
            {latiendo && <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${COLOR_CONTADOR[nivel]}`} />}
            <span className="relative">{textoContador(n)}</span>
          </span>
        )}
      </button>

      {/* Siempre montado (oculto si está cerrado): los avisos se dibujan adentro con portales y así
          sus nodos nunca quedan fuera del documento. */}
      {montada && createPortal(
        <div className={abierta ? '' : 'hidden'}>
          <div aria-hidden="true" className="fixed inset-0 z-[550] bg-black/30 lg:bg-transparent print:hidden" onClick={() => almacenCampana.abrir(false)} />
          <section role="dialog" aria-label="Avisos" aria-modal="false"
            className="fixed z-[560] print:hidden bg-bg shadow-card2 flex flex-col
                       inset-x-0 bottom-0 max-h-[78vh] rounded-t-[16px]
                       lg:inset-x-auto lg:bottom-auto lg:top-14 lg:right-4 lg:w-[440px] lg:max-h-[80vh] lg:rounded-[14px]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <header className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
              <Bell size={18} aria-hidden="true" className="text-navy" />
              <h2 className="flex-1 font-barlow-condensed text-titulo font-extrabold text-navy">
                Avisos{n ? ` (${n})` : ''}
              </h2>
              <button type="button" onClick={() => almacenCampana.abrir(false)} aria-label="Cerrar avisos"
                className="w-[44px] h-[44px] flex items-center justify-center rounded-full text-text-sub hover:bg-bg-2 cursor-pointer">
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
              {n === 0 && <p className="py-6 text-center text-apoyo text-text-sub">No hay avisos pendientes.</p>}
              {avisos.map(a => a.nodo && <Ranura key={a.id} nodo={a.nodo} />)}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
