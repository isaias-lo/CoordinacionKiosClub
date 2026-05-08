import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { put } from '@vercel/blob';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return JSON.parse(raw);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

interface RecepcionBody {
  cod: string;
  tienda: string;
  direccion: string;
  palletsSent: number;
  bultosSent: number;
  palletsRecibidos: number;
  bultosRecibidos: number;
  receptor: string;
  rut: string;
  signatureDataUrl?: string;
  driveFileId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecepcionBody;

    let signatureUrl = '';

    // Upload signature PNG to Vercel Blob
    if (body.signatureDataUrl) {
      const base64Data = body.signatureDataUrl.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const now = Date.now();
      const blob = await put(`firma_${body.cod}_${now}.png`, buffer, {
        access: 'public',
        contentType: 'image/png',
      });
      signatureUrl = blob.url;
    }

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const fechaHora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Recepcion tienda!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          fechaHora,
          body.cod,
          body.tienda,
          body.direccion,
          body.palletsSent,
          body.bultosSent,
          body.palletsRecibidos,
          body.bultosRecibidos,
          body.receptor,
          body.rut,
          signatureUrl,
        ]],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Recepcion error:', err);
    return NextResponse.json({ error: 'Failed to save reception' }, { status: 500 });
  }
}
