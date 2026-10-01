import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { isDataRow, makeRmMapper, makeRegionesMapper, missingHeaders, soloDelDia, aFechaDeHoja, RM_HEADERS, REGIONES_HEADERS } from './parseRows';
import { repartirCongelados } from './congelados';
import { isRegionesCod } from '@/features/despacho/regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '@/features/despacho/santiago/data/tiendasSantiago';
import { construirCruceDelDia } from '@/lib/crucePesosDia';
import { escribirCruce } from '@/lib/crucePesosSheet';

// Leer tres hojas, escribir dos tablas y —cuando se pide— armar y escribir el cruce completo pasa
// de largo los 10 s por defecto. Sin esto la función se corta a la mitad y el trabajo se pierde sin
// dejar rastro en ninguna parte.
export const maxDuration = 60;

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return JSON.parse(clean);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// DESPACHO RM/REGIONES ahora se leen por NOMBRE de encabezado (ver ./parseRows), no por
// posición → las columnas se pueden reordenar sin cruzar datos.

/** Una hoja que todavía no existe no es un error: se sincroniza lo que sí está. */
async function leerHoja(gs: ReturnType<typeof google.sheets>, range: string): Promise<(string | number)[][]> {
  try {
    const r = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    return (r.data.values ?? []) as (string | number)[][];
  } catch (err) {
    console.warn(`[sync-despacho] no se pudo leer "${range}":`, err instanceof Error ? err.message : err);
    return [];
  }
}

