import { describe, it, expect } from 'vitest';
import { avisoDeUnidad, kg } from '../avisoUnidadEscaneada';

describe('kg — como lo escribe la gente acá', () => {
  it('coma decimal, y sin decimales cuando son cero', () => {
    expect(kg(17)).toBe('17 kg');
    expect(kg(20.5)).toBe('20,5 kg');
    expect(kg(245)).toBe('245 kg');
  });

  it('redondea a un decimal: el dato no tiene más precisión que esa', () => {
    expect(kg(13.47)).toBe('13,5 kg');
    expect(kg(199.96)).toBe('200 kg');
  });
});

describe('avisoDeUnidad — qué decir al escanear una etiqueta', () => {
  it('nadie la cargó: no se dice nada', () => {
    // El caso normal. Un aviso acá sería ruido en cada escaneo.
    expect(avisoDeUnidad(undefined)).toEqual({ estado: 'sin-cargar', peso: null, texto: null, advertir: false });
    expect(avisoDeUnidad(null).texto).toBeNull();
  });

  it('YA PESADA: se advierte, con el peso que hay', () => {
    // Es el 14–23% de retrabajo que se midió el 17/09: volver a pesar algo que un compañero ya pesó.
    expect(avisoDeUnidad({ peso: 245 })).toEqual({
      estado: 'pesada', peso: 245, texto: 'Ya pesado · 245 kg', advertir: true,
    });
  });

  it('la caja negra con su tara descontada se lee bien', () => {
    // 20,5 brutos − 3,5 de tara = 17 netos (ver subtipoCaja.ts).
    expect(avisoDeUnidad({ peso: 17 }).texto).toBe('Ya pesado · 17 kg');
  });

  it('"agregado sin pesar" se informa, pero NO se pinta como advertencia', () => {
    // Es el estado normal de algo que está por pesarse. Si todo lo pendiente gritara, el grito
    // dejaría de significar algo justo cuando aparezca el caso que importa.
    const a = avisoDeUnidad({ peso: 0 });
    expect(a.estado).toBe('sin-pesar');
    expect(a.advertir).toBe(false);
    expect(a.texto).toBe('Agregado sin pesar');
  });

  it('peso 0 quiere decir "no se pesó", nunca "pesa cero"', () => {
    // La regla de `esSinPesar`, que es de donde sale: un ítem pesado de verdad siempre tiene > 0.
    for (const p of [0, null, undefined, -1]) {
      expect(avisoDeUnidad({ peso: p as number }).estado).toBe('sin-pesar');
    }
  });

  it('un peso chiquito pero real sí cuenta como pesado', () => {
    expect(avisoDeUnidad({ peso: 0.5 })).toMatchObject({ estado: 'pesada', advertir: true });
  });
});
