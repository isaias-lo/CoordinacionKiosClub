'use client';

// Qué hace Bodega con cada etiqueta que lee la handheld. Compartido por Nacional y RM/Costa, que
// solo difieren en cómo indexan sus tiendas (nombre o código) y en cómo abren una.
//
//   · Etiqueta de la carga de hoy → abre su tienda, salta a su tarjeta con el cursor en Peso, y
//     suena distinto si esa unidad ya estaba pesada (`avisoUnidadEscaneada.ts`).
//   · Etiqueta de otro día (pallet adelantado) → abre el diálogo de "preexistente" de su tienda con
//     el número ya puesto. Reclamarlo re-data el pallet, así que lo confirma la persona.
//   · Etiqueta de un pallet BORRADO → abre su tienda y el diálogo ya comprobado, que ofrece
//     restaurarlo si hay copia. Antes decía "no encontrada" y la persona no tenía salida.
//   · Etiqueta de una tienda del OTRO espejo de Bodega → no se abre ACÁ: la pantalla anota la
//     lectura y lleva a la persona a la pestaña dueña, que la procesa como propia. Si no puede ir
//     (sin permiso, o ya venía reenviada), pitido de error y el aviso de en qué pestaña se pesa.
//     Ver `vetoEscaneo.ts` y `saltoEntreBodegas.ts`.
//   · Nada → pitido de error y el motivo en pantalla.

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isPathAllowed } from '@/config/routes';
import { supabase } from '@/lib/supabase';
import { avisoFisico } from '@/lib/avisoFisico';
import { buscarPallet, variantesDeCodigo, type PalletEncontrado, type SlotDePallet } from './buscarPallet';
import type { AvisoUnidad } from './avisoUnidadEscaneada';
import { ConfirmacionDoble } from './lectorBodega';
import { useLectorBodega, tarjetaAMedias } from './useLectorBodega';
import { avisoSiEsDeOtraBodega } from './vetoEscaneo';
import { NOMBRE_ESPEJO, type EspejoBodega } from './duenoDeTienda';
import { RUTA_ESPEJO, anotarEscaneoPendiente, avisoDeSalto, otroEspejo, tomarEscaneoPendiente } from './saltoEntreBodegas';

const VERDE = '#16A34A', AMBAR = '#D97706', ROJO = '#D32F2F', AZUL = '#1D4ED8';

/** Cuánto espera la pantalla destino a que el pallet reenviado aparezca en su carga antes de
 *  tratarlo como uno de otro día. Cubre la primera carga de pallets y la del catálogo de tiendas. */
const ESPERA_REENVIO_MS = 6_000;

/** Un pallet que existe pero no está en la carga de hoy de esta pantalla. */
export interface PalletDeOtroDia {
  id: number;
  store_cod: string;
  tipo: string | null;
  date: string | null;
}

async function buscarFueraDeHoy(codigo: string): Promise<PalletDeOtroDia | null> {
  const q = supabase.from('picking_pallets').select('id, store_cod, tipo, date').limit(1);
  const { data } = await (/^\d+$/.test(codigo) ? q.eq('id', Number(codigo)) : q.in('canonical_id', variantesDeCodigo(codigo))).maybeSingle();
  return (data as PalletDeOtroDia | null) ?? null;
}

/**
 * El último borrado de esa etiqueta, si lo hubo. El borrado es físico, así que el único rastro es el
 * evento `eliminar` (con la copia de la fila en `datos` desde el 11/09/2026).
 */
async function buscarBorrado(codigo: string): Promise<PalletDeOtroDia | null> {
  const q = supabase.from('picking_eventos').select('pallet_id, store_cod, tipo')
    .eq('event_type', 'eliminar').order('created_at', { ascending: false }).limit(1);
  const { data } = await (/^\d+$/.test(codigo) ? q.eq('pallet_id', Number(codigo)) : q.in('datos->>canonical_id', variantesDeCodigo(codigo))).maybeSingle();
  const ev = data as { pallet_id: number | null; store_cod: string | null; tipo: string | null } | null;
  if (!ev?.pallet_id || !ev.store_cod) return null;
  return { id: ev.pallet_id, store_cod: ev.store_cod, tipo: ev.tipo, date: null };
}

