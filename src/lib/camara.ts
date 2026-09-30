/**
 * [PWA · fase 4] Qué decirle a alguien cuando la cámara no abre.
 *
 * Hasta ahora los dos escáneres mostraban el `message` del navegador tal cual. En un patio, con
 * guantes, eso es un cartel que dice "The request is not allowed by the user agent or the platform
 * in the current context" — que además de estar en inglés no dice qué hacer.
 *
 * Importa más desde que la app se instala: al abrirla desde el ícono, iOS y Android la tratan como
 * un contexto aparte del navegador, así que el permiso de cámara que la persona ya había dado
 * NO viene heredado y se lo vuelven a pedir. Quien no sabe eso concluye que el escáner "se rompió
 * al instalar la app".
 */

/** Cómo está abierta la app. `standalone` es instalada, desde el ícono. */
export function esStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // `display-mode: standalone` es lo estándar. `navigator.standalone` es lo de Safari en iOS,
    // que es justamente donde más se nota el permiso pedido de nuevo.
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/**
 * El nombre del error, cuando lo hay. `getUserMedia` rechaza con un DOMException cuyo `name` es lo
 * que distingue los casos; el `message` cambia entre navegadores y no sirve para decidir.
 */
function nombreDe(e: unknown): string {
  if (e && typeof e === 'object' && 'name' in e && typeof (e as { name: unknown }).name === 'string') {
    return (e as { name: string }).name;
  }
  return '';
}

export interface MensajeCamara {
  titulo: string;
  /** Qué hacer. Vacío cuando no hay nada que la persona pueda hacer desde su lado. */
  comoArreglarlo: string;
}

/**
 * Traduce el fallo a algo accionable.
 *
 * `instalada` cambia solo el texto del permiso denegado, porque es el único caso donde la causa
 * probable es distinta: en el navegador es que alguien dijo que no; en la app instalada, lo más
 * común es que el permiso nunca se pidió en ESTE contexto.
 */
export function mensajeDeCamara(e: unknown, instalada = esStandalone()): MensajeCamara {
  switch (nombreDe(e)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return instalada
        ? {
            titulo: 'La app necesita permiso para usar la cámara',
            comoArreglarlo: 'Al abrirla desde el ícono, el permiso se pide de nuevo aunque ya lo hubieras dado en el navegador. Acepta el aviso, o habilita la cámara para esta app en los ajustes del teléfono.',
          }
        : {
            titulo: 'El navegador bloqueó la cámara',
            comoArreglarlo: 'Toca el candado de la barra de direcciones y permite la cámara para este sitio.',
          };

    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        titulo: 'No se encontró una cámara en este dispositivo',
        comoArreglarlo: 'Usa el ingreso manual, o prueba desde un equipo con cámara.',
      };

    case 'NotReadableError':
    case 'AbortError':
      return {
        titulo: 'La cámara está ocupada por otra app',
        comoArreglarlo: 'Cierra la otra app que la esté usando y vuelve a intentar.',
      };

    default:
      return { titulo: 'No se pudo abrir la cámara', comoArreglarlo: '' };
  }
}
