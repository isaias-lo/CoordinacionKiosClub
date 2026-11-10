// La campana de avisos: un solo lugar para lo que antes eran franjas apiladas arriba de la pantalla.
//
// Por qué (Isaias, 10/11/2026): en el teléfono los avisos de «sin registrar», «faltan datos de la
// tienda», etc. se comían la vista. Ahora cada aviso se ANOTA acá y lo muestra la campana de la
// cabecera, con un contador que toma el color del aviso más grave.
//
// Qué NO va a la campana, a propósito: lo que es peligroso esconder mientras se trabaja. Sin
// conexión (`EstadoConexion`), la versión nueva (`AvisoVersionNueva`, que nunca recarga sola a
// mitad de una carga), la pantalla abierta desde ayer (`AvisoDiaViejo`), la banda del día elegido,
// los avisos DENTRO de la tienda abierta y los toasts. Esos siguen donde estaban.
//
// Si en la pantalla no hay ninguna campana montada (la vista clásica del Enrutador, por ejemplo),
// `EnCampana` dibuja el aviso donde siempre: un aviso nunca desaparece por falta de campana.

export type NivelAviso = 'error' | 'aviso' | 'info';

export interface AvisoCampana {
  id: string;
  nivel: NivelAviso;
  /** Una línea; es lo que lee el lector de pantalla y lo que dice el contador al pasar el dedo. */
  titulo: string;
  /** Nodo donde `EnCampana` dibuja el aviso con un portal. La campana lo cuelga en su panel. */
  nodo: HTMLElement | null;
  /** Orden de llegada, para desempatar dentro del mismo nivel. */
  orden: number;
}

const PESO: Record<NivelAviso, number> = { error: 0, aviso: 1, info: 2 };

/** Primero lo más grave; dentro del mismo nivel, el que llegó antes. */
export function ordenarAvisos<T extends Pick<AvisoCampana, 'nivel' | 'orden'>>(avisos: readonly T[]): T[] {
  return [...avisos].sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.orden - b.orden);
}

/** El nivel más grave de la lista, o null si no hay avisos. Da el color del contador. */
export function nivelMaximo(avisos: readonly Pick<AvisoCampana, 'nivel'>[]): NivelAviso | null {
  let max: NivelAviso | null = null;
  for (const a of avisos) if (max === null || PESO[a.nivel] < PESO[max]) max = a.nivel;
  return max;
}

/** Lo que dice el botón de la campana a quien no la ve. */
export function etiquetaCampana(n: number): string {
  if (n === 0) return 'Avisos: no hay ninguno';
  return n === 1 ? 'Avisos: hay 1' : `Avisos: hay ${n}`;
}

/** El número del contador; sobre 9 no cabe en el círculo. */
export function textoContador(n: number): string {
  return n > 9 ? '9+' : String(n);
}

/** Si el contador tiene que llamar la atención: solo cuando SUBE (llegó un aviso nuevo). */
export function llegoAvisoNuevo(antes: readonly string[], ahora: readonly string[]): boolean {
  const vistos = new Set(antes);
  return ahora.some(id => !vistos.has(id));
}

// ── El almacén ──────────────────────────────────────────────────────────────────────────────────
// Un módulo y no un Context: los avisos nacen en pantallas que no comparten proveedor (Bodega,
// Picking, Enrutador) y la campana vive en cabeceras distintas. `useSyncExternalStore` lo lee.

export interface EstadoCampana {
  avisos: AvisoCampana[];
  /** Campanas montadas ahora. Con 0, los avisos se dibujan en su sitio de siempre. */
  campanas: number;
  abierta: boolean;
}

export function crearAlmacenCampana() {
  let estado: EstadoCampana = { avisos: [], campanas: 0, abierta: false };
  let siguiente = 0;
  const oyentes = new Set<() => void>();
  const cambiar = (nuevo: EstadoCampana) => { estado = nuevo; oyentes.forEach(f => f()); };

  return {
    leer: () => estado,
    suscribir(f: () => void) { oyentes.add(f); return () => { oyentes.delete(f); }; },

    /** Anota (o reemplaza, si el id ya está) un aviso. Devuelve cómo quitarlo. */
    anotar(a: Omit<AvisoCampana, 'orden'>): () => void {
      const previo = estado.avisos.find(x => x.id === a.id);
      const orden = previo?.orden ?? siguiente++;
      const nuevo: AvisoCampana = { ...a, orden };
      cambiar({ ...estado, avisos: ordenarAvisos([...estado.avisos.filter(x => x.id !== a.id), nuevo]) });
      // Se quita un instante después y solo si sigue siendo ESTE. Cuando cambia el título (p. ej.
      // «2 días» → «1 día» tras registrar uno desde el panel), React limpia el efecto viejo y
      // enseguida anota el nuevo: quitarlo en el acto cerraba el panel y lo mandaba al final.
      return () => queueMicrotask(() => {
        if (!estado.avisos.some(x => x === nuevo)) return;
        const avisos = estado.avisos.filter(x => x !== nuevo);
        cambiar({ ...estado, avisos, abierta: estado.abierta && avisos.length > 0 });
      });
    },

    montarCampana(): () => void {
      cambiar({ ...estado, campanas: estado.campanas + 1 });
      return () => cambiar({ ...estado, campanas: Math.max(0, estado.campanas - 1), abierta: false });
    },

    abrir(abierta: boolean) { if (estado.abierta !== abierta) cambiar({ ...estado, abierta }); },
  };
}

export const almacenCampana = crearAlmacenCampana();

/** Para los botones de un aviso que llevan a otra parte (un modal, otro día): cerrar el panel. */
export function cerrarCampana() { almacenCampana.abrir(false); }
