import { describe, it, expect } from 'vitest';
import {
  leerPeso, limpiarTecleo, avisoDePeso, excedeTopeDuro, TOPE_AVISO_KG, TOPE_DURO_KG,
} from '../pesoIngresado';
import { LIMITES } from '../../regiones/data/tiendas';

describe('leerPeso — la coma es separador decimal', () => {
  it('EL CASO QUE ORIGINÓ TODO: la coma ya no se pierde', () => {
    // Con `<input type="number">` el navegador descartaba la coma y «353,7» quedaba en «3537»:
    // el peso multiplicado por diez, sin un solo aviso. Es lo que dejó un pallet de 9.357 kg en
    // 55ITA el 28/09, en una tienda que recibió 606 kg ese día entero.
    expect(leerPeso('353,7')).toBe(353.7);
    expect(leerPeso('3537')).toBe(3537);
    expect(leerPeso('353,7')).not.toBe(leerPeso('3537'));
  });

  it('el punto sigue funcionando, porque es lo que ya está guardado', () => {
    // 93 pesos del histórico se escribieron con punto, y reconstruir una fila guardada produce
    // `String(17.1)`. Rechazar el punto rompería la vuelta.
    expect(leerPeso('17.1')).toBe(17.1);
    expect(leerPeso('704.5')).toBe(704.5);
  });

  it('acepta un número tal cual, sin pasar por texto', () => {
    expect(leerPeso(353.7)).toBe(353.7);
  });

  it('lo que no es un peso da null, NO cero', () => {
    // Cero no es "vacío": el sistema entero lee peso 0 como "sin pesar" (`esSinPesar`). Devolver 0
    // acá convertiría "no escribió nada" en "lo pesé y pesa cero", que es otra afirmación.
    expect(leerPeso('')).toBeNull();
    expect(leerPeso('   ')).toBeNull();
    expect(leerPeso('abc')).toBeNull();
    expect(leerPeso('kg')).toBeNull();
    expect(leerPeso(null)).toBeNull();
    expect(leerPeso(undefined)).toBeNull();
    expect(leerPeso('0')).toBeNull();
    expect(leerPeso('0,0')).toBeNull();
  });

  it('un peso negativo se rechaza en vez de volverse positivo', () => {
    // Limpiar el signo a secas convertiría −5 en 5 sin que nadie se entere.
    expect(leerPeso('-5')).toBeNull();
    expect(leerPeso(-5)).toBeNull();
  });

  it('tolera lo que se cuela al pegar desde otro lado', () => {
    expect(leerPeso(' 353,7 ')).toBe(353.7);
    expect(leerPeso('353,7 kg')).toBe(353.7);
  });

  it('con dos separadores manda el último', () => {
    // «1.234,5» es mil doscientos treinta y cuatro con medio en cualquiera de las dos escrituras.
    expect(leerPeso('1.234,5')).toBe(1234.5);
    expect(leerPeso('1,234.5')).toBe(1234.5);
  });

  it('un separador suelto es SIEMPRE decimal, nunca de miles', () => {
    // Acá no se pesa nada que llegue a los mil kilos —el pallet más pesado del histórico legítimo
    // ronda los 700—, así que «1.200» es mucho más probablemente 1,2 que mil doscientos.
    expect(leerPeso('1.200')).toBe(1.2);
    expect(leerPeso('1,200')).toBe(1.2);
  });

  it('el separador al principio o al final no rompe nada', () => {
    expect(leerPeso(',5')).toBe(0.5);
    expect(leerPeso('.5')).toBe(0.5);
    expect(leerPeso('353,')).toBe(353);   // el estado justo antes de teclear el decimal
  });
});

describe('limpiarTecleo — deja escribir, no pelea', () => {
  it('deja pasar el estado intermedio de tipear un decimal', () => {
    // «353,» es lo que hay en pantalla un instante antes del 7. Si se limpiara a «353» el campo
    // borraría la coma apenas la escriben y sería imposible poner un decimal.
    expect(limpiarTecleo('353,')).toBe('353,');
    expect(limpiarTecleo('353,7')).toBe('353,7');
  });

  it('saca lo que no puede ser parte de un peso', () => {
    expect(limpiarTecleo('35a3')).toBe('353');
    expect(limpiarTecleo('-353')).toBe('353');
    expect(limpiarTecleo('3 5 3')).toBe('353');
    expect(limpiarTecleo('353e5')).toBe('3535');
  });

  it('deja UN solo separador: el primero', () => {
    expect(limpiarTecleo('35,5,5')).toBe('35,55');
    expect(limpiarTecleo('35.5.5')).toBe('35.55');
    expect(limpiarTecleo('35,5.5')).toBe('35,55');
  });

  it('respeta el separador que eligió la persona', () => {
    // Ni convierte la coma en punto ni al revés: el campo no tiene por qué corregirle la escritura
    // a nadie mientras `leerPeso` entienda las dos.
    expect(limpiarTecleo('17.1')).toBe('17.1');
    expect(limpiarTecleo('17,1')).toBe('17,1');
  });

  it('lo vacío queda vacío', () => {
    expect(limpiarTecleo('')).toBe('');
    expect(limpiarTecleo('kg')).toBe('');
  });
});

