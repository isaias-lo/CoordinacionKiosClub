import { describe, it, expect } from 'vitest';
import { buildPasswordChangedEmail, formatWhenCL } from '../passwordChanged';

describe('buildPasswordChangedEmail', () => {
  it('incluye nombre, fecha y asunto de seguridad', () => {
    const { subject, html } = buildPasswordChangedEmail('María González', '07 de agosto de 2026, 14:30', 'https://app.cl');
    expect(subject).toContain('contraseña fue cambiada');
    expect(html).toContain('María González');
    expect(html).toContain('07 de agosto de 2026, 14:30');
    expect(html).toContain('¿No reconoces este cambio?');
    expect(html).toContain('https://app.cl/login');
  });

  it('escapa HTML del nombre (anti-inyección)', () => {
    const { html } = buildPasswordChangedEmail('<script>x</script>', 'hoy', 'https://app.cl');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('normaliza el appUrl con slash final', () => {
    const { html } = buildPasswordChangedEmail('u', 'hoy', 'https://app.cl/');
    expect(html).toContain('https://app.cl/login');
    expect(html).not.toContain('https://app.cl//login');
  });

  it('fallback de nombre vacío', () => {
    const { html } = buildPasswordChangedEmail('', 'hoy', 'https://app.cl');
    expect(html).toContain('usuario');
  });
});

describe('formatWhenCL', () => {
  it('formatea a es-CL con zona de Chile', () => {
    // 2026-08-07T18:30:00Z → 14:30 en Chile (UTC-4 en invierno austral)
    const s = formatWhenCL(new Date('2026-08-07T18:30:00Z'));
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/\d{2}:\d{2}/);
    expect(s.toLowerCase()).toContain('agosto');
  });
});
