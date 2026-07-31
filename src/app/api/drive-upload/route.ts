import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';
import { safeStorageKey } from '@/lib/storageKey';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Archivo demasiado grande (máx 10 MB)' }, { status: 400 });
    }

    const sb = supabaseServer();
    // safeStorageKey: el nombre trae el código de tienda, que puede tener Ñ/acentos (23PEÑ →
    // "Invalid key" en Storage → la guía nunca subía y quedaba sin PDF descargable).
    const filename = safeStorageKey(`${Date.now()}_${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await sb.storage
      .from('guides')
      .upload(filename, buffer, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = sb.storage
      .from('guides')
      .getPublicUrl(filename);

    // Record in guides table
    await sb.from('guides').insert({ filename, url: publicUrl });

    return NextResponse.json({ fileId: publicUrl });
  } catch (err) {
    console.error('Storage upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
