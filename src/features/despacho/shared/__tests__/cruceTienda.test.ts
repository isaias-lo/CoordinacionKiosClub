import { describe, it, expect } from 'vitest';
import {
  veElCruce, estadoCruce, armarBloqueCruce, fraseDeEstado,
  TOLERANCIA_PCT, TOLERANCIA_KG,
} from '../cruceTienda';
import type { FilaCruce } from '../cruceDePesos';

const cruce = (totalOdoo: number, extra: Partial<FilaCruce> = {}): FilaCruce => ({
  codigo: '24SPP',
  refs: { comida: ['99REC/DT/131559'], aseo: [], hogar: [], chocolate: [] },
  kg:   { comida: totalOdoo, aseo: 0, hogar: 0, chocolate: 0 },
  totalOdoo,
  ...extra,
});
const pallet = (peso: number) => ({ peso, tipo: 'Pallet' });

describe('veElCruce — solo administración', () => {
  it('solo el rol admin', () => {
    // El cruce compara el trabajo del andén contra Odoo: no es información de operación.
    expect(veElCruce('admin')).toBe(true);
    expect(veElCruce('ADMIN')).toBe(true);
    expect(veElCruce('supervisor')).toBe(false);
    expect(veElCruce('despachador')).toBe(false);
    expect(veElCruce('supervisor-picking')).toBe(false);
    expect(veElCruce(undefined)).toBe(false);
    expect(veElCruce(null)).toBe(false);
  });
});

describe('estadoCruce — el umbral, que es lo que decide si esto sirve o es ruido', () => {
  it('HACEN FALTA LAS DOS CONDICIONES: el % y los kilos', () => {
    // Medido sobre las 58 filas reales: la mediana de |% dif| es 10,4. Un umbral solo de
    // porcentaje pintaría de rojo la mitad de las tarjetas todos los días — la misma trampa que
    // `manualPesaje.ts` documenta para los pallets altos.
    //
    // Un −40% sobre una tienda de 50 kg son 20 kg y no le importa a nadie.
    expect(estadoCruce(30, 50)).toBe('cuadra');      // −40% pero solo −20 kg
    // Un −5% sobre una de 1.500 son 75 kg… y tampoco llega al corte de kilos.
    expect(estadoCruce(1425, 1500)).toBe('cuadra');  // −5%, −75 kg
    // Las dos juntas: eso sí.
    expect(estadoCruce(600, 1000)).toBe('revisar');  // −40% y −400 kg
  });

  it('los casos REALES que tiene que marcar', () => {
    expect(estadoCruce(419.28, 1191.45)).toBe('revisar');  // 42ANP  −64,8%  −772 kg
    expect(estadoCruce(1216, 1936.93)).toBe('revisar');    // 12LAS  −37,2%  −721 kg
    expect(estadoCruce(190.9, 763.52)).toBe('revisar');    // 29CFL  −75,0%  −573 kg
    expect(estadoCruce(1003, 1350.3)).toBe('revisar');     // 59EGN  −25,7%  −347 kg
  });

  it('los casos reales que tiene que DEJAR EN PAZ', () => {
    expect(estadoCruce(569.7, 606.28)).toBe('cuadra');   // 55ITA  −6,0%
    expect(estadoCruce(358.9, 344.71)).toBe('cuadra');   // 24SPP  +4,1%
    expect(estadoCruce(310.55, 323.34)).toBe('cuadra');  // 75PUC  −4,0%
    expect(estadoCruce(293, 358.66)).toBe('cuadra');     // 58TAM  −18,3%  −66 kg
    expect(estadoCruce(467.5, 516.8)).toBe('cuadra');    // 26ALC   −9,5%  −49 kg
  });

  it('justo en el borde no marca: hacen falta AMBOS estrictamente por encima', () => {
    const odoo = 1000;
    const bodega = odoo * (1 - TOLERANCIA_PCT / 100);          // exactamente −25%
    expect(estadoCruce(bodega, odoo)).toBe('cuadra');
    expect(Math.abs(odoo - bodega)).toBeGreaterThan(TOLERANCIA_KG);  // y los kg sí pasan
  });

  it('SIN PESAR no es cero', () => {
    // Un 0 daría −100% y se leería como "no llegó nada", que es otra afirmación y más grave.
    expect(estadoCruce(null, 500)).toBe('sin-pesar');
    expect(estadoCruce(0, 500)).toBe('sin-pesar');
  });

  it('con Odoo en cero no hay porcentaje que juzgar', () => {
    expect(estadoCruce(120, 0)).toBe('cuadra');
  });
});

