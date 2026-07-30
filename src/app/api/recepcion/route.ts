import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';
import { upsertTrazabilidadSheet } from '@/lib/sheetsTraza';
import { verifyOtpToken } from '@/lib/otpToken';
import { verifyAnyUser } from '@/lib/apiAuth';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';
import { parseBody, RecepcionSchema } from '@/lib/schemas';
import { parseDataUrl, acuseLabel, RECEP_MAX_FOTOS } from '@/lib/recepcionMedia';
import { buildSheetRow } from '@/lib/sheetRow';
import { nuevoSeguimientoRecepcion, elegirFechaDespacho, hayDiferencia, type DespachoCandidato } from '@/lib/recepcionEstado';
import { buildEdicionEntry, type EdicionEntry } from '@/lib/recepcionAudit';

interface RecepcionBody {
  cod: string;
  tienda: string;
  direccion: string;
  palletsSent: number;
  bultosSent: number;
  contenedoresSent: number;
  palletsRecibidos: number;
  bultosRecibidos: number;
  contenedoresRecibidos: number;
  conductor?: string;
  pionetas?: string;
  receptor: string;
  rut: string;
  signatureDataUrl?: string;
  // Acuse de recibo (reemplaza la firma obligatoria)
  recibiConforme?: boolean;
  firmaMetodo?: string;
  // Fotos de recepción (data URLs base64 → se suben a `recepcion-fotos`)
  recepcionFotos?: string[];
  // Origen del registro: 'tienda' = recepción de la tienda (QR+OTP) → hoja RECEPCIÓN/TIENDA.
  // Cualquier otro (chofer) → hoja ENTREGA/TIENDA. Solo decide la hoja destino.
  origen?: string;
  // Auth fields for conductor OTP flow
  otpToken?: string;
  otpEmail?: string;
  observaciones?: string;
  selloEstado?: string;
  selloLlegadaUrl?: string;
  selloLlegadaHora?: string;
  selloSalidaUrl?: string;
  selloSalidaHora?: string;
  cdSalidaUrl?: string;
  cdSalidaHora?: string;
  estadoFotoUrls?: string[];
  codigoVerificacion?: string;
  canonicalId?: string;
  // Trazabilidad PUNTO 3
  tipoIncidencia?: string;
  temperaturaLlegada?: number;
  usuarioRecepcion?: string;
  regimen?: string;
  // Idempotencia + edición con auditoría (PR C2)
  clientOpId?: string;
  editar?: boolean;
  recepcionId?: number;
}

