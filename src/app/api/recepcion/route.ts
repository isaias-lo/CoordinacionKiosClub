import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';
import { upsertTrazabilidadSheet } from '@/lib/sheetsTraza';
import { verifyOtpToken } from '@/lib/otpToken';
import { verifyAnyUser } from '@/lib/apiAuth';

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
  signatureDataUrl: string;
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

async function writeToSheet(row: (string | number)[]) {
  const auth = getAuth();
  const gs   = google.sheets({ version: 'v4', auth });
  await gs.spreadsheets.values.append({
    spreadsheetId:    SPREADSHEET_ID,
    range:            'ENTREGA/TIENDA!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [row] },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecepcionBody;
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

    // Upload signature to Supabase Storage
    const base64Data = body.signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `firma_${body.cod}_${Date.now()}.png`;

    const { error: uploadError } = await sb.storage
      .from('signatures')
      .upload(filename, buffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = sb.storage
      .from('signatures')
      .getPublicUrl(filename);

    // Insert record
    const { error: insertError } = await sb.from('recepcion').insert({
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
      firma_url:            publicUrl,
      observaciones:        body.observaciones        ?? '',
      sello_estado:         body.selloEstado           ?? '',
      sello_llegada_url:    body.selloLlegadaUrl       ?? '',
      sello_llegada_hora:   body.selloLlegadaHora      ?? '',
      sello_salida_url:     body.selloSalidaUrl        ?? '',
      sello_salida_hora:    body.selloSalidaHora       ?? '',
      cd_salida_url:        body.cdSalidaUrl           ?? '',
      cd_salida_hora:       body.cdSalidaHora          ?? '',
      estado_fotos:         body.estadoFotoUrls        ?? [],
      codigo_verificacion:  body.codigoVerificacion    ?? '',
      canonical_id:         body.canonicalId           ?? null,
      fuente:               'conductor',
    });

    if (insertError) throw new Error(insertError.message);

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

    // Write to ENTREGA/TIENDA sheet
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');

    await writeToSheet([
      `${dd}/${mm}/${yyyy} ${hh}:${min}`,             // Fecha/Hora
      body.cod,                                        // Código
      body.tienda,                                     // Tienda
      body.direccion,                                  // Dirección
      body.conductor      ?? '',                       // Conductor
      body.pionetas       ?? '',                       // Pionetas
      body.palletsSent,                                // Pallets Enviados
      body.bultosSent,                                 // Bultos Enviados
      body.contenedoresSent      ?? 0,                 // Contenedores Enviados
      body.palletsRecibidos,                           // Pallets Recibidos
      body.bultosRecibidos,                            // Bultos Recibidos
      body.contenedoresRecibidos ?? 0,                 // Contenedores Recibidos
      body.receptor,                                   // Receptor
      body.rut,                                        // RUT
      publicUrl,                                       // Firma
      body.selloEstado        ?? '',                   // Estado Sello
      body.selloLlegadaUrl    ?? '',                   // Foto Sello Llegada
      body.selloLlegadaHora   ?? '',                   // Hora Sello Llegada
      body.selloSalidaUrl     ?? '',                   // Foto Sello Salida
      body.selloSalidaHora    ?? '',                   // Hora Sello Salida
      body.cdSalidaUrl        ?? '',                   // Foto CD Salida
      body.cdSalidaHora       ?? '',                   // Hora CD Salida
      (body.estadoFotoUrls ?? []).length.toString(),   // N° Fotos Estado
      body.observaciones      ?? '',                   // Observaciones
    ]);

    // ── PUNTO 3: actualizar trazabilidad_unidades ─────────────────────
    // Usamos canonicalId si existe; sino buscamos por store_cod + EN_RUTA
    if (body.canonicalId || body.cod) {
      const hayIncidencia = !!(
        body.tipoIncidencia ||
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
