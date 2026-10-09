/**
 * POST a `/api/sheets-write` que SÍ dice si funcionó.
 *
 * Nacional y RM/Costa hacían `fetch(...).then(() => undefined).catch(console.error)`: la promesa
 * se resolvía igual con un 401 (sesión vencida), un 500 (Sheets caído) o sin red. Quien llamaba
 * marcaba el día o la tienda como registrados y mostraba «✓ Guardado» sobre una planilla que no
 * recibió nada, y el aviso de «sin registrar» ya no volvía a salir. Congelados ya revisaba la
 * respuesta; esto lleva lo mismo a los otros dos.
 *
 * Rechaza si la planilla no se escribió, con el motivo que mandó el servidor. Si la planilla sí se
 * escribió pero la copia en la base falló, resuelve y lo dice en `mirrorErrores`: lo registrado
 * está en la hoja, y la sincronización del día la vuelve a pasar a la base.
 */
export interface ResultadoPlanilla { mirrorErrores: string[] }

export async function escribirPlanilla(
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoPlanilla> {
  const res = await fetchImpl('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json().catch(() => null) as { error?: string; mirrorErrores?: string[] } | null;
  if (!res.ok) throw new Error(motivoDeFalla(res.status, json?.error));
  return { mirrorErrores: json?.mirrorErrores ?? [] };
}

/** El texto que ve la persona. Un 401 casi siempre es la sesión vencida en una handheld dormida. */
export function motivoDeFalla(status: number, error?: string): string {
  if (status === 401) return 'la sesión venció, vuelve a entrar';
  return error || `error ${status} del servidor`;
}

/** Mensaje para un `catch` de registrar: sin red, `fetch` rechaza con un TypeError sin motivo útil. */
export function avisoNoRegistrado(e: unknown): string {
  const motivo = e instanceof TypeError ? 'sin conexión' : e instanceof Error ? e.message : String(e);
  return `No se registró (${motivo}). Reintenta`;
}
