import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const blob = await put(file.name, file, {
      access: 'public',
      contentType: 'application/pdf',
    });

    return NextResponse.json({ fileId: blob.url });
  } catch (err) {
    console.error('Blob upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
