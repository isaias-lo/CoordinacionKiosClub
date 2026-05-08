import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return JSON.parse(raw);
}

async function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function POST(request: NextRequest) {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      return NextResponse.json({ error: 'GOOGLE_DRIVE_FOLDER_ID not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stream = Readable.from(buffer);

    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    const res = await drive.files.create({
      requestBody: {
        name: file.name,
        mimeType: 'application/pdf',
        parents: [folderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: stream,
      },
      fields: 'id',
    });

    const fileId = res.data.id!;

    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return NextResponse.json({ fileId });
  } catch (err) {
    console.error('Drive upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
