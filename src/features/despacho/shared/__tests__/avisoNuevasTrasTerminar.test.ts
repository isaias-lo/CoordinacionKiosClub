import { describe, expect, it } from 'vitest';
import { nuevasQueSubieron, textoAvisoNuevas } from '../avisoNuevasTrasTerminar';

const t = (cod: string, nuevas: number) => ({ cod, nombre: `Tienda ${cod}`, nuevas });

describe('aviso de unidades nuevas tras terminar', () => {
  it('al abrir la pantalla no avisa: la lista ya lo cuenta', () => {
    expect(nuevasQueSubieron(null, [t('53', 1)])).toEqual([]);
  });
  it('avisa cuando sube', () => {
    expect(nuevasQueSubieron(new Map([['53', 0]]), [t('53', 1), t('12', 0)])).toEqual([t('53', 1)]);
  });
  it('no avisa cuando baja o queda igual', () => {
    expect(nuevasQueSubieron(new Map([['53', 2]]), [t('53', 1)])).toEqual([]);
    expect(nuevasQueSubieron(new Map([['53', 1]]), [t('53', 1)])).toEqual([]);
  });
  it('cuenta solo lo nuevo', () => {
    expect(textoAvisoNuevas(t('53', 3), 1)).toBe('⚠ Tienda 53: Picking imprimió 2 unidades después de terminarla');
  });
});
