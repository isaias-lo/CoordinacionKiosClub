'use client';

// Qué hace Bodega con cada etiqueta que lee la handheld. Compartido por Nacional y RM/Costa, que
// solo difieren en cómo indexan sus tiendas (nombre o código) y en cómo abren una.
//
//   · Etiqueta de la carga de hoy → abre su tienda, salta a su tarjeta con el cursor en Peso, y
//     suena distinto si esa unidad ya estaba pesada (`avisoUnidadEscaneada.ts`).
//   · Etiqueta de otro día (pallet adelantado) → abre el diálogo de "preexistente" de su tienda con
//     el número ya puesto. Reclamarlo re-data el pallet, así que lo confirma la persona.
//   · Nada → pitido de error y el motivo en pantalla.

import { useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { avisoFisico } from '@/lib/avisoFisico';
import { buscarPallet, type PalletEncontrado, type SlotDePallet } from './buscarPallet';
import type { AvisoUnidad } from './avisoUnidadEscaneada';
import { ConfirmacionDoble } from './lectorBodega';
import { useLectorBodega, tarjetaAMedias } from './useLectorBodega';

const VERDE = '#16A34A', AMBAR = '#D97706', ROJO = '#D32F2F';

/** Un pallet que existe pero no está en la carga de hoy de esta pantalla. */
export interface PalletDeOtroDia {
  id: number;
  store_cod: string;
  tipo: string | null;
  date: string | null;
}

async function buscarFueraDeHoy(codigo: string): Promise<PalletDeOtroDia | null> {
  const q = supabase.from('picking_pallets').select('id, store_cod, tipo, date').limit(1);
  const { data } = await (/^\d+$/.test(codigo) ? q.eq('id', Number(codigo)) : q.eq('canonical_id', codigo)).maybeSingle();
  return (data as PalletDeOtroDia | null) ?? null;
}

export interface OpcionesEscaneo<Slot extends SlotDePallet> {
  activo: boolean;
  slotsPorTienda: Record<string, readonly Slot[]>;
  /** Qué decir de la unidad (ya pesada, sin pesar). */
  avisoDe: (p: PalletEncontrado<Slot>) => AvisoUnidad;
  /** Abrir la tienda y saltar a la tarjeta. `false` si esta pantalla no tiene esa tienda. */
  irA: (p: PalletEncontrado<Slot>) => boolean;
  /** Abrir el diálogo de preexistente con el número puesto. `false` si la tienda no es de esta pantalla. */
  ofrecerPreexistente: (pallet: PalletDeOtroDia, codigo: string) => boolean;
  showToast: (msg: string, color?: string) => void;
}

export function useEscaneoBodega<Slot extends SlotDePallet>(opts: OpcionesEscaneo<Slot>): void {
  const confirmacion = useRef(new ConfirmacionDoble());

  useLectorBodega({
    activo: opts.activo,
    reconoce: codigo => !!buscarPallet(opts.slotsPorTienda, codigo),
    alEscanear: codigo => {
      const p = buscarPallet(opts.slotsPorTienda, codigo);
      if (!p) {
        void noEsDeHoy(codigo);
        return;
      }
      if (tarjetaAMedias(p.slot.id) && !confirmacion.current.confirmar(codigo, Date.now())) {
        avisoFisico('aviso');
        opts.showToast('Hay datos sin guardar en esta tarjeta. Guárdala, o escanea otra vez para ir igual.', AMBAR);
        return;
      }
      confirmacion.current.olvidar();
      const aviso = opts.avisoDe(p);
      if (!opts.irA(p)) {
        avisoFisico('error');
        opts.showToast(`El pallet #${p.slot.id} es de una tienda que no está en esta bodega.`, ROJO);
        return;
      }
      avisoFisico(aviso.advertir ? 'aviso' : 'ok');
      if (aviso.texto) opts.showToast(`#${p.slot.id} · ${aviso.texto}`, aviso.advertir ? AMBAR : VERDE);
    },
  });

  async function noEsDeHoy(codigo: string) {
    let pallet: PalletDeOtroDia | null = null;
    try { pallet = await buscarFueraDeHoy(codigo); } catch { /* sin conexión: cae al "no encontrada" */ }
    if (pallet && opts.ofrecerPreexistente(pallet, codigo)) {
      avisoFisico('aviso');
      opts.showToast(`Pallet #${pallet.id} no está en la carga de hoy. Confírmalo para agregarlo.`, AMBAR);
      return;
    }
    avisoFisico('error');
    opts.showToast(pallet
      ? `El pallet #${pallet.id} es de ${pallet.store_cod}, que no está en esta bodega.`
      : `Etiqueta ${codigo} no encontrada.`, ROJO);
  }
}