describe('armarBloqueCruce', () => {
  it('suma los kilos de Bodega y cuenta las unidades pesadas', () => {
    const b = armarBloqueCruce(cruce(305.3), [pallet(100), pallet(188.4), { peso: 0, tipo: 'Pallet' }]);
    expect(b.kgBodega).toBe(288.4);
    expect(b.pesadas).toBe(2);
    expect(b.unidades).toBe(3);
  });

  it('los agregados NO cuentan como pendientes de pesar', () => {
    // Una adquisición nace completa: pedirle un peso sería pedir algo que no va a llegar.
    const b = armarBloqueCruce(cruce(100), [pallet(100), { peso: 0, tipo: 'Adquisicion' }]);
    expect(b.pesadas).toBe(2);
    expect(b.unidades).toBe(2);
  });

  it('sin nada pesado, kgBodega es null y no cero', () => {
    const b = armarBloqueCruce(cruce(126.24), [{ peso: 0, tipo: 'Pallet' }]);
    expect(b.kgBodega).toBeNull();
    expect(b.kgDif).toBeNull();
    expect(b.pctDif).toBeNull();
    expect(b.estado).toBe('sin-pesar');
  });

  it('una línea por tipo CON movimientos; los vacíos no ocupan lugar', () => {
    // La tarjeta es chica: una fila en cero no dice nada y empuja las tiendas fuera de la pantalla.
    const c = cruce(100, {
      refs: { comida: ['99REC/DT/1'], aseo: ['99REC/DT/2'], hogar: [], chocolate: [] },
      kg:   { comida: 60, aseo: 40, hogar: 0, chocolate: 0 },
    });
    const b = armarBloqueCruce(c, [pallet(95)]);
    expect(b.movimientos.map(m => m.tipo)).toEqual(['comida', 'aseo']);
    expect(b.movimientos[0].refs).toEqual(['99REC/DT/1']);
  });

  it('sin fila de Odoo no se rompe: queda en cero y sin movimientos', () => {
    const b = armarBloqueCruce(null, [pallet(50)]);
    expect(b.kgOdoo).toBe(0);
    expect(b.movimientos).toEqual([]);
  });

  it('una tienda vacía no inventa nada', () => {
    const b = armarBloqueCruce(null, []);
    expect([b.kgBodega, b.unidades, b.estado]).toEqual([null, 0, 'sin-pesar']);
  });
});

describe('fraseDeEstado — decir qué hacer, sin acusar', () => {
  it('cuando hay que revisar, nombra LAS DOS causas y no elige', () => {
    // Desde la tarjeta no se puede saber cuál es; afirmar una sería adivinar.
    const f = fraseDeEstado(armarBloqueCruce(cruce(1000), [pallet(600)]));
    expect(f).toContain('Falta registrar carga');
    expect(f).toContain('no llegó al andén');
  });

  it('antes de pesar dice qué esperar, no un reproche', () => {
    const f = fraseDeEstado(armarBloqueCruce(cruce(126.24), [{ peso: 0, tipo: 'Pallet' }]));
    expect(f).toContain('126,24');
    expect(f).toContain('cuando se pese');
  });

  it('sin movimientos de Odoo lo dice, en vez de hablar de kilos', () => {
    expect(fraseDeEstado(armarBloqueCruce(null, []))).toContain('Todavía no hay movimientos');
  });

  it('cuando cuadra, no da un sermón', () => {
    expect(fraseDeEstado(armarBloqueCruce(cruce(100), [pallet(98)]))).toBe('Dentro de lo normal.');
  });
});
