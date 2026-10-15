import { describe, it, expect } from 'vitest';
import { pendienteVigente, otroEspejo, avisoDeSalto, RUTA_ESPEJO, VIGENCIA_MS } from '../saltoEntreBodegas';

const ahora = 1_760_000_000_000;
const raw = (o: unknown) => JSON.stringify(o);

describe('saltoEntreBodegas', () => {
  it('cada espejo manda al otro, a la ruta de su pestaña', () => {
    expect(otroEspejo('nacional')).toBe('rmcosta');
    expect(otroEspejo('rmcosta')).toBe('nacional');
    expect(RUTA_ESPEJO.nacional).toBe('/despacho/regiones');
    expect(RUTA_ESPEJO.rmcosta).toBe('/despacho/santiago');
  });

  it('la lectura anotada la toma solo el espejo destino', () => {
    const r = raw({ codigo: '1B41ANA14102026B', espejo: 'nacional', en: ahora - 1000 });
    expect(pendienteVigente(r, 'nacional', ahora)).toBe('1B41ANA14102026B');
    expect(pendienteVigente(r, 'rmcosta', ahora)).toBeNull();
  });

  it('una lectura vencida no abre nada', () => {
    const r = raw({ codigo: '14449', espejo: 'rmcosta', en: ahora - VIGENCIA_MS - 1 });
    expect(pendienteVigente(r, 'rmcosta', ahora)).toBeNull();
  });

  it('lo raro es null: vacío, JSON roto, sin código, hora del futuro', () => {
    expect(pendienteVigente(null, 'rmcosta', ahora)).toBeNull();
    expect(pendienteVigente('{no', 'rmcosta', ahora)).toBeNull();
    expect(pendienteVigente(raw({ codigo: '  ', espejo: 'rmcosta', en: ahora }), 'rmcosta', ahora)).toBeNull();
    expect(pendienteVigente(raw({ codigo: '1', espejo: 'rmcosta', en: ahora + 5000 }), 'rmcosta', ahora)).toBeNull();
  });

  it('el aviso dice a dónde se lleva a la persona', () => {
    expect(avisoDeSalto('41ana', 'nacional')).toBe('41ANA es de Nacional · te llevo allá');
    expect(avisoDeSalto('06MQH', 'rmcosta')).toBe('06MQH es de RM / Costa · te llevo allá');
  });
});
