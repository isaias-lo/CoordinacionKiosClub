import { describe, it, expect } from 'vitest';
import { mergeItemsByTienda, mergeEntriesByKey, itemsFromSnapshot } from '../mergeItems';

// Item mínimo (solo un id sirve para distinguir versiones).
type Item = { id: string };
const P = (id: string): Item => ({ id });

describe('mergeItemsByTienda', () => {
  it('adopta la versión REMOTA de una tienda que no cambié localmente (fix del revert)', () => {
    // La PC tiene la copia vieja de PTV; el móvil unió CH → remoto trae PTV con la lista unida.
    // La PC no tocó PTV desde el último sync ⇒ debe adoptar la remota (no reafirmar la vieja).
    const lastSynced = { PTV: [P('P1'), P('P2'), P('CH1'), P('CH2')] };
    const local      = { PTV: [P('P1'), P('P2'), P('CH1'), P('CH2')] }; // igual a lastSynced (no la cambié)
    const remote     = { PTV: [P('P1'), P('P2')] };                     // el otro dispositivo la unió
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ PTV: [P('P1'), P('P2')] });
  });

  it('conserva MI versión de una tienda que sí edité localmente (no perder edición sin empujar)', () => {
    const lastSynced = { PTV: [P('P1')] };
    const local      = { PTV: [P('P1'), P('P2')] };  // agregué P2 local, aún sin empujar
    const remote     = { PTV: [P('P1')] };           // el remoto todavía no lo tiene
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ PTV: [P('P1'), P('P2')] });
  });

  it('preserva ediciones concurrentes en tiendas DISTINTAS (ambas sobreviven)', () => {
    // Yo edité X (dirty); el otro dispositivo unió en Y y lo empujó (remoto trae Y nuevo).
    const lastSynced = { X: [P('x1')], Y: [P('y1'), P('y2')] };
    const local      = { X: [P('x1'), P('x2')], Y: [P('y1'), P('y2')] }; // cambié X, no toqué Y
    const remote     = { X: [P('x1')], Y: [P('y1')] };                   // el otro unió Y
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({
      X: [P('x1'), P('x2')], // gano yo (la edité)
      Y: [P('y1')],          // adopto la remota (no la toqué)
    });
  });

  it('no borra una tienda local ausente en el remoto', () => {
    const lastSynced = { A: [P('a1')] };
    const local      = { A: [P('a1')], B: [P('b1')] }; // B es local, aunque no cambió A
    const remote     = { A: [P('a1')] };               // remoto no tiene B
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ A: [P('a1')], B: [P('b1')] });
  });

  it('una tienda LIMPIA ausente del remoto se trata como borrada (no se restaura desde local)', () => {
    // B ya estaba sincronizada; el otro dispositivo la vació/borró (ausente en remoto). Como no la
    // cambié, adopto ese borrado (queda vacía) en vez de reafirmar mi copia vieja — igual que Nacional.
    const lastSynced = { A: [P('a1')], B: [P('b1')] };
    const local      = { A: [P('a1')], B: [P('b1')] }; // no toqué B
    const remote     = { A: [P('a1')] };               // remoto ya no tiene B
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ A: [P('a1')], B: [] });
  });

  it('incorpora tiendas nuevas que solo están en el remoto', () => {
    const lastSynced = {};
    const local      = {};
    const remote     = { NEW: [P('n1')] };
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ NEW: [P('n1')] });
  });

  it('sin línea base (lastSynced vacío) → toda tienda local se considera cambiada y gana', () => {
    const lastSynced = {};
    const local      = { A: [P('a1')] };
    const remote     = { A: [P('zzz')] };
    expect(mergeItemsByTienda(remote, local, lastSynced)).toEqual({ A: [P('a1')] });
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
