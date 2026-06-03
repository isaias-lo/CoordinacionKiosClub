import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

/**
 * POST /api/picking-pallets/combine
 *
 * Combina dos o más slots activos en uno nuevo.
 * Lógica:
 *  1. Crear el nuevo slot (hereda tipo/contenido/store_cod/date del primero)
 *  2. Marcar los slots combinados como is_active=false, combined_into=newId
 *  3. Renumerar TODOS los slots activos de (date, store_cod, tipo) desde 1
 *  4. Si alguno ya tenía fila en despacho_rm: eliminarla y crear una nueva
 *     vinculada al nuevo slot
 *  5. Retornar: newId, canonical_id nuevo, lista de todos los afectados
 *     para que el cliente sepa cuáles etiquetas reimprimir
 */
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();

  try {
    const body = await request.json() as {
      ids:       number[];        // IDs de los slots a combinar (mínimo 2)
      date:      string;          // YYYY-MM-DD
      store_cod: string;          // código canónico de la tienda
      tipo:      string;          // P | B | C | CH
    };

    if (!Array.isArray(body.ids) || body.ids.length < 2) {
      return NextResponse.json({ error: 'Se necesitan al menos 2 IDs para combinar' }, { status: 400 });
    }

    const sb = supabaseServer();

    // ── 1. Leer los slots a combinar ──────────────────────────
    const { data: toMerge, error: fetchErr } = await sb
      .from('picking_pallets')
      .select('id, store_cod, date, tipo, contenido, picker_label, state_key, refs, is_active')
      .in('id', body.ids)
      .eq('is_active', true);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!toMerge || toMerge.length < 2) {
      return NextResponse.json({ error: 'No se encontraron suficientes slots activos' }, { status: 400 });
    }

    const base = toMerge[0] as {
      id: number; store_cod: string; date: string; tipo: string;
      contenido: string; picker_label: string; state_key: string; refs: string;
    };

    // ── 2. Crear el nuevo slot combinado ──────────────────────
    const { data: newSlot, error: insertErr } = await sb
      .from('picking_pallets')
      .insert({
        store_cod:    base.store_cod,
        date:         base.date,
        tipo:         base.tipo,
        contenido:    base.contenido,
        picker_label: base.picker_label,
        state_key:    base.state_key,
        refs:         base.refs,
        is_active:    true,
        // seq y canonical_id se asignan en el paso 4 (tras renumeración)
      })
      .select('id')
      .single();

    if (insertErr || !newSlot) {
      return NextResponse.json({ error: insertErr?.message ?? 'Error al crear slot combinado' }, { status: 500 });
    }
    const newId: number = newSlot.id;

    // ── 3. Marcar slots viejos como inactivos ─────────────────
    const { error: deactivateErr } = await sb
      .from('picking_pallets')
      .update({ is_active: false, combined_into: newId, combined_at: new Date().toISOString() })
      .in('id', body.ids);

    if (deactivateErr) {
      // Rollback: eliminar el nuevo slot
      await sb.from('picking_pallets').delete().eq('id', newId);
      return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
    }

    // ── 4. Renumerar todos los activos de (date, store_cod, tipo) ──
    const { data: allActive, error: activeErr } = await sb
      .from('picking_pallets')
      .select('id')
      .eq('date', body.date)
      .eq('store_cod', body.store_cod)
      .eq('tipo', body.tipo)
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (activeErr) return NextResponse.json({ error: activeErr.message }, { status: 500 });

    // stamp en formato DDMMYYYY
    const [yyyy, mm, dd] = body.date.split('-');
    const stampFmt = `${dd}${mm}${yyyy}`;

    function buildCanonical(tipo: string, seq: number, cod: string, st: string): string {
      if (tipo === 'P')  return `P${seq}${cod}${st}P`;
      if (tipo === 'B')  return `${seq}B${cod}${st}B`;
      if (tipo === 'CH') return `CH${seq}${cod}${st}CH`;
      if (tipo === 'C')  return `C${seq}${cod}${st}C`;
      return `${seq}${cod}${st}`;
    }

    const renumbered: { id: number; oldSeq: number | null; newSeq: number; canonical_id: string }[] = [];
    const needsReprint: number[] = [];

    for (let i = 0; i < (allActive ?? []).length; i++) {
      const slot = allActive![i] as { id: number };
      const newSeq      = i + 1;
      const canonical   = buildCanonical(body.tipo, newSeq, body.store_cod, stampFmt);

      // Leer seq actual para detectar cambio
      const { data: cur } = await sb
        .from('picking_pallets')
        .select('seq, canonical_id')
        .eq('id', slot.id)
        .single();

      const oldSeq = (cur as { seq: number | null } | null)?.seq ?? null;

      await sb
        .from('picking_pallets')
        .update({ seq: newSeq, canonical_id: canonical })
        .eq('id', slot.id);

      renumbered.push({ id: slot.id, oldSeq, newSeq, canonical_id: canonical });

      // Necesita reimpresión si es el nuevo slot O si cambió de número
      if (slot.id === newId || oldSeq !== newSeq) {
        needsReprint.push(slot.id);
      }
    }

    // ── 5. Cascada en despacho_rm ─────────────────────────────
    // Si los slots combinados tenían filas en despacho_rm, eliminarlas
    const { data: oldRmRows } = await sb
      .from('despacho_rm')
      .select('id, conductor, patente, ruta, supervisor, transporte, seguimiento')
      .in('picking_pallet_id', body.ids);

    if (oldRmRows && oldRmRows.length > 0) {
      // Tomar el primer registro como base para el nuevo (hereda routing si ya tenía)
      const baseRm = (oldRmRows as Record<string, string>[])[0];
      await sb.from('despacho_rm').delete().in('picking_pallet_id', body.ids);

      // Crear nueva fila para el slot combinado (solo si había filas previas)
      const newEntry = renumbered.find(r => r.id === newId);
      if (newEntry) {
        await sb.from('despacho_rm').insert({
          id:                 newEntry.canonical_id,
          picking_pallet_id:  newId,
          conductor:          baseRm.conductor  ?? '',
          patente:            baseRm.patente    ?? '',
          ruta:               baseRm.ruta       ?? '',
          supervisor:         baseRm.supervisor ?? '',
          transporte:         baseRm.transporte ?? 'Luis Fica',
          seguimiento:        'Listo para despachar',
        });
      }
    }

    return NextResponse.json({
      ok:           true,
      newId,
      renumbered,
      needsReprint,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
