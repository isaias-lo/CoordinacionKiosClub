// Horas REALES de salida y llegada del chofer, para validar el reloj del Enrutador. Puro y testeable.
//
// El flujo de entrega del chofer ya sacaba una foto del sello al llegar a cada tienda, con su hora.
// Pero esa hora solo quedaba guardada si se completaba la entrega entera — que incluye pedir un
// código por correo a la tienda. Si el chofer abandonaba ahí, la llegada se perdía. Y la salida del
// CD ("Confirmar salida") cambiaba el estado de la ruta pero no guardaba la hora.
//
// Ahora las dos quedan en `ruta_eventos` en el momento en que ocurren: la salida al confirmarla, y
// la llegada apenas se escanea la tienda, con la hora de la foto del sello (el escaneo viene después).

interface RutaChofer { id: number; estado?: string | null; ruta_tiendas: { store_cod: string }[] }

const norm = (s: string) => String(s ?? '').trim().toUpperCase();

/**
 * La ruta del chofer que incluye esa tienda. Si está en dos (un camión que hace dos vueltas), manda
 * la que ya salió: la llegada es de esa vuelta. Si no está en ninguna, null — no se inventa una ruta.
 */
export function rutaDeTienda(rutas: RutaChofer[], storeCod: string): number | null {
  const cod = norm(storeCod);
  const con = rutas.filter(r => r.ruta_tiendas.some(t => norm(t.store_cod) === cod));
  if (!con.length) return null;
  return (con.find(r => r.estado === 'en_camino') ?? con[0]).id;
}

export interface EventoRuta {
  ruta_id: number | null;
  tipo: 'llegada' | 'salida';
  datos: Record<string, string | null>;
}

/**
 * Llegada a una tienda. La hora es la de la FOTO del sello, no la del escaneo. Sin ruta encontrada
 * igual se guarda —la columna admite nulo—, con la tienda y la patente: la hora sirve igual.
 */
export function eventoLlegada(a: { rutaId: number | null; storeCod: string; horaISO: string; patente: string }): EventoRuta {
  return {
    ruta_id: a.rutaId, tipo: 'llegada',
    datos: { store_cod: norm(a.storeCod), hora: a.horaISO, patente: a.patente || null, fuente: 'sello_llegada' },
  };
}

/** Salida del CD, al confirmarla en /conductor-hub. */
export function eventoSalida(a: { rutaId: number; horaISO: string; patente: string }): EventoRuta {
  return {
    ruta_id: a.rutaId, tipo: 'salida',
    datos: { hora: a.horaISO, patente: a.patente || null, fuente: 'confirmar_salida' },
  };
}
