'use client';

// El aviso de `confirmar()` (ver confirmar.ts). Se monta una vez, en el layout de /despacho.
//
// Teclado y lector: es un `alertdialog` modal; abre con el foco en el botón que NO hace nada
// (un Enter de más no borra), Escape o tocar afuera responden «no», Tab no se escapa del aviso y
// al cerrar el foco vuelve a donde estaba.

import { useEffect, useRef, useState } from 'react';
import { registrarHost, type ConfirmacionAbierta } from './confirmar';

const TONO: Record<NonNullable<ConfirmacionAbierta['tono']>, string> = {
  normal:  'bg-navy',
  aviso:   'bg-[#B45309]',
  peligro: 'bg-red',
};

export default function ConfirmarHost() {
  const [p, setP] = useState<ConfirmacionAbierta | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => registrarHost(setP), []);

  useEffect(() => {
    if (!p) return;
    previo.current = document.activeElement as HTMLElement | null;
    cancelar.current?.focus();
    return () => { previo.current?.focus?.(); };
  }, [p]);

  if (!p) return null;

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); p.responder(false); return; }
    if (e.key !== 'Tab') return;
    const botones = [...(caja.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    if (botones.length === 0) return;
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    const sig = e.shiftKey ? (i <= 0 ? botones.length - 1 : i - 1) : (i + 1) % botones.length;
    e.preventDefault();
    botones[sig].focus();
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-end sm:items-center justify-center bg-black/50 p-3"
      onClick={() => p.responder(false)}>
      <div ref={caja} role="alertdialog" aria-modal="true"
        aria-labelledby="confirmar-titulo" aria-describedby={p.detalle ? 'confirmar-detalle' : undefined}
        onKeyDown={teclas} onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-kios bg-card shadow-kios p-4 flex flex-col gap-3">
        <h2 id="confirmar-titulo" className="text-cuerpo font-extrabold text-text m-0">{p.titulo}</h2>
        {p.detalle && (
          <p id="confirmar-detalle" className="text-apoyo text-text-2 m-0 whitespace-pre-line">{p.detalle}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button ref={cancelar} type="button" onClick={() => p.responder(false)}
            className="flex-1 min-h-[48px] px-3 rounded-btn bg-card border border-border-2 text-text text-apoyo font-bold cursor-pointer active:bg-bg-2">
            {p.cancelar ?? 'Cancelar'}
          </button>
          <button type="button" onClick={() => p.responder(true)}
            className={`flex-1 min-h-[48px] px-3 rounded-btn border-none text-white text-apoyo font-bold cursor-pointer active:opacity-80 ${TONO[p.tono ?? 'normal']}`}>
            {p.aceptar}
          </button>
        </div>
      </div>
    </div>
  );
}