export interface OpcionesEscaneo<Slot extends SlotDePallet> {
  activo: boolean;
  slotsPorTienda: Record<string, readonly Slot[]>;
  /** Qué decir de la unidad (ya pesada, sin pesar). */
  avisoDe: (p: PalletEncontrado<Slot>) => AvisoUnidad;
  /** Abrir la tienda y saltar a la tarjeta. `false` si esta pantalla no tiene esa tienda. */
  irA: (p: PalletEncontrado<Slot>) => boolean;
  /** Abrir el diálogo de preexistente con el número puesto. `false` si la tienda no es de esta pantalla.
   *  `borrado`: el pallet se eliminó; el diálogo lo comprueba solo y ofrece restaurarlo. */
  ofrecerPreexistente: (pallet: PalletDeOtroDia, codigo: string, borrado?: boolean) => boolean;
  showToast: (msg: string, color?: string) => void;
  /** La tienda está terminada: no se le agrega nada, ni siquiera un preexistente escaneado. */
  bloqueada?: (storeCod: string) => boolean;
  /** Traduce la clave con que ESTA pantalla indexa sus tiendas al código. Ver `buscarPallet`:
   *  RM/Costa indexa por código (identidad) y Nacional por nombre. */
  codDeClave: (clave: string) => string | undefined;
  /** `null` si la tienda es de esta bodega; si no, el aviso que dice en qué pestaña se pesa.
   *  Sin esto la pistola abría tiendas del otro espejo — ver `vetoEscaneo.ts`. */
  deOtraBodega?: (storeCod: string) => string | null;
  /** Qué espejo es esta pantalla. Con `navegar`, una etiqueta del otro lleva a la persona allá. */
  espejo?: EspejoBodega;
  /** Navegar a otra ruta guardando antes lo pendiente (el mismo camino que el botón Enrutador). */
  navegar?: (ruta: string) => void;
}

