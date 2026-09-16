import { describe, it, expect } from 'vitest';
import {
  parseVentana, normalizarVentana, estadoVentana, aMinutosDelDia,
  durezaPorFormato, cierreEfectivo, SIN_RESTRICCION, BUFFER_CIERRE_MIN,
  ventanaSegunCarga, catalogoParaCarga,
} from '../ventanaHoraria';

describe('normalizarVentana — las escrituras REALES de la tabla de congelados', () => {
  const casos: [string, string][] = [
    ['09:00 a 12:00',            '09:00-12:00'],  // 22LGN, 07CCR — el formato de casi toda la tabla
    ['9:30 a 17:00',             '09:30-17:00'],  // 18FLO — hora de un dígito
    ['08.00 a 12.00',            '08:00-12:00'],  // 17MAI — con PUNTOS
    ['6:30 a 10:00',             '06:30-10:00'],  // 26ALC — abre antes que el CD
    ['8:00 a 9:30 ',             '08:00-09:30'],  // 49PTA — espacio al final
    ['           08:30 a 12:00', '08:30-12:00'],  // 09LEO — sangría de la celda
    [' 09:30 a 12:00',           '09:30-12:00'],  // 16PQA — espacio al principio
    ['08:30 a 12:00 ',           '08:30-12:00'],  // 19SUB
    ['9:00 a 9:30',              '09:00-09:30'],  // 20CTC — 30 minutos, la más apretada
  ];

  it.each(casos)('%s → %s', (entrada, esperado) => {
    expect(normalizarVentana(entrada)).toEqual({ valor: esperado, reconocida: true });
  });

  it('lo que YA está canónico no se toca', () => {
    expect(normalizarVentana('09:00-12:00')).toEqual({ valor: '09:00-12:00', reconocida: true });
  });

  it('tolera el guion con espacios, como lo tiene GD en la base', () => {
    expect(normalizarVentana('11:00 - 12:00').valor).toBe('11:00-12:00');
  });
});

describe('normalizarVentana — "sin restricciones" y sus tres escrituras', () => {
  // En la tabla aparece de tres formas, una con una sola c.
  it.each(['sin restriciones', 'Sin restricciones', 'sin restricción', 'SIN RESTRICCION', '  sin  restricciones  '])(
    '%s → SIN RESTRICCIÓN', (t) => {
      expect(normalizarVentana(t)).toEqual({ valor: SIN_RESTRICCION, reconocida: true });
    });

  it('el valor guardado NO restringe el ruteo: se comporta igual que vacío', () => {
    expect(parseVentana(SIN_RESTRICCION)).toBeNull();
    expect(estadoVentana(600, SIN_RESTRICCION)).toBe('sin-ventana');
  });
});

describe('normalizarVentana — vacío no es lo mismo que sin restricción', () => {
  it.each(['', '   ', null, undefined])('%s queda vacío: falta el dato', (t) => {
    expect(normalizarVentana(t)).toEqual({ valor: '', reconocida: true });
  });

  it('vacío y SIN RESTRICCIÓN se distinguen, aunque rutean igual', () => {
    expect(normalizarVentana('').valor).not.toBe(normalizarVentana('sin restricciones').valor);
  });
});

describe('normalizarVentana — lo que no entiende lo DICE, no lo borra', () => {
  it('un texto libre vuelve tal cual, marcado como no reconocido', () => {
    expect(normalizarVentana('a convenir con el local')).toEqual(
      { valor: 'a convenir con el local', reconocida: false });
  });

  it('una hora suelta no alcanza para una ventana', () => {
    expect(normalizarVentana('09:00')).toMatchObject({ reconocida: false });
  });

  it('una ventana invertida es un dato malo, no se normaliza', () => {
    expect(normalizarVentana('17:00 a 09:00')).toMatchObject({ reconocida: false });
  });

  it('horas imposibles no pasan', () => {
    expect(normalizarVentana('25:00 a 26:00')).toMatchObject({ reconocida: false });
    expect(normalizarVentana('09:99 a 10:00')).toMatchObject({ reconocida: false });
  });

  it('NUNCA devuelve vacío por no entender: eso haría desaparecer la ventana en silencio', () => {
    for (const t of ['a convenir', '09:00', '17:00 a 09:00', 'mañana temprano']) {
      const r = normalizarVentana(t);
      expect(r.reconocida).toBe(false);
      expect(r.valor).not.toBe('');
    }
  });
});

describe('normalizarVentana — varios tramos se conservan', () => {
  // 36CHL recibe de mañana y de noche. `parseVentana` ya sabe quedarse con el de la mañana.
  it('Chillán conserva sus dos tramos', () => {
    expect(normalizarVentana('08:00-09:00 / 20:00-21:00').valor).toBe('08:00-09:00 / 20:00-21:00');
  });

  it('y el ruteo sigue usando el de la mañana', () => {
    expect(parseVentana(normalizarVentana('08:00-09:00 / 20:00-21:00').valor))
      .toEqual({ abre: 480, cierra: 540 });
  });

  it('un tramo inválido se descarta sin tumbar al válido', () => {
    expect(normalizarVentana('17:00 a 09:00 / 20:00 a 21:00').valor).toBe('20:00-21:00');
  });
});

describe('normalizar y volver a parsear: el viaje completo del dato', () => {
  it('lo que normalizarVentana acepta, parseVentana lo entiende', () => {
    for (const t of ['09:00 a 12:00', '08.00 a 12.00', '6:30 a 10:00', '9:30 a 17:00']) {
      const { valor } = normalizarVentana(t);
      expect(parseVentana(valor)).not.toBeNull();
    }
  });

  it('16PQA: el horario que confirmó la tienda', () => {
    const { valor } = normalizarVentana('9:30 a 11:30');
    expect(valor).toBe('09:30-11:30');
    expect(parseVentana(valor)).toEqual({ abre: 570, cierra: 690 });
  });
});

