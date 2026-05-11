import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const sb = supabaseServer();
    const filename = `${Date.now()}_${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await sb.storage
      .from('guides')
      .upload(filename, buffer, { contentType: 'application/pdf', upsert: false });

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
