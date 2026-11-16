import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { registrarCambio } from '@/lib/bitacoraServer';
import { verifyActor, verifyAdmin } from '@/lib/apiAuth';
import { parseBody, TopeTiendaSchema } from '@/lib/schemas';
import { normalizeCod } from '../sync/normalizeCod';

/**
 * El TOPE DE RECEPCIÓN de una tienda, guardado solo.
 *
 * ── POR QUÉ NO SE REUSA `POST /api/tiendas` ───────────────────────────────────────────────────
 *
 * Esa ruta es un UPSERT COMPLETO: reescribe las 30 columnas de la fila y después sincroniza la
 * hoja TIENDAS con 8 segundos de espera. Desde la tabla de Config → Topes se pasa por decenas de
 * tiendas cambiando un número: usarla ahí reescribiría la fila entera cada vez —vaciando en
 * silencio cualquier campo que la tabla no cargue— y resincronizaría la hoja por una columna que
 * la hoja NI TIENE (`max_pallets` vive solo en la base, igual que `recepcion_pallet`).
 *
 * Por eso esto toca una sola columna y no habla con Sheets.
 *
 * `max_pallets: null` es válido y es cómo se BORRA un tope mal cargado.
 */
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const parsed = parseBody(TopeTiendaSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { codigo, max_pallets } = parsed.data;

    const sb  = supabaseServer();
    const cod = normalizeCod(codigo);

    // El valor previo, para la bitácora: sin esto el registro solo diría «alguien guardó algo».
    // Y además distingue «la tienda no existe» de «se guardó», que un update a secas no hace:
    // Postgres no falla al actualizar cero filas.
    const { data: antes, error: errLectura } = await sb
      .from('tiendas').select('codigo, nombre, max_pallets').eq('codigo', cod).maybeSingle();
    if (errLectura) throw errLectura;
    if (!antes) return NextResponse.json({ error: `No existe la tienda ${cod}` }, { status: 404 });

    const { data, error } = await sb
      .from('tiendas')
      .update({ max_pallets })
      .eq('codigo', cod)
      .select('codigo, nombre, max_pallets')
      .single();
    if (error) throw error;

    // No bloquea: si la bitácora falla, el tope ya quedó guardado (ver `registrarCambio`).
    void registrarCambio({
      actor: await verifyActor(request),
      entidad: 'tienda', entidadId: cod,
      accion: 'editar',
      antes, despues: data,
    });

    return NextResponse.json({ tienda: data });
  } catch (err) {
    console.error('[PATCH /api/tiendas/tope]', err);
    return NextResponse.json({ error: 'Error al guardar el tope' }, { status: 500 });
  }
}
