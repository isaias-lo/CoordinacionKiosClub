import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

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
  signatureDataUrl: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecepcionBody;
    const sb = supabaseServer();

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

    // Insert record into recepcion table
    const { error: insertError } = await sb.from('recepcion').insert({
      cod: body.cod,
      tienda: body.tienda,
      direccion: body.direccion,
      pallets_sent: body.palletsSent,
      bultos_sent: body.bultosSent,
      pallets_recibidos: body.palletsRecibidos,
      bultos_recibidos: body.bultosRecibidos,
      receptor: body.receptor,
      rut: body.rut,
      firma_url: publicUrl,
    });

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Recepcion error:', err);
    return NextResponse.json({ error: 'Failed to save reception' }, { status: 500 });
  }
}