/** Fila previa cargada para editar (con auditoría + validación de ownership). */
interface PrevRecepcion {
  pallets_recibidos: number | null;
  bultos_recibidos: number | null;
  contenedores_recibidos: number | null;
  acuse_recibo: string | null;
  observaciones: string | null;
  recepcion_fotos: string[] | null;
  ediciones: number | null;
  historial_ediciones: EdicionEntry[] | null;
  cod: string | null;
  fuente: string | null;
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function todayFecha(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Fecha (DD/MM/YYYY) del despacho que una recepción debe actualizar, mirando rm y regiones.
 *  El armado puede ocurrir un día distinto al de la recepción, así que no asumimos "hoy".
 *  La elección (activo más avanzado / más reciente) vive pura en `elegirFechaDespacho`. */
async function fechaDespachoParaRecepcion(
  sb: ReturnType<typeof supabaseServer>,
  cod: string,
): Promise<string | null> {
  const [{ data: rm }, { data: reg }] = await Promise.all([
    sb.from('despacho_rm').select('fecha, seguimiento, created_at').eq('cod', cod).order('created_at', { ascending: false }).limit(20),
    sb.from('despacho_regiones').select('fecha, seguimiento, created_at').eq('cod', cod).order('created_at', { ascending: false }).limit(20),
  ]);
  return elegirFechaDespacho([...(rm ?? []), ...(reg ?? [])] as DespachoCandidato[]);
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no configurado');
  const clean = raw.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(clean),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// Escribe por NOMBRE de encabezado (no por posición): lee la fila 1 de la hoja y alinea
// cada valor a su columna. Así las columnas se pueden reordenar sin cruzar datos.
async function writeToSheet(sheetName: string, record: Record<string, string | number>) {
  const auth = getAuth();
  const gs   = google.sheets({ version: 'v4', auth });
  let headers: string[] = [];
  try {
    const hdr = await gs.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range:         `${sheetName}!1:1`,
    });
    headers = (hdr.data.values?.[0] as string[] | undefined) ?? [];
  } catch { headers = []; }
  await gs.spreadsheets.values.append({
    spreadsheetId:    SPREADSHEET_ID,
    range:            `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [buildSheetRow(headers, record)] },
  });
}

/**
 * GET /api/recepcion?cod=XX — ¿ya recibió esta tienda hoy?
 * Devuelve la recepción de la tienda (fuente='tienda') más reciente de HOY para armar la
 * pantalla "Ya fue recibido" + permitir editar. NO expone receptor/rut de la persona anterior
 * (accountability: al editar se re-identifica). Público (flujo de recepción por QR).
 */
export async function GET(request: NextRequest) {
  if (!checkRateLimit(`recepcion-get:${getClientIp(request)}`, { max: 60, windowMs: 600_000 }))
    return tooManyRequests();
  const cod = new URL(request.url).searchParams.get('cod')?.trim();
  if (!cod) return NextResponse.json({ data: null });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabaseServer()
    .from('recepcion')
    .select('id, cod, tienda, pallets_sent, bultos_sent, contenedores_sent, pallets_recibidos, bultos_recibidos, contenedores_recibidos, acuse_recibo, observaciones, created_at, editado_en, ediciones')
    .eq('cod', cod)
    .eq('fuente', 'tienda')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ data: data ?? null });
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`recepcion:${getClientIp(request)}`, { max: 20, windowMs: 600_000 }))
    return tooManyRequests();

  try {
    const parsed = parseBody(RecepcionSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as RecepcionBody;
    const sb = supabaseServer();

    // Auth: accept OTP verification, Bearer token, or a cod with an active dispatch today
    const hasOtp = body.otpToken && body.otpEmail && body.codigoVerificacion;
    if (hasOtp) {
      if (!verifyOtpToken(body.otpToken!, body.otpEmail!, body.codigoVerificacion!)) {
        return NextResponse.json({ error: 'Código de verificación inválido o expirado' }, { status: 401 });
      }
    } else if (await verifyAnyUser(request)) {
      // Authenticated app user — allow
    } else {
      // Conductor QR flow: validate cod has an active dispatch for today
      const fechaHoy = todayFecha();
      const [{ data: rm }, { data: reg }] = await Promise.all([
        sb.from('despacho_rm').select('cod').eq('cod', body.cod).eq('fecha', fechaHoy).limit(1).maybeSingle(),
        sb.from('despacho_regiones').select('cod').eq('cod', body.cod).eq('fecha', fechaHoy).limit(1).maybeSingle(),
      ]);
      if (!rm && !reg) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    // Idempotencia: si este client_op_id ya se procesó (reintento / doble tap), NO se crea
    // un duplicado — se devuelve el registro existente. La garantía dura la da el índice único
    // parcial en Supabase (ver más abajo el manejo de la violación 23505 en el INSERT).
    if (body.clientOpId) {
      const { data: yaExiste } = await sb
        .from('recepcion')
        .select('id')
        .eq('client_op_id', body.clientOpId)
        .limit(1)
        .maybeSingle();
      if (yaExiste) return NextResponse.json({ ok: true, id: yaExiste.id, duplicate: true });
    }

    // Edición: cargar la fila previa y VALIDAR antes de subir fotos (evita fotos huérfanas en
    // reintentos + valida ownership: solo la MISMA tienda puede editar SU recepción).
    let prevEdit: PrevRecepcion | null = null;
    if (body.editar && body.recepcionId) {
      const { data: prev, error: prevErr } = await sb
        .from('recepcion')
        .select('pallets_recibidos, bultos_recibidos, contenedores_recibidos, acuse_recibo, observaciones, recepcion_fotos, ediciones, historial_ediciones, cod, fuente')
        .eq('id', body.recepcionId)
        .maybeSingle();
      if (prevErr) throw new Error(prevErr.message);
      if (!prev) return NextResponse.json({ error: 'Recepción a editar no encontrada' }, { status: 404 });
      // Ownership: la fila debe ser de la MISMA tienda (cod) y una recepción de tienda.
      if (prev.cod !== body.cod || prev.fuente !== 'tienda') {
        return NextResponse.json({ error: 'No autorizado a editar esta recepción' }, { status: 403 });
      }
      // Idempotencia de la edición: si esta misma operación ya se aplicó, no repetir.
      const historialPrev = (prev.historial_ediciones as EdicionEntry[] | null) ?? [];
      if (body.clientOpId && historialPrev.some(e => e.clientOpId === body.clientOpId)) {
        return NextResponse.json({ ok: true, id: body.recepcionId, duplicate: true });
      }
      prevEdit = prev as PrevRecepcion;
    }

    // La firma dibujada se eliminó: el acuse de recibo (recibiConforme) + el OTP al correo
    // de la tienda son la confirmación. firma_url queda vacío en registros nuevos.

    // Fotos de recepción: llegan como data URLs base64 y se suben (service role) al
    // bucket público `recepcion-fotos`. Server-mediated para no depender de sesión anónima.
    const recepcionFotoUrls: string[] = [];
    for (const [i, dataUrl] of (body.recepcionFotos ?? []).slice(0, RECEP_MAX_FOTOS).entries()) {
      const foto = parseDataUrl(dataUrl);
      if (!foto) continue;
      const buf = Buffer.from(foto.base64, 'base64');
      const fname = `recep_${body.cod}_${Date.now()}_${i + 1}.${foto.ext}`;
      const { error: fErr } = await sb.storage
        .from('recepcion-fotos')
        .upload(fname, buf, { contentType: foto.contentType, upsert: false });
      if (fErr) throw new Error(fErr.message);
      recepcionFotoUrls.push(sb.storage.from('recepcion-fotos').getPublicUrl(fname).data.publicUrl);
    }

    // Auto-diferencia (defensa server-side): si la tienda recibió distinto a lo enviado, la
    // recepción NO puede quedar 'conforme' aunque el cliente lo mande (p.ej. cola offline con
    // estado viejo). Se fuerza el acuse a "con observaciones".
    if (body.origen === 'tienda' && hayDiferencia(
      { pallets: body.palletsSent      ?? 0, bultos: body.bultosSent      ?? 0, contenedores: body.contenedoresSent      ?? 0 },
      { pallets: body.palletsRecibidos ?? 0, bultos: body.bultosRecibidos ?? 0, contenedores: body.contenedoresRecibidos ?? 0 },
    )) {
      body.recibiConforme = false;
    }

    const acuse = typeof body.recibiConforme === 'boolean' ? acuseLabel(body.recibiConforme) : '';

    let recepcionId: number;
    let fotosFinal = recepcionFotoUrls;
    let esEdicion  = false;
    let numEdicion = 0;

    if (body.editar && body.recepcionId && prevEdit) {
      // ── EDICIÓN con auditoría ────────────────────────────────────────────────
      // `prevEdit` ya fue cargado y validado (ownership + idempotencia) antes de subir fotos.
      // Se re-identificó la persona (receptor+rut del body). NO se sobreescribe el receptor/rut
      // ORIGINAL — cada edición registra SU propia persona + cambios en historial_ediciones.
      // Los contenedores conservan el valor previo si el cliente no los envía (no pisar a 0).
      const contenedoresEd = body.contenedoresRecibidos ?? prevEdit.contenedores_recibidos ?? 0;

      const entry: EdicionEntry = buildEdicionEntry({
        clientOpId: body.clientOpId,
        prev: {
          pallets_recibidos:      prevEdit.pallets_recibidos,
          bultos_recibidos:       prevEdit.bultos_recibidos,
          contenedores_recibidos: prevEdit.contenedores_recibidos,
          acuse_recibo:           prevEdit.acuse_recibo,
          observaciones:          prevEdit.observaciones,
        },
        next: {
          pallets_recibidos:      body.palletsRecibidos,
          bultos_recibidos:       body.bultosRecibidos,
          contenedores_recibidos: contenedoresEd,
          acuse_recibo:           acuse,
          observaciones:          body.observaciones ?? '',
        },
        receptor: body.receptor,
        rut:      body.rut,
      });

      const historial = [...(prevEdit.historial_ediciones ?? []), entry];
      fotosFinal      = [...(prevEdit.recepcion_fotos ?? []), ...recepcionFotoUrls];
      numEdicion      = (prevEdit.ediciones ?? 0) + 1;
      esEdicion       = true;

      const { error: updErr } = await sb.from('recepcion').update({
        pallets_recibidos:      body.palletsRecibidos,
        bultos_recibidos:       body.bultosRecibidos,
        contenedores_recibidos: contenedoresEd,
        observaciones:          body.observaciones ?? '',
        recibi_conforme:        typeof body.recibiConforme === 'boolean' ? body.recibiConforme : null,
        acuse_recibo:           acuse,
        recepcion_fotos:        fotosFinal,
        editado_en:             new Date().toISOString(),
        ediciones:              numEdicion,
        historial_ediciones:    historial,
      }).eq('id', body.recepcionId);
      if (updErr) throw new Error(updErr.message);
      recepcionId = body.recepcionId;
    } else {
      // ── INSERT (primera recepción) ───────────────────────────────────────────
      const filaBase = {
        cod:                  body.cod,
        tienda:               body.tienda,
        direccion:            body.direccion,
        pallets_sent:            body.palletsSent,
        bultos_sent:             body.bultosSent,
        contenedores_sent:       body.contenedoresSent      ?? 0,
        pallets_recibidos:       body.palletsRecibidos,
        bultos_recibidos:        body.bultosRecibidos,
        contenedores_recibidos:  body.contenedoresRecibidos ?? 0,
        conductor:            body.conductor ?? '',
        pionetas:             body.pionetas  ?? '',
        receptor:             body.receptor,
        rut:                  body.rut,
        firma_url:            '',
        observaciones:        body.observaciones        ?? '',
        sello_estado:         body.selloEstado           ?? '',
        sello_llegada_url:    body.selloLlegadaUrl       ?? '',
        sello_llegada_hora:   body.selloLlegadaHora      ?? '',
        sello_salida_url:     body.selloSalidaUrl        ?? '',
        sello_salida_hora:    body.selloSalidaHora       ?? '',
        cd_salida_url:        body.cdSalidaUrl           ?? '',
        cd_salida_hora:       body.cdSalidaHora          ?? '',
        estado_fotos:         body.estadoFotoUrls        ?? [],
        recepcion_fotos:      recepcionFotoUrls,
        recibi_conforme:      typeof body.recibiConforme === 'boolean' ? body.recibiConforme : null,
        acuse_recibo:         acuse,
        firma_metodo:         body.firmaMetodo           ?? '',
        codigo_verificacion:  body.codigoVerificacion    ?? '',
        canonical_id:         body.canonicalId           ?? null,
        // Origen del registro: la tienda (QR+OTP) → 'tienda'; el chofer/entrega → 'conductor'.
        // (Antes estaba hardcodeado a 'conductor', lo que hacía inalcanzable 'Diferencia'/'Recibido'.)
        fuente:               body.origen === 'tienda' ? 'tienda' : 'conductor',
      };

      let ins = await sb.from('recepcion').insert({ ...filaBase, client_op_id: body.clientOpId ?? null }).select('id').single();

      // #2 Tolerancia si la migración aún no corrió (columna client_op_id inexistente): reintenta
      //    sin ella para no romper TODA recepción. (Insurance; la migración DEBE correr antes del deploy.)
      if (ins.error && /client_op_id/i.test(ins.error.message)) {
        ins = await sb.from('recepcion').insert(filaBase).select('id').single();
      }

      // #6 Idempotencia a nivel DB: si el índice único parcial rechaza un duplicado concurrente
      //    (23505), devolvemos el registro ya existente en vez de un 500 crudo.
      if (ins.error && (ins.error as { code?: string }).code === '23505' && body.clientOpId) {
        const { data: ya } = await sb.from('recepcion').select('id').eq('client_op_id', body.clientOpId).limit(1).maybeSingle();
        if (ya) return NextResponse.json({ ok: true, id: ya.id, duplicate: true });
      }

      if (ins.error) throw new Error(ins.error.message);
      recepcionId = ins.data!.id as number;
    }

    // Link a la galería pública de fotos de recepción (para la columna del Sheet).
    const origin = new URL(request.url).origin;
    const galeriaUrl = fotosFinal.length && recepcionId
      ? `${origin}/recepcion/galeria/${recepcionId}`
      : '';

    // Auto-transición del seguimiento (lógica pura en recepcionEstado.ts):
    //  - origen 'tienda' (la tienda confirma): compara enviado vs recibido (mismo registro)
    //    → 'Recibido' si coincide, 'Diferencia' si no.
    //  - chofer/entrega: si la tienda YA registró recepción hoy se respeta ese resultado;
    //    si no, 'Entregado'.
    const esTienda = body.origen === 'tienda';

    // Solo el caso chofer necesita la recepción previa de la TIENDA (si existe hoy).
    let recibidoTiendaPrevio: { pallets: number; bultos: number; contenedores: number } | null = null;
    if (!esTienda) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: prev } = await sb
        .from('recepcion')
        .select('pallets_recibidos, bultos_recibidos, contenedores_recibidos')
        .eq('cod', body.cod)
        .eq('fuente', 'tienda')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev) {
        recibidoTiendaPrevio = {
          pallets:      prev.pallets_recibidos      ?? 0,
          bultos:       prev.bultos_recibidos       ?? 0,
          contenedores: prev.contenedores_recibidos ?? 0,
        };
      }
    }

    const nuevoEstado = nuevoSeguimientoRecepcion({
      origen:   body.origen ?? '',
      enviado:  { pallets: body.palletsSent      ?? 0, bultos: body.bultosSent      ?? 0, contenedores: body.contenedoresSent      ?? 0 },
      recibido: { pallets: body.palletsRecibidos ?? 0, bultos: body.bultosRecibidos ?? 0, contenedores: body.contenedoresRecibidos ?? 0 },
      recibidoTiendaPrevio,
    });

    // Fecha del despacho a actualizar: la de la fila más reciente de esta tienda (el armado
    // puede ser de un día distinto al de la recepción). Fallback: hoy.
    const fechaDespacho = (await fechaDespachoParaRecepcion(sb, body.cod)) ?? todayFecha();

    // 'Entregado' NO debe pisar un estado más avanzado ya alcanzado (Recibido/Diferencia).
    if (nuevoEstado === 'Entregado') {
      const noFinal = ['Registrado', 'Pendiente', 'En camino'];
      await Promise.all([
        sb.from('despacho_rm').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaDespacho).in('seguimiento', noFinal),
        sb.from('despacho_regiones').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaDespacho).in('seguimiento', noFinal),
      ]);
    } else {
      await Promise.all([
        sb.from('despacho_rm').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaDespacho),
        sb.from('despacho_regiones').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaDespacho),
      ]);
    }

    // Escribir a la hoja correcta según el origen:
    //   'tienda' (QR+OTP de la tienda) → RECEPCIÓN/TIENDA
    //   resto (chofer / entrega)       → ENTREGA/TIENDA
    // La escritura es por NOMBRE de encabezado, así cada hoja recibe solo las columnas
    // que tiene y se pueden reordenar sin cruzar datos.
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');

    const sheetName = body.origen === 'tienda' ? 'RECEPCIÓN/TIENDA' : 'ENTREGA/TIENDA';
    const record: Record<string, string | number> = {
      'Fecha/Hora':             `${dd}/${mm}/${yyyy} ${hh}:${min}`,
      'Código':                 body.cod,
      'Tienda':                 body.tienda,
      'Dirección':              body.direccion,
      'Conductor':              body.conductor ?? '',
      'Pionetas':               body.pionetas ?? '',
      'Pallets Enviados':       body.palletsSent,
      'Bultos Enviados':        body.bultosSent,
      'Contenedores Enviados':  body.contenedoresSent ?? 0,
      'Pallets Recibidos':      body.palletsRecibidos,
      'Bultos Recibidos':       body.bultosRecibidos,
      'Contenedores Recibidos': body.contenedoresRecibidos ?? 0,
      'Receptor':               body.receptor,
      'RUT':                    body.rut,
      'Estado Sello':           body.selloEstado ?? '',
      'Foto Sello Llegada':     body.selloLlegadaUrl ?? '',
      'Hora Sello Llegada':     body.selloLlegadaHora ?? '',
      'Foto Sello Salida':      body.selloSalidaUrl ?? '',
      'Hora Sello Salida':      body.selloSalidaHora ?? '',
      'Foto CD Salida':         body.cdSalidaUrl ?? '',
      'Hora CD Salida':         body.cdSalidaHora ?? '',
      'N° Fotos Estado':        (body.estadoFotoUrls ?? []).length.toString(),
      // En una edición, la fila del Sheet queda marcada "[Editado #N]" (bitácora cronológica):
      // cada edición agrega una fila nueva con SU receptor (el editor) y sus observaciones.
      'Observaciones':          esEdicion
        ? `[Editado #${numEdicion}] ${body.observaciones ?? ''}`.trim()
        : (body.observaciones ?? ''),
      'Acuse de recibo':        acuse,
      // OJO: separador ';' — la hoja está en locale es_ES, donde HYPERLINK usa ';'
      // (con ',' da "Error de análisis de fórmula" / #ERROR!).
      'Fotos de recepción':     galeriaUrl
        ? `=HYPERLINK("${galeriaUrl}";"Ver fotos (${fotosFinal.length})")`
        : '',
    };
    await writeToSheet(sheetName, record);

    // ── PUNTO 3: actualizar trazabilidad_unidades ─────────────────────
    // Usamos canonicalId si existe; sino buscamos por store_cod + EN_RUTA
    if (body.canonicalId || body.cod) {
      const hayIncidencia = !!(
        body.tipoIncidencia ||
        body.recibiConforme === false ||
        (body.selloEstado && body.selloEstado !== 'intacto') ||
        body.palletsSent !== body.palletsRecibidos ||
        body.bultosSent  !== body.bultosRecibidos
      );

      const trazUpdate: Record<string, unknown> = {
        fecha_hora_real_llegada: body.selloLlegadaHora ?? new Date().toISOString(),
        estado_actual:           hayIncidencia ? 'RECIBIDO_INCIDENCIA' : 'RECIBIDO_CONFORME',
        usuario_recepcion:       body.usuarioRecepcion ?? body.receptor ?? null,
        observaciones:           body.observaciones ?? null,
        links_evidencia:         [
          body.selloLlegadaUrl,
          body.selloSalidaUrl,
          body.cdSalidaUrl,
          ...(body.estadoFotoUrls ?? []),
          ...recepcionFotoUrls,
        ].filter(Boolean) as string[],
      };
      if (body.tipoIncidencia)      trazUpdate.tipo_incidencia        = body.tipoIncidencia;
      if (body.temperaturaLlegada !== undefined) trazUpdate.temperatura_llegada = body.temperaturaLlegada;
      if (hayIncidencia)            trazUpdate.estado_resolucion      = 'PENDIENTE';

      if (body.canonicalId) {
        // Upsert por canonical ID (el barcode escaneado)
        const upsertData = {
          id_unidad_logistica: body.canonicalId,
          codigo_tienda:       body.cod,
          tienda_destino:      body.tienda,
          direccion_tienda:    body.direccion,
          transportista:       body.conductor ?? null,
          tipo_unidad:         'Pallet' as const,
          regimen:             body.regimen ?? null,
          ...trazUpdate,
        };
        void sb.from('trazabilidad_unidades').upsert(upsertData, { onConflict: 'id_unidad_logistica' });
        // Mirror a Google Sheets (fire-and-forget)
        upsertTrazabilidadSheet(upsertData as Parameters<typeof upsertTrazabilidadSheet>[0]).catch(() => {});
      } else {
        // Actualizar la primera unidad EN_RUTA para esta tienda
        void sb.from('trazabilidad_unidades')
          .update(trazUpdate)
          .eq('codigo_tienda', body.cod)
          .in('estado_actual', ['EN_RUTA', 'CREADO'])
          .order('fecha_hora_creacion', { ascending: true })
          .limit(1)
          .select()
          .then(({ data: updated }) => {
            if (Array.isArray(updated)) {
              updated.forEach(row => { upsertTrazabilidadSheet(row).catch(() => {}); });
            }
          });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Recepcion error:', err);
    return NextResponse.json({ error: 'Failed to save reception' }, { status: 500 });
  }
}
