import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * ¿Hay clave de servicio? Las rutas que dependen de saltarse RLS pueden decirlo en su respuesta.
 *
 * Existe porque sin ella el diagnóstico es imposible desde afuera: la app responde 200, con datos,
 * y simplemente le faltan filas.
 */
export function hayServiceRole(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function getKey() {
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (servicio) return servicio;
  // Caer a la clave pública NO es equivalente y el silencio es lo peligroso: una tabla con RLS
  // activo y SIN políticas —`rutas_despacho` es exactamente ese caso— devuelve CERO filas sin
  // error. Quien llama lo lee como "no hay nada", que es una respuesta perfectamente creíble.
  //
  // Ya costó caro una vez: el backlog de 2ª vuelta mostró 164 pendientes donde había 15, porque
  // consultaba esa tabla sin poder verla. Por eso acá se GRITA en vez de seguir como si nada.
  console.error(
    '[supabaseServer] FALTA SUPABASE_SERVICE_ROLE_KEY. Se usa la clave pública: las tablas con RLS '
    + 'y sin política (p. ej. rutas_despacho) van a devolver VACÍO sin error, y los cálculos que '
    + 'dependan de ellas van a dar resultados incompletos que parecen correctos.',
  );
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

export function supabaseServer() {
  return createClient(url, getKey(), {
    auth: { persistSession: false },
  });
}