describe('parseVentana — la red para lo escrito a mano', () => {
  it('entiende " a " sin pasar por el normalizador', () => {
    expect(parseVentana('09:00 a 12:00')).toEqual({ abre: 540, cierra: 720 });
  });

  it('entiende los puntos', () => {
    expect(parseVentana('08.00 a 12.00')).toEqual({ abre: 480, cierra: 720 });
  });

  it('sigue rechazando lo que rechazaba', () => {
    expect(parseVentana('')).toBeNull();
    expect(parseVentana('08:30')).toBeNull();
    expect(parseVentana('xx-yy')).toBeNull();
    expect(parseVentana('12:00-09:00')).toBeNull();
  });
});

describe('ventanaSegunCarga — los casos reales de la tabla', () => {
  const PQA = { v: '09:30-11:30', vCong: '09:30-11:30' };  // igual en ambas, confirmado con la tienda
  const MUT = { v: '08:30-09:30', vCong: '09:00-17:00' };  // congelados 8 h más ancha
  const ALC = { v: '09:00-10:30', vCong: '06:30-10:00' };  // congelados abre 2½ h antes
  const NUC = { v: '09:00-12:00', vCong: SIN_RESTRICCION };
  const EGN = { v: '08:30-13:00', vCong: '' };             // falta el dato de congelados
  const REG = { v: '09:00-11:00' };                        // regiones: la tabla era solo RM

  it('seco siempre usa la de seco, tenga o no la de congelados', () => {
    expect(ventanaSegunCarga(MUT, 'seco')).toBe('08:30-09:30');
    expect(ventanaSegunCarga(NUC, 'seco')).toBe('09:00-12:00');
  });

  it('congelados usa la suya cuando la tiene', () => {
    expect(ventanaSegunCarga(MUT, 'congelados')).toBe('09:00-17:00');
    expect(ventanaSegunCarga(ALC, 'congelados')).toBe('06:30-10:00');
  });

  it('SIN RESTRICCIÓN es un valor real y gana sobre la de seco', () => {
    expect(ventanaSegunCarga(NUC, 'congelados')).toBe(SIN_RESTRICCION);
    expect(parseVentana(ventanaSegunCarga(NUC, 'congelados'))).toBeNull();  // no restringe
  });

  it('sin dato de congelados cae a la de seco: nada empeora respecto de hoy', () => {
    expect(ventanaSegunCarga(EGN, 'congelados')).toBe('08:30-13:00');
    expect(ventanaSegunCarga(REG, 'congelados')).toBe('09:00-11:00');
  });

  it('una tienda que no está en el catálogo no revienta', () => {
    expect(ventanaSegunCarga(undefined, 'congelados')).toBe('');
  });

  it('cuando son iguales da lo mismo el tipo de carga', () => {
    expect(ventanaSegunCarga(PQA, 'seco')).toBe(ventanaSegunCarga(PQA, 'congelados'));
  });
});

describe('catalogoParaCarga — el motor sigue leyendo `v` y no sabe de congelados', () => {
  const cat = {
    '52MUT': { v: '08:30-09:30', vCong: '09:00-17:00', tipo: 'MALL' },
    '59EGN': { v: '08:30-13:00', vCong: '', tipo: 'MALL' },
    '21NUC': { v: '09:00-12:00', vCong: SIN_RESTRICCION, tipo: 'STRIPCENTER' },
  };

  it('para seco devuelve el MISMO objeto, sin copiar', () => {
    expect(catalogoParaCarga(cat, 'seco')).toBe(cat);
  });

  it('para congelados reemplaza `v` por la que aplica', () => {
    const c = catalogoParaCarga(cat, 'congelados');
    expect(c['52MUT'].v).toBe('09:00-17:00');
    expect(c['21NUC'].v).toBe(SIN_RESTRICCION);
    expect(c['59EGN'].v).toBe('08:30-13:00');   // sin dato → la de seco
  });

  it('no toca el resto de los campos: el tipo sigue decidiendo la dureza', () => {
    expect(catalogoParaCarga(cat, 'congelados')['52MUT'].tipo).toBe('MALL');
  });

  it('no muta el catálogo original', () => {
    catalogoParaCarga(cat, 'congelados');
    expect(cat['52MUT'].v).toBe('08:30-09:30');
  });

  it('el caso que lo justifica: con la ventana de seco, congelados apunta a otra hora', () => {
    // 52MUT recibe frío hasta las 17:00, pero con la ventana de seco cierra 09:30.
    expect(parseVentana(catalogoParaCarga(cat, 'seco')['52MUT'].v)!.cierra).toBe(9 * 60 + 30);
    expect(parseVentana(catalogoParaCarga(cat, 'congelados')['52MUT'].v)!.cierra).toBe(17 * 60);
  });
});

describe('lo que ya estaba y no cambia', () => {
  it('aMinutosDelDia', () => {
    expect(aMinutosDelDia('09:30')).toBe(570);
    expect(aMinutosDelDia('24:00')).toBeNull();
  });

  it('un MALL tiene ventana dura; el resto, blanda', () => {
    expect(durezaPorFormato('MALL')).toBe('dura');
    expect(durezaPorFormato('STRIPCENTER')).toBe('blanda');
  });

  it('el cierre efectivo descuenta el colchón sin bajar de la apertura', () => {
    expect(cierreEfectivo({ abre: 540, cierra: 720 })).toBe(720 - BUFFER_CIERRE_MIN);
    expect(cierreEfectivo({ abre: 540, cierra: 545 })).toBe(540);
  });
});
