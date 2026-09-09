import { describe, it, expect, vi } from 'vitest';
import { mergeItemsByTienda, mergeListaPorItem, mergeEntriesByKey, itemsFromSnapshot } from '../mergeItems';

// Item con id estable (llave) + un valor `v` para simular ediciones de contenido (dims, peso…).
type Item = { id: string; v?: number };
const P = (id: string, v?: number): Item => (v === undefined ? { id } : { id, v });
const K = (i: Item) => i.id; // llave estable (C1)

describe('mergeItemsByTienda', () => {
  it('adopta la versión REMOTA de una tienda que no cambié localmente (fix del revert)', () => {
    const lastSynced = { PTV: [P('P1'), P('P2'), P('CH1'), P('CH2')] };
    const local      = { PTV: [P('P1'), P('P2'), P('CH1'), P('CH2')] }; // igual a lastSynced (no la cambié)
    const remote     = { PTV: [P('P1'), P('P2')] };                     // el otro dispositivo la unió
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ PTV: [P('P1'), P('P2')] });
  });

  it('conserva MI versión de una tienda que sí edité localmente (no perder edición sin empujar)', () => {
    const lastSynced = { PTV: [P('P1')] };
    const local      = { PTV: [P('P1'), P('P2')] };  // agregué P2 local, aún sin empujar
    const remote     = { PTV: [P('P1')] };           // el remoto todavía no lo tiene
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ PTV: [P('P1'), P('P2')] });
  });

  it('preserva ediciones concurrentes en tiendas DISTINTAS (ambas sobreviven)', () => {
    const lastSynced = { X: [P('x1')], Y: [P('y1'), P('y2')] };
    const local      = { X: [P('x1'), P('x2')], Y: [P('y1'), P('y2')] }; // cambié X, no toqué Y
    const remote     = { X: [P('x1')], Y: [P('y1')] };                   // el otro unió Y
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({
      X: [P('x1'), P('x2')], Y: [P('y1')],
    });
  });

  it('no borra una tienda local ausente en el remoto', () => {
    const lastSynced = { A: [P('a1')] };
    const local      = { A: [P('a1')], B: [P('b1')] };
    const remote     = { A: [P('a1')] };
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ A: [P('a1')], B: [P('b1')] });
  });

  it('una tienda LIMPIA ausente del remoto se trata como borrada (no se restaura desde local)', () => {
    const lastSynced = { A: [P('a1')], B: [P('b1')] };
    const local      = { A: [P('a1')], B: [P('b1')] };
    const remote     = { A: [P('a1')] };
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ A: [P('a1')], B: [] });
  });

  it('incorpora tiendas nuevas que solo están en el remoto', () => {
    expect(mergeItemsByTienda({ NEW: [P('n1')] }, {}, {}, K)).toEqual({ NEW: [P('n1')] });
  });

  // ── [E3b/C2] merge POR-ÍTEM en la MISMA tienda ──────────────────────────────
  it('CLAVE: A edita el peso de un ítem mientras B agrega otro en la MISMA tienda → sobreviven los dos', () => {
    const lastSynced = { PTV: [P('P1', 10), P('P2', 20)] };
    const local      = { PTV: [P('P1', 99), P('P2', 20)] };            // A editó P1 (peso 10→99)
    const remote     = { PTV: [P('P1', 10), P('P2', 20), P('B1', 5)] }; // B agregó B1
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({
      PTV: [P('P1', 99), P('P2', 20), P('B1', 5)], // el peso de A + el bulto de B
    });
  });

  it('si SOLO el remoto cambió un ítem (yo no lo toqué), adopto el cambio remoto', () => {
    const lastSynced = { PTV: [P('P1', 10), P('P2', 20)] };
    const local      = { PTV: [P('P1', 10), P('P2', 99) ] };            // A editó P2
    const remote     = { PTV: [P('P1', 55), P('P2', 20)] };             // B editó P1
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({
      PTV: [P('P1', 55), P('P2', 99)], // P1 del remoto (B), P2 mío (A)
    });
  });

  it('borrado remoto de un ítem gana sobre mi copia sin cambios (no reaparece)', () => {
    const lastSynced = { PTV: [P('P1'), P('B1')] };
    const local      = { PTV: [P('P1', 7), P('B1')] };   // edité P1 (dirty en la tienda), no toqué B1
    const remote     = { PTV: [P('P1')] };               // B borró B1
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ PTV: [P('P1', 7)] }); // B1 no reaparece
  });

  it('sin base: ítems DISTINTOS local y remoto se UNEN (no se pierde el remoto)', () => {
    expect(mergeItemsByTienda({ A: [P('zzz')] }, { A: [P('a1')] }, {}, K))
      .toEqual({ A: [P('a1'), P('zzz')] });
  });

  // ── [Aviso de conflicto 2026-09-09] "no saben quién está haciendo qué" ────────────────────
  it('avisa cuando A y B cambian el MISMO ítem a valores DISTINTOS (conflicto real)', () => {
    const lastSynced = { PTV: [P('P1', 10)] };
    const local      = { PTV: [P('P1', 99)] };  // A cambió a 99
    const remote     = { PTV: [P('P1', 55)] };  // B cambió a 55 (distinto)
    const onConflict = vi.fn();
    const merged = mergeItemsByTienda(remote, local, lastSynced, K, onConflict);
    expect(merged).toEqual({ PTV: [P('P1', 99)] }); // gana local igual — el aviso no cambia el resultado
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledWith('PTV', P('P1', 99));
  });

  it('NO avisa si solo UN lado cambió el ítem (no es conflicto, es la edición más nueva)', () => {
    const lastSynced = { PTV: [P('P1', 10), P('P2', 20)] };
    const local      = { PTV: [P('P1', 99), P('P2', 20)] }; // solo A cambió P1
    const remote     = { PTV: [P('P1', 10), P('P2', 20), P('B1', 5)] }; // B agregó B1, no tocó P1
    const onConflict = vi.fn();
    mergeItemsByTienda(remote, local, lastSynced, K, onConflict);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('NO avisa si A y B cambiaron el ítem al MISMO valor (coincidencia, no conflicto)', () => {
    const lastSynced = { PTV: [P('P1', 10)] };
    const local      = { PTV: [P('P1', 42)] };
    const remote     = { PTV: [P('P1', 42)] }; // ambos llegaron al mismo valor
    const onConflict = vi.fn();
    mergeItemsByTienda(remote, local, lastSynced, K, onConflict);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('sin onConflict (comportamiento por defecto) no lanza ni cambia el resultado', () => {
    const lastSynced = { PTV: [P('P1', 10)] };
    const local      = { PTV: [P('P1', 99)] };
    const remote     = { PTV: [P('P1', 55)] };
    expect(mergeItemsByTienda(remote, local, lastSynced, K)).toEqual({ PTV: [P('P1', 99)] });
  });
});

describe('mergeListaPorItem — onConflict', () => {
  it('reporta el ítem en conflicto (no la clave) al callback', () => {
    const base   = [P('P1', 1)];
    const local  = [P('P1', 2)];
    const remote = [P('P1', 3)];
    const onConflict = vi.fn();
    const result = mergeListaPorItem(remote, local, base, K, onConflict);
    expect(result).toEqual([P('P1', 2)]);
    expect(onConflict).toHaveBeenCalledWith(P('P1', 2));
  });

  it('alta nueva simultánea en ambos lados con el MISMO id pero valores distintos también avisa', () => {
    // Colisión de ids en altas nuevas (sin base): se trata igual que una edición concurrente —
    // ambos "cambiaron" desde la nada a algo distinto entre sí. Gana local igual, pero se avisa.
    const onConflict = vi.fn();
    const result = mergeListaPorItem([P('n1', 1)], [P('n1', 2)], [], K, onConflict);
    expect(result).toEqual([P('n1', 2)]);
    expect(onConflict).toHaveBeenCalledWith(P('n1', 2));
  });
});

describe('mergeEntriesByKey (guías PDF: 1 registro por tienda)', () => {
  type Guide = { file: string };
  const G = (file: string): Guide => ({ file });

  it('propaga un REEMPLAZO remoto de una guía que no cambié localmente (bug real de guías)', () => {
    // El otro dispositivo re-subió la guía de X (corregida). Yo no la toqué ⇒ debo adoptar la nueva.
    const lastSynced = { X: G('guia-v1.pdf') };
    const local      = { X: G('guia-v1.pdf') };  // no la cambié
    const remote     = { X: G('guia-v2.pdf') };  // el otro la reemplazó
    expect(mergeEntriesByKey(remote, local, lastSynced)).toEqual({ X: G('guia-v2.pdf') });
  });

  it('conserva mi subida/reemplazo local aún sin empujar', () => {
    const lastSynced = { X: G('guia-v1.pdf') };
    const local      = { X: G('guia-mia.pdf') }; // la reemplacé local, todavía sin empujar
    const remote     = { X: G('guia-v1.pdf') };
    expect(mergeEntriesByKey(remote, local, lastSynced)).toEqual({ X: G('guia-mia.pdf') });
  });

  it('NO borra una guía limpia que el remoto no trae (evita que un remoto stale la haga desaparecer)', () => {
    // Antes esto propagaba el "borrado remoto" y hacía DESAPARECER guías recién subidas cuando
    // el catch-up re-consultaba un remoto stale/parcial. Ahora se conserva la local.
    const lastSynced = { X: G('g.pdf'), Y: G('h.pdf') };
    const local      = { X: G('g.pdf'), Y: G('h.pdf') }; // no toqué Y
    const remote     = { X: G('g.pdf') };                // el remoto no trae Y (stale o borrada en otro equipo)
    expect(mergeEntriesByKey(remote, local, lastSynced)).toEqual({ X: G('g.pdf'), Y: G('h.pdf') });
  });

  it('una guía recién subida NO desaparece si llega un remoto stale sin ella (bug reportado)', () => {
    // Subí Z (ya empujada ⇒ local == lastSynced, "limpia"). Llega un remoto que aún no la tiene.
    const lastSynced = { Z: G('z.pdf') };
    const local      = { Z: G('z.pdf') };
    const remote     = {};                 // remoto stale, todavía sin Z
    expect(mergeEntriesByKey(remote, local, lastSynced)).toEqual({ Z: G('z.pdf') });
  });

  it('honra mi borrado local (no lo re-agrega el eco remoto)', () => {
    const lastSynced = { X: G('g.pdf') };
    const local      = {};                 // borré X local (dirty)
    const remote     = { X: G('g.pdf') };  // el remoto todavía la tiene
    expect(mergeEntriesByKey(remote, local, lastSynced)).toEqual({});
  });

  it('incorpora una guía nueva que solo está en el remoto', () => {
    expect(mergeEntriesByKey({ Z: G('z.pdf') }, {}, {})).toEqual({ Z: G('z.pdf') });
  });

  it('preserva subidas locales al inicio (línea base vacía) y suma las remotas', () => {
    // Init: baseline vacío ⇒ mis guías locales son "dirty" (ganan) y las remotas rellenan el resto.
    const merged = mergeEntriesByKey({ A: G('a.pdf') }, { B: G('b-local.pdf') }, {});
    expect(merged).toEqual({ A: G('a.pdf'), B: G('b-local.pdf') });
  });
});

describe('itemsFromSnapshot', () => {
  it('extrae items de un snapshot válido', () => {
    const snap = JSON.stringify({ step: 'form', regimen: 'Seco', items: { A: [P('a1')] } });
    expect(itemsFromSnapshot<Item>(snap)).toEqual({ A: [P('a1')] });
  });
  it('devuelve {} ante snapshot vacío o inválido', () => {
    expect(itemsFromSnapshot('')).toEqual({});
    expect(itemsFromSnapshot('no-json')).toEqual({});
    expect(itemsFromSnapshot('{}')).toEqual({});
  });
});
