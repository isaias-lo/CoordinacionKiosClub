import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin, verifyAuth } from '@/lib/apiAuth';
import { construirCruceDelDia } from '@/lib/crucePesosDia';
import { escribirCruce, ColumnasRenombradas } from '@/lib/crucePesosSheet';
import { COL_LLAVE } from '@/features/despacho/shared/hojaCrucePesos';

// Escribe la hoja CRUCE PESOS. Una fila por tienda y por día.
//
// La escritura vive en `lib/crucePesosSheet` y no acá, para que la carga inicial de días pasados
// use EXACTAMENTE el mismo código que el registro del día. Dos copias podrían escribir distinto y
// nadie lo notaría hasta comparar dos filas a mano.
//
// Solo admin: el cruce compara el trabajo del andén contra Odoo y no es información de operación.

export async function POST(request: NextRequest) {
  let body: { valores?: Record<string, string | number>[]; fecha?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // DOS CAMINOS, con permisos distintos a propósito.
  //
  //   { fecha }    Recalcula el día ENTERO desde sus fuentes —Odoo y las dos tablas de Bodega— y
  //                lo escribe. Es lo que dispara REGISTRAR, así que lo puede hacer cualquiera que
  //                pueda registrar: no elige qué se escribe, solo pide que se recalcule lo que
  //                ya está en la base.
  //
  //   { valores }  Escribe las filas que le pasen, tal cual. Eso sí es escribir arbitrariamente
  //                en la planilla, y queda como estaba: solo admin.
  let valores: Record<string, string | number>[];

  if (typeof body.fecha === 'string') {
    if (!await verifyAuth(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 });
    }
    try {
      valores = await construirCruceDelDia(body.fecha);
    } catch (err) {
      console.error('[cruce-pesos] armar el día', err);
      return NextResponse.json({ error: 'No se pudo armar el cruce del día' }, { status: 502 });
    }
  } else {
    if (!await verifyAdmin(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    // Llegan VALORES POR NOMBRE de columna, no filas posicionales: la posición se decide recién
    // después de leer el encabezado real de la hoja.
    valores = Array.isArray(body.valores) ? body.valores : [];
  }

  if (!valores.length) return NextResponse.json({ ok: true, agregadas: 0, actualizadas: 0 });

  const sinLlave = valores.filter(v => !v?.[COL_LLAVE[0]] || !v?.[COL_LLAVE[1]]);
  if (sinLlave.length) {
    return NextResponse.json(
      { error: `${sinLlave.length} fila(s) sin ${COL_LLAVE.join(' o ')}` },
      { status: 400 },
    );
  }

  try {
    const r = await escribirCruce(valores);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof ColumnasRenombradas) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[cruce-pesos]', err);
    return NextResponse.json({ error: 'No se pudo escribir la hoja' }, { status: 500 });
  }
}
