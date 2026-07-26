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
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function todayFecha(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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

    const acuse = typeof body.recibiConforme === 'boolean' ? acuseLabel(body.recibiConforme) : '';

    // Insert record (devuelve id para armar el link de la galería pública)
    const { data: inserted, error: insertError } = await sb.from('recepcion').insert({
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
      fuente:               'conductor',
    }).select('id').single();

    if (insertError) throw new Error(insertError.message);

    // Link a la galería pública de fotos de recepción (para la columna del Sheet).
    const origin = new URL(request.url).origin;
    const galeriaUrl = recepcionFotoUrls.length && inserted?.id
      ? `${origin}/recepcion/galeria/${inserted.id}`
      : '';

    // Auto-transición: si la tienda ya registró su recepción para hoy, comparamos
    // cantidades. Si coinciden con lo enviado por el conductor → 'Recibido';
    // si hay diferencia → 'Diferencia'. Sin recepción previa → 'Entregado'.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: prevTiendaRecep } = await sb
      .from('recepcion')
      .select('pallets_recibidos, bultos_recibidos, contenedores_recibidos')
      .eq('cod', body.cod)
      .eq('fuente', 'tienda')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nuevoEstado: 'Entregado' | 'Recibido' | 'Diferencia' = 'Entregado';
    if (prevTiendaRecep) {
      const hayDiferencia =
        (body.palletsSent      ?? 0) !== (prevTiendaRecep.pallets_recibidos      ?? 0) ||
        (body.bultosSent       ?? 0) !== (prevTiendaRecep.bultos_recibidos       ?? 0) ||
        (body.contenedoresSent ?? 0) !== (prevTiendaRecep.contenedores_recibidos ?? 0);
      nuevoEstado = hayDiferencia ? 'Diferencia' : 'Recibido';
    }
    const fechaHoy = todayFecha();

    await Promise.all([
      sb.from('despacho_rm').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaHoy),
      sb.from('despacho_regiones').update({ seguimiento: nuevoEstado }).eq('cod', body.cod).eq('fecha', fechaHoy),
    ]);

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
      'Observaciones':          body.observaciones ?? '',
      'Acuse de recibo':        acuse,
      'Fotos de recepción':     galeriaUrl
        ? `=HYPERLINK("${galeriaUrl}","Ver fotos (${recepcionFotoUrls.length})")`
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
