import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return JSON.parse(raw);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
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

    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    let signatureUrl = '';

    if (body.signatureDataUrl) {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        const base64Data = body.signatureDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const stream = Readable.from(buffer);

        const now = new Date().toISOString().replace(/[:.]/g, '-');
        const sigRes = await drive.files.create({
          requestBody: {
            name: `firma_${body.cod}_${now}.png`,
            mimeType: 'image/png',
            parents: [folderId],
          },
          media: { mimeType: 'image/png', body: stream },
          fields: 'id',
        });

        const sigFileId = sigRes.data.id!;
        await drive.permissions.create({
          fileId: sigFileId,
          requestBody: { role: 'reader', type: 'anyone' },
        });
        signatureUrl = `https://drive.google.com/uc?export=view&id=${sigFileId}`;
      }
    }

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
