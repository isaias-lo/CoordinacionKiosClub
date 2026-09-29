import { describe, it, expect } from 'vitest';
import {
  tipoDeOrigen, tiendaDeDestino, armarCruce, pctDiferencia, kgDiferencia, refsParaCelda,
  type MovimientoOdoo,
} from '../cruceDePesos';

// El catálogo real valida las tiendas. 88ML NO está: es MercadoLibre.
const TIENDAS = new Set(['24SPP', '31TLC', '16PQA', '49PTA', '23PEÑ']);

describe('tipoDeOrigen — el tipo lo declara Odoo', () => {
  it('lee los cuatro tipos del origen real', () => {
    expect(tipoDeOrigen('Abastecimiento Comida 24SPP 29/09/2026')).toBe('comida');
    expect(tipoDeOrigen('Abastecimiento Aseo 24SPP 29/09/2026')).toBe('aseo');
    expect(tipoDeOrigen('Abastecimiento Hogar 49PTA 29/09/2026')).toBe('hogar');
    expect(tipoDeOrigen('Abastecimiento Chocolates 31TLC 29/09/2026')).toBe('chocolate');
  });

  it('tolera el PUNTO FINAL, que existe en los datos reales', () => {
    expect(tipoDeOrigen('Abastecimiento Comida 56EGN 28/09/2026.')).toBe('comida');
  });

  it('CONGELADOS queda fuera: se despacha otro día', () => {
    // Meterlo en una columna daría una diferencia falsa contra el peso de hoy.
    expect(tipoDeOrigen('Abastecimiento Congelados 56EGN 28/09/2026.')).toBeNull();
  });

  it('lo que no es abastecimiento a tienda no entra', () => {
    expect(tipoDeOrigen('Abastecimiento Meli Full 88ML/Stock 28/09/2026')).toBeNull();
    expect(tipoDeOrigen('Abastecimiento Meli Full Etiquetado 28/09/2026')).toBeNull();
  });

  it('AUDITORIA queda fuera: es la MISMA mercadería revalidada', () => {
    // Medido el 28/09: 47 grupos (tipo + tienda) tenían el movimiento normal Y el de auditoría,
    // con el mismo peso al centavo. Ninguno existía solo como auditoría. Contarlos sumaba
    // 8.766 kg fantasma en un solo día.
    expect(tipoDeOrigen('AUDITORIA Abastecimiento Comida 39PSB 28/09/2026')).toBeNull();
    expect(tipoDeOrigen('auditoria abastecimiento aseo 42ANP 28/09/2026')).toBeNull();
  });

  it('un texto nuevo devuelve null en vez de caer en una columna', () => {
    // El modo de falla que evita: un tipo que aparezca mañana inflando "hogar" sin que nadie lo note.
    expect(tipoDeOrigen('Abastecimiento Bazar 24SPP 29/09/2026')).toBeNull();
    expect(tipoDeOrigen('')).toBeNull();
    expect(tipoDeOrigen(null)).toBeNull();
  });
});

describe('tiendaDeDestino — por catálogo, NO por patrón', () => {
  it('acepta el código pelado y el que trae /Entrada', () => {
    expect(tiendaDeDestino('24SPP', TIENDAS)).toBe('24SPP');
    expect(tiendaDeDestino('16PQA/Entrada', TIENDAS)).toBe('16PQA');
  });

  it('RECHAZA 88ML aunque TENGA forma de código de tienda', () => {
    // Este es el punto del catálogo. "88ML" son 2 dígitos y 2 letras: pasa cualquier expresión
    // regular de código. Es MercadoLibre, y sumarlo metería kilos de una tienda que no existe.
    expect(tiendaDeDestino('88ML/Stock', TIENDAS)).toBeNull();
  });

  it('la Ñ no se pierde', () => {
    expect(tiendaDeDestino('23PEÑ/Entrada', TIENDAS)).toBe('23PEÑ');
  });

  it('sin destino, nada', () => {
    for (const v of [null, undefined, '', '  ']) expect(tiendaDeDestino(v, TIENDAS)).toBeNull();
  });
});

