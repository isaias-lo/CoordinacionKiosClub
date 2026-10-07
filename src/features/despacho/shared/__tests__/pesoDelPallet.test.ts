import { describe, expect, it } from 'vitest';
import { avisoNetoPallet, leerTaraPallet, pesoEnTarjeta, pesoNetoPallet, taraEnTarjeta, taraParaGuardar, textoPesoConTara } from '../pesoDelPallet';

describe('peso del pallet: se resta del peso', () => {
  it('vacío no toca nada: es el caso normal', () => {
    expect(pesoNetoPallet('300', '')).toEqual({ ok: true, neto: 300, bruto: 300, tara: 0 });
    expect(pesoNetoPallet('300', undefined)).toEqual({ ok: true, neto: 300, bruto: 300, tara: 0 });
    expect(pesoNetoPallet('300', '0')).toEqual({ ok: true, neto: 300, bruto: 300, tara: 0 });
  });

  it('resta el pallet', () => {
    expect(pesoNetoPallet('300', '22')).toEqual({ ok: true, neto: 278, bruto: 300, tara: 22 });
  });

  it('acepta coma decimal en los dos campos y no arrastra coma flotante', () => {
    expect(pesoNetoPallet('300,5', '22,3')).toMatchObject({ ok: true, neto: 278.2 });
    expect(pesoNetoPallet('100.1', '0.2')).toMatchObject({ ok: true, neto: 99.9 });
  });

  it('rechaza un pallet que pesa igual o más que todo', () => {
    expect(pesoNetoPallet('20', '22').ok).toBe(false);
    expect(pesoNetoPallet('22', '22').ok).toBe(false);
  });

  it('rechaza sin peso', () => {
    expect(pesoNetoPallet('', '22').ok).toBe(false);
  });

  it('rechaza una tara negativa en vez de sumarla', () => {
    expect(leerTaraPallet('-5')).toBeNull();
    expect(pesoNetoPallet('300', '-5').ok).toBe(false);
  });
});

describe('el aviso bajo los campos', () => {
  it('sin pallet no dice nada', () => {
    expect(avisoNetoPallet('300', '')).toBeNull();
  });
  it('dice lo que se va a guardar', () => {
    expect(avisoNetoPallet('300', '22')).toBe('se guardan 278 kg');
  });
  it('sin peso todavía, dice cuánto se resta', () => {
    expect(avisoNetoPallet('', '22')).toBe('se restan 22 kg');
  });
  it('avisa si el pallet pesa más', () => {
    expect(avisoNetoPallet('10', '22')).toMatch(/pesa más/);
  });
});

describe('la tarjeta rearmada desde el ítem', () => {
  it('vuelve como bruto con la tara en su casillero: guardar otra vez resta una sola vez', () => {
    expect(pesoEnTarjeta(278, 22)).toBe('300');
    expect(taraEnTarjeta(22)).toBe('22');
    const otraVez = pesoNetoPallet(pesoEnTarjeta(278, 22), taraEnTarjeta(22));
    expect(otraVez).toMatchObject({ ok: true, neto: 278 });
  });
  it('sin tara, igual que antes', () => {
    expect(pesoEnTarjeta(300, undefined)).toBe('300');
    expect(taraEnTarjeta(undefined)).toBe('');
    expect(pesoEnTarjeta(undefined, 22)).toBe('');
  });
  it('lo que se guarda y lo que se lee', () => {
    expect(taraParaGuardar(0)).toBeUndefined();
    expect(taraParaGuardar(22)).toBe(22);
    expect(textoPesoConTara(278, 22)).toBe('278 kg (300 − 22)');
    expect(textoPesoConTara(278.5, undefined)).toBe('278,5 kg');
  });
});
