import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/apiAuth';
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
  if (!await verifyAdmin(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Llegan VALORES POR NOMBRE de columna, no filas posicionales: la posición se decide recién
  // después de leer el encabezado real de la hoja.
  let valores: Record<string, string | number>[];
  try {
    const body = await request.json() as { valores?: Record<string, string | number>[] };
    valores = Array.isArray(body.valores) ? body.valores : [];
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
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
