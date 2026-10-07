import { describe, it, expect } from 'vitest';
import { soltarTiendasAjenas } from '../itemsDelEspejo';

// ── LOS DOS CONTEOS DEL 06/10/2026 ────────────────────────────────────────────────────────────
//
// En la MISMA pantalla de RM/Costa: el encabezado de la lista decía 59P / 19 tiendas y el Resumen
// en tiempo real decía 60P / 20. Los dos bien calculados — el filtro de Regiones estaba en la
// lista y no en el contador. La diferencia era 60PBL, con un pallet.

type It = { tipo: string };
const P = (n: number): It[] => Array.from({ length: n }, () => ({ tipo: 'Pallet' }));

/** El Set ya hidratado: 60PBL viene de Config. Tiendas, no del catálogo curado. */
const esDeRegiones = (cod: string) => ['60PBL', '47PTV', '36CHL'].includes(cod);

describe('RM/Costa suelta las tiendas que son de Nacional', () => {
  it('EL CASO: 20 tiendas y 60 pallets quedan en 19 y 59', () => {
    const items: Record<string, It[]> = { '01TPS': P(5), '26ALC': P(54), '60PBL': P(1) };
    const { items: limpio, ajenas } = soltarTiendasAjenas(items, esDeRegiones);

    expect(ajenas).toEqual(['60PBL']);
    expect(Object.keys(limpio)).toHaveLength(2);
    expect(Object.values(limpio).flat()).toHaveLength(59);
  });

  it('devuelve CUÁLES soltó, para poder avisarlo y no borrar en silencio', () => {
    const items: Record<string, It[]> = { '01TPS': P(1), '47PTV': P(2), '36CHL': P(3) };
    expect(soltarTiendasAjenas(items, esDeRegiones).ajenas).toEqual(['47PTV', '36CHL']);
  });

  it('una tienda ajena con la lista VACÍA también se suelta', () => {
    // Deja de contar como tienda activa, que es de dónde salía el 20 en vez de 19.
    const { items, ajenas } = soltarTiendasAjenas({ '01TPS': P(1), '60PBL': [] }, esDeRegiones);
    expect(ajenas).toEqual(['60PBL']);
    expect(Object.keys(items)).toEqual(['01TPS']);
  });
});

describe('lo que NO puede hacer', () => {
  it('sin ninguna ajena devuelve el MISMO objeto: no re-renderiza de más', () => {
    const items: Record<string, It[]> = { '01TPS': P(5), '26ALC': P(2) };
    const r = soltarTiendasAjenas(items, esDeRegiones);
    expect(r.items).toBe(items);
    expect(r.ajenas).toEqual([]);
  });

  it('CON EL CATÁLOGO SIN HIDRATAR no suelta nada: falla hacia NO borrar', () => {
    // `REGIONES_CODS` crece en runtime. Antes de hidratarse contesta `false` para 60PBL, y la
    // única consecuencia tiene que ser que la limpieza no ocurra todavía — nunca que se pierda
    // trabajo. Por esto mismo este módulo NO va en Nacional, donde el sentido sería el inverso.
    const sinHidratar = () => false;
    const items: Record<string, It[]> = { '01TPS': P(5), '60PBL': P(1) };
    expect(soltarTiendasAjenas(items, sinHidratar)).toEqual({ items, ajenas: [] });
  });

  it('no toca el contenido de las tiendas propias', () => {
    const unidad = { tipo: 'Pallet', peso: 333.3 };
    const { items } = soltarTiendasAjenas({ '01TPS': [unidad], '60PBL': P(1) }, esDeRegiones);
    expect(items['01TPS'][0]).toBe(unidad);
  });

  it('un mapa vacío no rompe', () => {
    expect(soltarTiendasAjenas({}, esDeRegiones)).toEqual({ items: {}, ajenas: [] });
  });
});