describe('avisoDePeso — atrapa lo imposible sin molestar a nadie', () => {
  it('EL CASO REAL: 9.357 kg en un pallet se avisa', () => {
    const a = avisoDePeso(9357, 'pallet');
    expect(a).not.toBeNull();
    expect(a?.titulo).toContain('9.357');
    expect(a?.detalle).toContain('coma');
  });

  it('un pallet normal NO avisa', () => {
    // La mediana real es 219 kg y el 99% pesa menos de 692. Estos tres son días cualquiera.
    expect(avisoDePeso(219, 'pallet')).toBeNull();
    expect(avisoDePeso(490, 'pallet')).toBeNull();
    expect(avisoDePeso(692, 'pallet')).toBeNull();
  });

  it('el tope de cada clase sale de su propia distribución', () => {
    // Un bulto de 300 kg es tan raro como un pallet de 9.357, pero 300 en un pallet es un martes.
    expect(avisoDePeso(300, 'pallet')).toBeNull();
    expect(avisoDePeso(300, 'bulto')).not.toBeNull();
    expect(avisoDePeso(300, 'chocolate')).not.toBeNull();
    expect(avisoDePeso(300, 'contenedor')).toBeNull();
  });

  it('justo en el tope no avisa; un gramo más sí', () => {
    for (const clase of ['pallet', 'bulto', 'chocolate', 'contenedor'] as const) {
      const tope = TOPE_AVISO_KG[clase];
      expect(avisoDePeso(tope, clase)).toBeNull();
      expect(avisoDePeso(tope + 0.1, clase)).not.toBeNull();
    }
  });

  it('sin peso no hay aviso', () => {
    // El campo vacío ya tiene su propio mensaje ("Ingresa el peso"); dos avisos encima serían ruido.
    expect(avisoDePeso(null, 'pallet')).toBeNull();
    expect(avisoDePeso(0, 'pallet')).toBeNull();
  });

  it('NO sugiere un número corregido', () => {
    // Poner "¿serán 94,2?" delante de alguien apurado invita a aceptarlo sin pensar, y sería
    // adivinar: un 942 mal tecleado puede ser 442. El aviso manda a mirar la balanza, no opina.
    expect(avisoDePeso(942, 'pallet')?.detalle).not.toContain('94,2');
    expect(avisoDePeso(3537, 'pallet')?.detalle).not.toContain('¿Serán');
  });
});

describe('excedeTopeDuro — el techo que no se puede confirmar', () => {
  it('9.357 kg no se guarda ni confirmando', () => {
    // Lo que de verdad faltaba: RM/Costa no tenía NINGÚN tope de peso, y 55ITA es RM. El aviso
    // pregunta a los 800; esto no deja pasar de 1.000 aunque alguien toque "sí" sin leer.
    expect(excedeTopeDuro(9357, 'pallet')).not.toBeNull();
    expect(excedeTopeDuro(9357, 'pallet')).toContain('coma');
  });

  it('deja pasar el pallet más pesado que existió de verdad', () => {
    // El máximo legítimo del histórico son 704,5 kg. Un techo que lo rechazara sería inservible.
    expect(excedeTopeDuro(704.5, 'pallet')).toBeNull();
    expect(excedeTopeDuro(999, 'pallet')).toBeNull();
  });

  it('avisa antes de bloquear: los dos topes en orden', () => {
    // 800 pregunta, 1.000 no deja. Un tope duro por debajo del de aviso haría el aviso inalcanzable.
    for (const clase of ['pallet', 'bulto', 'chocolate', 'contenedor'] as const) {
      expect(TOPE_DURO_KG[clase]).toBeGreaterThan(TOPE_AVISO_KG[clase]);
    }
  });

  it('sin peso no bloquea nada', () => {
    expect(excedeTopeDuro(null, 'pallet')).toBeNull();
    expect(excedeTopeDuro(0, 'pallet')).toBeNull();
  });
});

describe('los dos espejos usan el MISMO techo', () => {
  it('LIMITES de Nacional lee la definición única, no una copia', () => {
    // Este test es la razón de ser del refactor. Los topes de peso vivían solo en `LIMITES`
    // (Nacional) y RM/Costa no tenía ninguno: esa asimetría es la que dejó entrar el 9.357. Si
    // alguien vuelve a escribir un número a mano en `LIMITES`, esto se cae.
    expect(LIMITES.pallet.pesoMax).toBe(TOPE_DURO_KG.pallet);
    expect(LIMITES.box.pesoMax).toBe(TOPE_DURO_KG.bulto);
    expect(LIMITES.chocolate.pesoMax).toBe(TOPE_DURO_KG.chocolate);
  });
});

describe('el par leerPeso + avisoDePeso, que es como se usa', () => {
  it('lo tecleado con coma pasa; lo mismo sin coma se avisa', () => {
    // Las dos mitades del arreglo, juntas: aceptar la coma hace que el peso correcto entre sin
    // pelea, y el tope atrapa justo el caso en que la coma faltó.
    expect(avisoDePeso(leerPeso('353,7'), 'pallet')).toBeNull();
    expect(avisoDePeso(leerPeso('3537'), 'pallet')).not.toBeNull();
  });
});
