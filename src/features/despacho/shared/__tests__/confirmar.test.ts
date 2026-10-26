import { describe, it, expect, vi, afterEach } from 'vitest';
import { confirmar, registrarHost, textoPlano, type ConfirmacionAbierta } from '../confirmar';
import { PEDIDO_SIN_PESAR, pedidoPesoRaro, pedidoRegistrarIgual, pedidoTerminarTienda } from '../confirmarGuardado';

const P = { titulo: '¿Eliminar P3?', detalle: 'P3 ya está guardado.', aceptar: 'Eliminar P3' };

describe('confirmar con el aviso de la app', () => {
  let soltar: (() => void) | null = null;
  afterEach(() => { soltar?.(); soltar = null; vi.unstubAllGlobals(); });

  it('responde lo que se toca en el aviso', async () => {
    const vistos: (ConfirmacionAbierta | null)[] = [];
    soltar = registrarHost(p => vistos.push(p));
    const r = confirmar(P);
    expect(vistos[0]?.aceptar).toBe('Eliminar P3');
    vistos[0]!.responder(true);
    await expect(r).resolves.toBe(true);
    expect(vistos.at(-1)).toBeNull();
  });

  it('un segundo pedido responde «no» al que estaba abierto', async () => {
    const vistos: (ConfirmacionAbierta | null)[] = [];
    soltar = registrarHost(p => vistos.push(p));
    const primero = confirmar(P);
    const segundo = confirmar({ ...P, titulo: 'otro' });
    await expect(primero).resolves.toBe(false);
    vistos.filter(Boolean).at(-1)!.responder(true);
    await expect(segundo).resolves.toBe(true);
  });

  it('responder dos veces no cambia la respuesta', async () => {
    let abierta: ConfirmacionAbierta | null = null;
    soltar = registrarHost(p => { if (p) abierta = p; });
    const r = confirmar(P);
    abierta!.responder(false);
    abierta!.responder(true);
    await expect(r).resolves.toBe(false);
  });

  it('al desmontarse, lo abierto queda en «no»', async () => {
    const s = registrarHost(() => {});
    const r = confirmar(P);
    s();
    await expect(r).resolves.toBe(false);
  });

  it('sin aviso montado, pregunta con el del navegador', async () => {
    const c = vi.fn(() => true);
    vi.stubGlobal('window', { confirm: c });
    await expect(confirmar(P)).resolves.toBe(true);
    expect(c).toHaveBeenCalledWith('¿Eliminar P3?\n\nP3 ya está guardado.');
  });
});

describe('las preguntas de Bodega', () => {
  it('textoPlano omite el detalle vacío', () => {
    expect(textoPlano({ titulo: 'Hola', aceptar: 'Sí' })).toBe('Hola');
  });

  it('un peso raro se corrige o se guarda así', () => {
    const p = pedidoPesoRaro({ titulo: '246,7 kg en un chocolate', detalle: 'Lo normal es menos de 60 kg.' });
    expect([p.aceptar, p.cancelar, p.tono]).toEqual(['Guardar así', 'Corregir', 'aviso']);
  });

  it('registrar igual lleva lo que falta en el detalle', () => {
    expect(pedidoRegistrarIgual('Antes de registrar:\n\n• 1 tienda').detalle).toContain('1 tienda');
  });

  it('terminar una tienda sin pendientes no va en ámbar', () => {
    expect(pedidoTerminarTienda([]).tono).toBe('normal');
    const con = pedidoTerminarTienda(['⚠ 2 ítems sin pesar']);
    expect(con.tono).toBe('aviso');
    expect(con.detalle).toMatch(/^⚠ 2 ítems sin pesar\n\nEn el Enrutador/);
  });

  it('agregar sin pesar dice en el botón lo que hace', () => {
    expect(PEDIDO_SIN_PESAR.aceptar).toBe('Agregar sin pesar');
  });
});
