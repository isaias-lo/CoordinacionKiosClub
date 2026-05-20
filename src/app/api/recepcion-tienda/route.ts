import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabaseServer } from '@/lib/supabaseServer';

interface RecepcionTiendaBody {
  cod: string;
  tienda: string;
  direccion: string;
  palletsSent: number;
  bultosSent: number;
  contenedoresSent: number;
  palletsRecibidos: number;
  bultosRecibidos: number;
  contenedoresRecibidos: number;
  receptor: string;
  rut: string;
  signatureDataUrl: string;
  observaciones?: string;
  selloEstado?: string;
  selloFotoUrl?: string;
  estadoFotoUrls?: string[];
  guias?: string[];
  driveFileId?: string;
}

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

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
    range:            'RECEPCION/TIENDA!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values: [row] },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecepcionTiendaBody;
    const sb = supabaseServer();

    // Upload signature
    const base64Data = body.signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `firma_tienda_${body.cod}_${Date.now()}.png`;

    const { error: uploadError } = await sb.storage
      .from('signatures')
      .upload(filename, buffer, { contentType: 'image/png', upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = sb.storage.from('signatures').getPublicUrl(filename);

    // Insert record (same recepcion table, fuente = 'tienda')
    const { error: insertError } = await sb.from('recepcion').insert({
      cod:               body.cod,
      tienda:            body.tienda,
      direccion:         body.direccion,
      pallets_sent:            body.palletsSent,
      bultos_sent:             body.bultosSent,
      contenedores_sent:       body.contenedoresSent      ?? 0,
      pallets_recibidos:       body.palletsRecibidos,
      bultos_recibidos:        body.bultosRecibidos,
      contenedores_recibidos:  body.contenedoresRecibidos ?? 0,
      conductor:         '',
      pionetas:          '',
      receptor:          body.receptor,
      rut:               body.rut,
      firma_url:         publicUrl,
      observaciones:     body.observaciones  ?? '',
      sello_estado:      body.selloEstado    ?? '',
      sello_foto_url:    body.selloFotoUrl   ?? '',
      estado_fotos:      body.estadoFotoUrls ?? [],
      fuente:            'tienda',
    });

    if (insertError) throw new Error(insertError.message);

    // Tienda registra recepción → queda en 'Entregado' hasta validación interna
    const nuevoEstado = 'Entregado';

    await Promise.all([
      sb.from('despacho_rm').update({ seguimiento: nuevoEstado }).eq('cod', body.cod),
      sb.from('despacho_regiones').update({ seguimiento: nuevoEstado }).eq('cod', body.cod),
    ]);

    // Write to RECEPCION/TIENDA sheet
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');

    await writeToSheet([
      `${dd}/${mm}/${yyyy} ${hh}:${min}`,            // Fecha/Hora
      body.cod,                                       // Código
      body.tienda,                                    // Tienda
      body.direccion,                                 // Dirección
      body.palletsSent,                               // Pallets Enviados
      body.bultosSent,                                // Bultos Enviados
      body.contenedoresSent      ?? 0,                // Contenedores Enviados
      body.palletsRecibidos,                          // Pallets Recibidos
      body.bultosRecibidos,                           // Bultos Recibidos
      body.contenedoresRecibidos ?? 0,                // Contenedores Recibidos
      body.receptor,                                  // Receptor
      body.rut,                                       // RUT
      publicUrl,                                      // Firma
      body.selloEstado  ?? '',                        // Estado Sello
      body.selloFotoUrl ?? '',                        // Foto Sello
      (body.estadoFotoUrls ?? []).length.toString(),  // N° Fotos Estado
      (body.guias ?? []).join(', '),                  // Guías
      body.driveFileId  ?? '',                        // Drive File ID
      body.observaciones ?? '',                       // Observaciones
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('RecepcionTienda error:', err);
    return NextResponse.json({ error: 'Failed to save reception' }, { status: 500 });
  }
}