export function useEscaneoBodega<Slot extends SlotDePallet>(opts: OpcionesEscaneo<Slot>): void {
  const confirmacion = useRef(new ConfirmacionDoble());

  const { profile } = useAuth();

  /**
   * Llevar a la persona al otro espejo con esta lectura. `true` si se hizo cargo (se fue, o pidió
   * confirmar); `false` para que el llamador muestre el aviso rojo de siempre.
   */
  function llevarAlOtro(codigo: string, storeCod: string, palletId: number, reenviado: boolean, yaConfirmado: boolean): boolean {
    if (reenviado || !opts.espejo || !opts.navegar) return false;
    const destino = otroEspejo(opts.espejo);
    const ruta = RUTA_ESPEJO[destino];
    // Mismo criterio que `tabsPermitidos`: sin perfil cargado no se sabe, y el middleware decide.
    const permitidas = profile?.allowedPaths;
    if (permitidas && permitidas.length > 0 && !isPathAllowed([...permitidas], ruta)) return false;
    // Irse con una tarjeta a medio llenar la deja sin guardar: la misma doble lectura que al saltar
    // de tarjeta. El camino de hoy ya lo preguntó antes de llegar acá.
    if (!yaConfirmado) {
      if (tarjetaAMedias(-1) && !confirmacion.current.confirmar(codigo, Date.now())) {
        avisoFisico('aviso');
        opts.showToast(`Hay datos sin guardar en esta tarjeta. Guárdala, o escanea otra vez para ir a ${NOMBRE_ESPEJO[destino]} igual.`, AMBAR);
        return true;
      }
      confirmacion.current.olvidar();
    }
    anotarEscaneoPendiente(codigo, destino);
    avisoFisico('ok');
    opts.showToast(`#${palletId} · ${avisoDeSalto(storeCod, destino)}`, AZUL);
    opts.navegar(ruta);
    return true;
  }

  function procesar(codigo: string, reenviado: boolean) {
    const p = buscarPallet(opts.slotsPorTienda, codigo);
    if (!p) {
      void noEsDeHoy(codigo, reenviado);
      return;
    }
    if (tarjetaAMedias(p.slot.id) && !confirmacion.current.confirmar(codigo, Date.now())) {
      avisoFisico('aviso');
      opts.showToast('Hay datos sin guardar en esta tarjeta. Guárdala, o escanea otra vez para ir igual.', AMBAR);
      return;
    }
    confirmacion.current.olvidar();
    // Antes que nada: ¿es de esta bodega? La pistola llega a CUALQUIER tienda del día, y abrir
    // una del otro espejo deja la misma carga trabajada en los dos. Ver `vetoEscaneo.ts`.
    const deOtra = avisoSiEsDeOtraBodega(p.claveTienda, opts.codDeClave, opts.deOtraBodega);
    if (deOtra) {
      const cod = opts.codDeClave(p.claveTienda) ?? '';
      if (llevarAlOtro(codigo, cod, p.slot.id, reenviado, true)) return;
      avisoFisico('error');
      opts.showToast(`#${p.slot.id} · ${deOtra}`, ROJO);
      return;
    }
    const aviso = opts.avisoDe(p);
    if (!opts.irA(p)) {
      avisoFisico('error');
      opts.showToast(`El pallet #${p.slot.id} es de una tienda que no está en esta bodega.`, ROJO);
      return;
    }
    avisoFisico(aviso.advertir ? 'aviso' : 'ok');
    if (aviso.texto) opts.showToast(`#${p.slot.id} · ${aviso.texto}`, aviso.advertir ? AMBAR : VERDE);
  }

  useLectorBodega({
    activo: opts.activo,
    reconoce: codigo => !!buscarPallet(opts.slotsPorTienda, codigo),
    alEscanear: codigo => procesar(codigo, false),
  });

  // ── La lectura que llegó desde el otro espejo ──────────────────────────────────────────────────
  // Se toma una sola vez al montar. Se procesa apenas el pallet aparece en la carga de hoy; si no
  // aparece en `ESPERA_REENVIO_MS` (es de otro día, o se borró), se procesa igual y cae en los
  // caminos de siempre. Mientras haya un diálogo abierto (`activo` falso) espera.
  const reenvio = useRef<{ codigo: string; desde: number } | null | undefined>(undefined);
  const procesarRef = useRef(procesar);
  useEffect(() => { procesarRef.current = procesar; });
  useEffect(() => {
    if (reenvio.current === undefined) {
      const codigo = opts.espejo ? tomarEscaneoPendiente(opts.espejo) : null;
      reenvio.current = codigo ? { codigo, desde: Date.now() } : null;
    }
    const r = reenvio.current;
    if (!r || !opts.activo) return;
    const consumir = () => { reenvio.current = null; procesarRef.current(r.codigo, true); };
    if (buscarPallet(opts.slotsPorTienda, r.codigo)) { consumir(); return; }
    const t = setTimeout(() => { if (reenvio.current === r) consumir(); },
      Math.max(0, r.desde + ESPERA_REENVIO_MS - Date.now()));
    return () => clearTimeout(t);
  }, [opts.slotsPorTienda, opts.activo, opts.espejo]);

  async function noEsDeHoy(codigo: string, reenviado: boolean) {
    let pallet: PalletDeOtroDia | null = null;
    try { pallet = await buscarFueraDeHoy(codigo); } catch { /* sin conexión: cae al "no encontrada" */ }
    const deOtra = pallet ? opts.deOtraBodega?.(pallet.store_cod) : null;
    if (deOtra) {
      if (llevarAlOtro(codigo, pallet!.store_cod, pallet!.id, reenviado, false)) return;
      avisoFisico('error');
      opts.showToast(`#${pallet!.id} · ${deOtra}`, ROJO);
      return;
    }
    if (pallet && opts.bloqueada?.(pallet.store_cod)) {
      avisoFisico('error');
      opts.showToast(`Pallet #${pallet.id}: la tienda ${pallet.store_cod} está terminada. Reábrela para agregarlo.`, ROJO);
      return;
    }
    if (pallet && opts.ofrecerPreexistente(pallet, codigo)) {
      avisoFisico('aviso');
      opts.showToast(`Pallet #${pallet.id} no está en la carga de hoy. Confírmalo para agregarlo.`, AMBAR);
      return;
    }
    if (!pallet) {
      let borrado: PalletDeOtroDia | null = null;
      try { borrado = await buscarBorrado(codigo); } catch { /* sin conexión */ }
      const deOtraB = borrado ? opts.deOtraBodega?.(borrado.store_cod) : null;
      if (deOtraB) {
        if (llevarAlOtro(codigo, borrado!.store_cod, borrado!.id, reenviado, false)) return;
        avisoFisico('error');
        opts.showToast(`#${borrado!.id} · ${deOtraB}`, ROJO);
        return;
      }
      if (borrado && opts.bloqueada?.(borrado.store_cod)) {
        avisoFisico('error');
        opts.showToast(`Pallet #${borrado.id} fue eliminado y la tienda ${borrado.store_cod} está terminada. Reábrela para recuperarlo.`, ROJO);
        return;
      }
      if (borrado && opts.ofrecerPreexistente(borrado, codigo, true)) {
        avisoFisico('aviso');
        opts.showToast(`Pallet #${borrado.id} fue eliminado. Revisa si se puede recuperar.`, AMBAR);
        return;
      }
      if (borrado) pallet = borrado;
    }
    avisoFisico('error');
    opts.showToast(pallet
      ? `El pallet #${pallet.id} es de ${pallet.store_cod}, que no está en esta bodega.`
      : `Etiqueta ${codigo} no encontrada.`, ROJO);
  }
}
