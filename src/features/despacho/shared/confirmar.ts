// Preguntar antes de algo que cuesta deshacer, con un aviso de la app en vez del confirm() del
// navegador.
//
// Existe por la revisión de accesibilidad del 22/10/2026. El confirm() del navegador sale en letra
// chica del sistema, con «Aceptar» y «Cancelar» sin decir qué aceptan, y en Android con el nombre
// del sitio arriba: quien pesa con guantes no sabe si «Aceptar» borra o guarda. Este aviso dice la
// acción en el botón («Eliminar P3», «Guardar así») y deja el foco en el botón que no hace nada.
//
// Es una cola de UNO: si llega un pedido con otro abierto, el abierto se responde «no». Sin
// `ConfirmarHost` montado (tests, una pantalla que no lo monta) cae al confirm() del navegador,
// así que nunca se pierde la pregunta.

export interface PedidoConfirmacion {
  /** La pregunta, corta: «¿Eliminar P3?». */
  titulo: string;
  /** Lo que conviene saber antes de responder. Admite saltos de línea. */
  detalle?: string;
  /** El botón que hace la acción, con verbo: «Eliminar», «Guardar así». */
  aceptar: string;
  /** El que no hace nada. «Cancelar» si no se dice otra cosa. */
  cancelar?: string;
  /** `peligro` pinta el botón de rojo (borra algo); `aviso`, de ámbar (sigue con algo raro). */
  tono?: 'normal' | 'aviso' | 'peligro';
}

export interface ConfirmacionAbierta extends PedidoConfirmacion {
  responder: (ok: boolean) => void;
}

type Host = (p: ConfirmacionAbierta | null) => void;
let host: Host | null = null;
let abierta: ConfirmacionAbierta | null = null;

/** El texto para el confirm() del navegador, cuando no hay aviso propio montado. */
export function textoPlano(p: PedidoConfirmacion): string {
  return [p.titulo, p.detalle].filter(Boolean).join('\n\n');
}

export function confirmar(p: PedidoConfirmacion): Promise<boolean> {
  if (!host) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(textoPlano(p)));
  }
  abierta?.responder(false);
  return new Promise<boolean>(resolve => {
    const esta: ConfirmacionAbierta = {
      ...p,
      responder: ok => {
        if (abierta !== esta) return; // ya respondida
        abierta = null;
        host?.(null);
        resolve(ok);
      },
    };
    abierta = esta;
    host!(esta);
  });
}

/** Lo llama `ConfirmarHost` al montarse. Devuelve con qué desmontarse. */
export function registrarHost(h: Host): () => void {
  host = h;
  return () => {
    if (host !== h) return;
    abierta?.responder(false);
    host = null;
  };
}
