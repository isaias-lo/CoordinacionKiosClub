'use client';

// Piezas visuales que comparten las pantallas de Mantención. Usan las variables del tema
// (`--color-card`, `--color-text`, `--est-*`) para verse bien en claro y en oscuro.

import type { ReactNode } from 'react';
import type { Tono } from './utils/conversacion';

const TONO: Record<Tono, { fondo: string; letra: string }> = {
  neutro: { fondo: 'var(--color-bg-2)',         letra: 'var(--color-text)' },
  ambar:  { fondo: 'var(--est-aviso-suave)',    letra: 'var(--est-aviso)' },
  // `--color-info` no tiene versión oscura y sobre el fondo oscuro no se lee: se usa el índigo de
  // pallet, que sí la tiene.
  azul:   { fondo: 'var(--uni-pallet-suave)',   letra: 'var(--uni-pallet)' },
  verde:  { fondo: 'var(--est-ok-suave)',       letra: 'var(--est-ok)' },
  gris:   { fondo: 'var(--color-bg-2)',         letra: 'var(--color-text-sub)' },
  rojo:   { fondo: 'var(--est-error-suave)',    letra: 'var(--est-error)' },
};

export function Insignia({ tono, children }: { tono: Tono; children: ReactNode }) {
  const t = TONO[tono];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ background: t.fondo, color: t.letra }}
    >
      {children}
    </span>
  );
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
    >
      {children}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: 'ok' | 'aviso' | 'error'; children: ReactNode }) {
  const c = { ok: 'var(--est-ok)', aviso: 'var(--est-aviso)', error: 'var(--est-error)' }[tono];
  const f = { ok: 'var(--est-ok-suave)', aviso: 'var(--est-aviso-suave)', error: 'var(--est-error-suave)' }[tono];
  return (
    <div role={tono === 'error' ? 'alert' : 'status'} className="rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: f, color: c, border: `1px solid ${c}` }}>
      {children}
    </div>
  );
}

/** Botón grande, cómodo para el pulgar (44 px de alto como mínimo). */
export function BotonPrincipal(
  { children, disabled, onClick, type = 'button' }:
  { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' },
) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className="w-full min-h-[48px] rounded-xl px-4 text-base font-bold transition-opacity disabled:opacity-40"
      style={{ background: 'var(--color-primary)', color: '#fff' }}
    >
      {children}
    </button>
  );
}

export function BotonSecundario(
  { children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean },
) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="min-h-[44px] rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
      style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
    >
      {children}
    </button>
  );
}

export const estiloCampo = {
  background: 'var(--color-card)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
} as const;