// POST /api/sync-despacho
// Reads DESPACHO RM, DESPACHO REGIONES and DESPACHO CONGELADOS from Google Sheets and upserts
// into Supabase. Uses ignoreDuplicates so existing seguimiento values are preserved.
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // EL CRUCE SE ESCRIBE ACÁ, NO DESDE EL NAVEGADOR.
  //
  // Antes el modal de REGISTRAR encadenaba tres cosas en el cliente:
  //
  //     sheetsWrite  →  fetch(sync-despacho)  →  fetch(cruce-pesos)
  //
  // y el tercer eslabón SOLO SE EMITE si el segundo resolvió. Si la persona navega apenas registra
  // —que es lo normal— la pestaña se va antes y esa petición no llega a salir nunca: `keepalive`
  // protege lo que ya se envió, no lo que todavía no se envió. Y el `.catch(() => {})` del final
  // se tragaba cualquier fallo, así que nadie se enteraba. El 29/09 el registro de RM/Costa quedó
  // bien en la base y la hoja se quedó vacía.
  //
  // Con la fecha en el body, el orden lo garantiza el servidor: primero sincroniza —que es lo que
  // llena `despacho_rm` / `despacho_regiones`— y recién después arma el cruce, que las lee. Una
  // sola petición del cliente, con keepalive, y ninguna cadena que se pueda cortar.
  // `cruce` sigue aceptado para no romper a una pestaña que todavía no se recargó. `dia` es lo
  // nuevo: limita el volcado a esa jornada. Sin ninguno de los dos se sincroniza TODO, que es lo
  // que hace el botón manual «Sincronizar». Ver `soloDelDia`.
  let cruceFecha: string | null = null;
  let diaDeHoja: string | null = null;
  try {
    const body = await request.json() as { cruce?: unknown; dia?: unknown };
    const f = body?.cruce;
    if (typeof f === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f)) cruceFecha = f;
    diaDeHoja = aFechaDeHoja(body?.dia ?? body?.cruce);
  } catch { /* sin body: sincroniza todo, como siempre */ }

  try {
    const auth = await getAuth();
    const gs   = google.sheets({ version: 'v4', auth });
    const sb   = supabaseServer();

    // La 1ª fila es el encabezado → mapeo por nombre; el resto son filas de datos.
    const [rmValues, regValues, congValues] = await Promise.all([
      leerHoja(gs, 'DESPACHO RM'),
      leerHoja(gs, 'DESPACHO REGIONES'),
      leerHoja(gs, 'DESPACHO CONGELADOS'),
    ]);

    // Aviso si alguna columna esperada cambió de nombre (esos campos caerían a fallback posicional).
    const rmMiss  = missingHeaders(rmValues[0]  ?? [], RM_HEADERS);
    const regMiss = missingHeaders(regValues[0] ?? [], REGIONES_HEADERS);
    if (rmMiss.length)  console.warn('[sync-despacho] DESPACHO RM: encabezados no encontrados (fallback posicional):', rmMiss);
    if (regMiss.length) console.warn('[sync-despacho] DESPACHO REGIONES: encabezados no encontrados (fallback posicional):', regMiss);

    // Con `dia`, solo esa jornada. El REGISTRAR mandaba la planilla ENTERA — 8.986 filas y 4,66 MB
    // el 30/09, creciendo a diario — para insertar las ~230 del día. Ver `soloDelDia`.
    const rmRecords  = soloDelDia(rmValues.filter(isDataRow).map(makeRmMapper(rmValues[0] ?? [])), diaDeHoja);
    const regRecords = soloDelDia(regValues.filter(isDataRow).map(makeRegionesMapper(regValues[0] ?? [])), diaDeHoja);

    // ── DESPACHO CONGELADOS: una hoja, dos tablas ──────────────────────────────
    // La hoja usa los mismos encabezados que DESPACHO RM (se creó copiándolos), así que se parsea
    // con el mapper de RM. Lo que cambia es el destino: cada fila va a la tabla de su catálogo.
    // Sin esto, la hoja sería el ÚNICO lugar donde viven esos datos y la base dependería solo del
    // espejo directo — que es justo lo que falló durante meses (PR #492).
    const congRecords = soloDelDia(congValues.filter(isDataRow).map(makeRmMapper(congValues[0] ?? [])), diaDeHoja);
    const cong = repartirCongelados(
      congRecords,
      cod => isRegionesCod(cod),
      cod => getTiendaSantiagoByCod(cod) !== undefined,
    );
    if (cong.huerfanos.length) {
      console.warn('[sync-despacho] congelados sin catálogo (no se sincronizan):', [...new Set(cong.huerfanos)]);
    }

    const errors: string[] = [];

    const todosRm  = [...rmRecords,  ...cong.rm];
    const todosReg = [...regRecords, ...cong.regiones];

    if (todosRm.length > 0) {
      const { error } = await sb.from('despacho_rm')
        .upsert(todosRm, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`RM: ${error.message}`);
    }

    if (todosReg.length > 0) {
      const { error } = await sb.from('despacho_regiones')
        .upsert(todosReg, { onConflict: 'id', ignoreDuplicates: true });
      if (error) errors.push(`Regiones: ${error.message}`);
    }

    // Después del upsert, nunca antes: el cruce lee `despacho_rm` / `despacho_regiones` y hasta acá
    // esas tablas no tienen lo que se acaba de registrar. Un fallo del cruce NO invalida la
    // sincronización —el día registrado es lo que importa— pero SÍ se informa, para que deje de
    // ser invisible.
    let cruce: { ok: boolean; agregadas?: number; actualizadas?: number; error?: string } | undefined;
    if (cruceFecha) {
      try {
        const r = await escribirCruce(await construirCruceDelDia(cruceFecha));
        cruce = { ok: true, agregadas: r.agregadas, actualizadas: r.actualizadas };
      } catch (err) {
        console.error('[sync-despacho] cruce', err);
        cruce = { ok: false, error: String(err).slice(0, 200) };
      }
    }

    return NextResponse.json({
      ok:      errors.length === 0,
      rm:      rmRecords.length,
      regiones: regRecords.length,
      congelados: { rm: cong.rm.length, regiones: cong.regiones.length, huerfanos: cong.huerfanos.length },
      errors,
      ...(cruce ? { cruce } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