describe('armarCruce — cada movimiento suma UNA vez', () => {
  it('EL CASO DE 31TLC: cuatro chocolates, un solo movimiento', () => {
    // Sumando por unidad darían 339,44 kg. El movimiento pesa 84,86.
    const movs: MovimientoOdoo[] = Array.from({ length: 4 }, () => ({
      ref: '99REC/DT/131581', origen: 'Abastecimiento Chocolates 31TLC 29/09/2026',
      destino: '31TLC', kg: 84.86,
    }));
    const [fila] = armarCruce(movs, TIENDAS);
    expect(fila.kg.chocolate).toBeCloseTo(84.86, 2);
    expect(fila.totalOdoo).toBeCloseTo(84.86, 2);
    expect(fila.refs.chocolate).toEqual(['99REC/DT/131581']);
  });

  it('dos movimientos DISTINTOS del mismo tipo sí suman los dos', () => {
    const movs: MovimientoOdoo[] = [
      { ref: '99REC/DT/130922', origen: 'Abastecimiento Comida 16PQA 28/09/2026', destino: '16PQA', kg: 400 },
      { ref: '99REC/DT/131376', origen: 'Abastecimiento Comida 16PQA 28/09/2026', destino: '16PQA', kg: 247.34 },
    ];
    const [fila] = armarCruce(movs, TIENDAS);
    expect(fila.kg.comida).toBeCloseTo(647.34, 2);
    expect(fila.refs.comida).toEqual(['99REC/DT/130922', '99REC/DT/131376']);
  });

  it('reparte por tipo y suma el total de los cuatro', () => {
    const movs: MovimientoOdoo[] = [
      { ref: 'a', origen: 'Abastecimiento Comida 24SPP 29/09/2026',     destino: '24SPP', kg: 210.85 },
      { ref: 'b', origen: 'Abastecimiento Aseo 24SPP 29/09/2026',       destino: '24SPP/Entrada', kg: 52.13 },
      { ref: 'c', origen: 'Abastecimiento Hogar 24SPP 29/09/2026',      destino: '24SPP', kg: 42.32 },
      { ref: 'd', origen: 'Abastecimiento Chocolates 24SPP 29/09/2026', destino: '24SPP', kg: 10 },
    ];
    const [fila] = armarCruce(movs, TIENDAS);
    expect(fila.kg).toEqual({ comida: 210.85, aseo: 52.13, hogar: 42.32, chocolate: 10 });
    expect(fila.totalOdoo).toBeCloseTo(315.30, 2);
  });

  it('descarta congelados y Meli sin tocar el resto', () => {
    const movs: MovimientoOdoo[] = [
      { ref: 'a', origen: 'Abastecimiento Comida 24SPP 29/09/2026', destino: '24SPP', kg: 100 },
      { ref: 'b', origen: 'Abastecimiento Congelados 24SPP 29/09/2026.', destino: '24SPP', kg: 500 },
      { ref: 'c', origen: 'Abastecimiento Meli Full 88ML/Stock 28/09/2026', destino: '88ML/Stock', kg: 900 },
    ];
    const [fila] = armarCruce(movs, TIENDAS);
    expect(fila.totalOdoo).toBe(100);
  });

  it('una tienda por fila, ordenadas por código', () => {
    const movs: MovimientoOdoo[] = [
      { ref: 'a', origen: 'Abastecimiento Comida 31TLC 29/09/2026', destino: '31TLC', kg: 10 },
      { ref: 'b', origen: 'Abastecimiento Comida 16PQA 29/09/2026', destino: '16PQA', kg: 20 },
    ];
    expect(armarCruce(movs, TIENDAS).map(f => f.codigo)).toEqual(['16PQA', '31TLC']);
  });

  it('sin movimientos válidos no inventa filas', () => {
    expect(armarCruce([], TIENDAS)).toEqual([]);
    expect(armarCruce([{ ref: 'x', origen: 'otra cosa', destino: 'XXX', kg: 5 }], TIENDAS)).toEqual([]);
  });

  it('un peso ausente o basura cuenta como cero, no rompe la suma', () => {
    const movs = [
      { ref: 'a', origen: 'Abastecimiento Comida 24SPP 29/09/2026', destino: '24SPP', kg: undefined },
      { ref: 'b', origen: 'Abastecimiento Aseo 24SPP 29/09/2026',   destino: '24SPP', kg: 30 },
    ] as unknown as MovimientoOdoo[];
    expect(armarCruce(movs, TIENDAS)[0].totalOdoo).toBe(30);
  });
});

describe('pctDiferencia', () => {
  it('positivo cuando Bodega pesó de más', () => {
    expect(pctDiferencia(110, 100)).toBeCloseTo(10, 5);
    expect(pctDiferencia(90, 100)).toBeCloseTo(-10, 5);
  });

  it('sin kilos de Odoo devuelve null, no 0 ni 100', () => {
    // Un porcentaje inventado se lee como un hallazgo. La celda tiene que quedar vacía.
    expect(pctDiferencia(50, 0)).toBeNull();
    expect(pctDiferencia(0, 0)).toBeNull();
  });

  it('Bodega sin pesar contra Odoo con kilos da -100%', () => {
    expect(pctDiferencia(0, 200)).toBeCloseTo(-100, 5);
  });
});

describe('refsParaCelda', () => {
  it('la referencia va COMPLETA, para poder pegarla en el buscador de Odoo', () => {
    // Al principio le sacaba el prefijo. El coordinador pidió la referencia entera: así se copia
    // de la celda y se busca en Odoo sin reconstruir nada.
    expect(refsParaCelda(['99REC/DT/131559', '99REC/DT/131376']))
      .toBe('99REC/DT/131559, 99REC/DT/131376');
  });

  it('sin referencias, celda vacía', () => {
    expect(refsParaCelda([])).toBe('');
  });

  it('descarta las vacías en vez de dejar comas sueltas', () => {
    expect(refsParaCelda(['99REC/DT/131559', '', '  '])).toBe('99REC/DT/131559');
  });
});

describe('kgDiferencia — cuánto pesa la diferencia', () => {
  it('Bodega menos Odoo, con signo', () => {
    // El ejemplo del coordinador: «Odoo 700, Total bodega 730, Peso diferencia 30».
    expect(kgDiferencia(730, 700)).toBe(30);
    expect(kgDiferencia(670, 700)).toBe(-30);
    expect(kgDiferencia(700, 700)).toBe(0);
  });

  it('el caso real de 24SPP del 29/09', () => {
    // Odoo 776,58 · Bodega 358,9 · −53,8%. El porcentaje ordena; los kilos dicen cuánto duele.
    expect(kgDiferencia(358.9, 776.58)).toBeCloseTo(-417.68, 2);
  });

  it('con Odoo en cero SÍ devuelve un número, al revés que el porcentaje', () => {
    // Un porcentaje contra cero no significa nada y por eso `pctDiferencia` devuelve null. Los
    // kilos sí: quieren decir que llegó carga que Odoo no registra, y eso hay que poder verlo.
    expect(pctDiferencia(50, 0)).toBeNull();
    expect(kgDiferencia(50, 0)).toBe(50);
  });

  it('lo que no es número cuenta como cero, no como NaN', () => {
    expect(kgDiferencia(NaN, 100)).toBe(-100);
    expect(kgDiferencia(100, NaN)).toBe(100);
  });
});
