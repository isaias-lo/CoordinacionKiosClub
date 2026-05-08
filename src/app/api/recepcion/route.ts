import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyOtpToken } from '../../../lib/otpToken';

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
  email: string;
  otpToken: string;
  otpCode: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecepcionBody;

    if (!verifyOtpToken(body.otpToken, body.email, body.otpCode)) {
      return NextResponse.json({ error: 'Código inválido o expirado' }, { status: 401 });
    }

    const auth   = await getAuth();
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
          body.email,
        ]],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Recepcion error:', err);
    return NextResponse.json({ error: 'Failed to save reception' }, { status: 500 });
  }
}
