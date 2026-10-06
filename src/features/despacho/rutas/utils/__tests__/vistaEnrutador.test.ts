import { describe, it, expect } from 'vitest';
import { leerVista } from '../vistaEnrutador';

describe('leerVista', () => {
  it('solo «nueva» activa la vista nueva', () => {
    expect(leerVista('nueva')).toBe('nueva');
  });
  it('sin preferencia o con basura, la clásica', () => {
    for (const v of [null, undefined, '', 'clasica', 'NUEVA', 'true']) expect(leerVista(v)).toBe('clasica');
  });
});
