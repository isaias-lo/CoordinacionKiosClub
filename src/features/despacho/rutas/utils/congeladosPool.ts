import { grupoArmada } from './flujoArmada';

/**
 * Grupo (RM / Costa / Regiones) bajo el que cae una tienda en el pool CONGELADOS del Enrutador.
 * Decide qué pill de filtro (Todas/RM/COSTA/REGIONES) la muestra.
 *
 *  - fuente `congelados-regiones`  → 'fal' (Regiones / Nacional), sin importar la región.
 *  - fuente `congelados-santiago`  → por región (VR/V → 'costa'; resto → 'rm'), reusando la
 *    misma lógica que el pool seco (`grupoArmada`).
 *
 * Puro y testeable: el ruteo por grupo del pool congelados no debe divergir del seco.
 */
export function grupoCongelados(fuente: string, region?: string): 'rm' | 'costa' | 'fal' {
  if (fuente === 'congelados-regiones') return 'fal';
  // 'santiago' (≠ 'regiones') → grupoArmada rutea por región: VR/V → costa, resto → rm.
  return grupoArmada('santiago', region);
}
