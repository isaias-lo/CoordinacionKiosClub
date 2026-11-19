import { describe, it, expect } from 'vitest';
import { guardarNombre, quitarPicker, nombreVisible, sinAsignar , faltaNombreOlas, guardarNombreOlas } from '../nombresDePicker';

const ACTUALES = { 'Pickers 12': 'Israel Bustos', 'control interno': 'Francisca Farias' };

describe('guardarNombre', () => {
  it('pone el nombre y deja la pistola', () => {
    const c = guardarNombre(ACTUALES, 'Pickers 12', 'Rodrigo Pérez');
    expect(c.names['Pickers 12']).toBe('Rodrigo Pérez');
    expect(c.envio).toEqual({ key: 'Pickers 12', display_name: 'Rodrigo Pérez', accion: 'nombre' });
  });

  it('BORRAR EL NOMBRE NO BORRA LA PISTOLA', () => {
    // El bug: el cuadro decía «→ (sin nombre)» y la cuenta desaparecía entera.
    const c = guardarNombre(ACTUALES, 'Pickers 12', '');
    expect('Pickers 12' in c.names).toBe(true);
    expect(c.names['Pickers 12']).toBe('');
    expect(c.envio.accion).toBe('nombre');
  });

  it('un nombre de puros espacios es un nombre vacío, no un borrado', () => {
    const c = guardarNombre(ACTUALES, 'Pickers 12', '   ');
    expect(c.names['Pickers 12']).toBe('');
    expect(c.envio.accion).toBe('nombre');
  });

  it('recorta los espacios de los costados', () => {
    expect(guardarNombre(ACTUALES, 'Pickers 12', '  Ana Soto  ').names['Pickers 12']).toBe('Ana Soto');
  });

  it('no toca a las demás pistolas', () => {
    const c = guardarNombre(ACTUALES, 'Pickers 12', '');
    expect(c.names['control interno']).toBe('Francisca Farias');
  });

  it('no muta el objeto que recibió', () => {
    guardarNombre(ACTUALES, 'Pickers 12', 'Otro');
    expect(ACTUALES['Pickers 12']).toBe('Israel Bustos');
  });

  it('sobre una pistola que no estaba, la agrega', () => {
    const c = guardarNombre(ACTUALES, 'Pickers 19', 'Nuevo');
    expect(c.names['Pickers 19']).toBe('Nuevo');
  });
});

describe('quitarPicker', () => {
  it('saca la pistola del mapa y lo dice', () => {
    const c = quitarPicker(ACTUALES, 'control interno');
    expect('control interno' in c.names).toBe(false);
    expect(c.envio).toEqual({ key: 'control interno', display_name: '', accion: 'quitar' });
  });

  it('es la ÚNICA forma de borrar: se distingue de un nombre vacío por la acción', () => {
    expect(guardarNombre(ACTUALES, 'control interno', '').envio.accion).toBe('nombre');
    expect(quitarPicker(ACTUALES, 'control interno').envio.accion).toBe('quitar');
  });

  it('no toca a las demás', () => {
    expect(quitarPicker(ACTUALES, 'control interno').names['Pickers 12']).toBe('Israel Bustos');
  });

  it('no muta el objeto que recibió', () => {
    quitarPicker(ACTUALES, 'control interno');
    expect(ACTUALES['control interno']).toBe('Francisca Farias');
  });

  it('quitar algo que no está no rompe nada', () => {
    expect(quitarPicker(ACTUALES, 'No existe').names).toEqual(ACTUALES);
  });
});

describe('nombreVisible', () => {
  it('muestra el nombre cuando lo hay', () => {
    expect(nombreVisible(ACTUALES, 'Pickers 12')).toBe('Israel Bustos');
  });

  it('una pistola sin nombre se muestra con su cuenta, no en blanco', () => {
    expect(nombreVisible({ 'Pickers 12': '' }, 'Pickers 12')).toBe('Pickers 12');
  });

  it('una pistola que no está en el mapa también', () => {
    expect(nombreVisible({}, 'Pickers 12')).toBe('Pickers 12');
  });

  it('un nombre de puros espacios cuenta como sin nombre', () => {
    expect(nombreVisible({ 'Pickers 12': '  ' }, 'Pickers 12')).toBe('Pickers 12');
  });
});

describe('sinAsignar', () => {
  it('existe y no la usa nadie', () => {
    expect(sinAsignar({ 'Pickers 12': '' }, 'Pickers 12')).toBe(true);
  });

  it('con nombre, no', () => {
    expect(sinAsignar(ACTUALES, 'Pickers 12')).toBe(false);
  });

  it('una que no está en el mapa NO es «sin asignar»: es que no está', () => {
    // La diferencia importa: una built-in sin fila todavía no se tocó nunca.
    expect(sinAsignar({}, 'Pickers 12')).toBe(false);
  });
});

describe('guardarNombreOlas · el nombre con que la planilla del bono lo busca', () => {
  it('guarda el texto y pide la acción «olas», no «nombre»', () => {
    const c = guardarNombreOlas({ 'Pickers 12': '' }, 'Pickers 12', '  Marcela Ulloa  ');
    expect(c.names['Pickers 12']).toBe('Marcela Ulloa');
    expect(c.envio).toEqual({ key: 'Pickers 12', display_name: 'Marcela Ulloa', accion: 'olas' });
  });

  it('vaciarlo es un estado válido: no borra la pistola', () => {
    const c = guardarNombreOlas({ 'Pickers 12': 'Marcela Ulloa' }, 'Pickers 12', '   ');
    expect('Pickers 12' in c.names).toBe(true);
    expect(c.names['Pickers 12']).toBe('');
    expect(c.envio.accion).toBe('olas');
  });

  it('no toca las demás', () => {
    const c = guardarNombreOlas({ 'Pickers 1': 'Maria Camila Gonzalez', 'Pickers 12': '' },
      'Pickers 12', 'Marcela Ulloa');
    expect(c.names['Pickers 1']).toBe('Maria Camila Gonzalez');
  });
});

describe('faltaNombreOlas · el aviso de Configuración', () => {
  const nombres = { 'Pickers 12': 'Marcela Ulloa', 'Pickers 16': 'Christian Flores', 'Pickers 9': '' };

  it('avisa cuando hay persona y no hay nombre de planilla', () => {
    // El caso real del 18 y 19/11/2026: se agregaron en Config y el registro saltó sus filas.
    expect(faltaNombreOlas(nombres, { 'Pickers 16': 'Christian Flores' }, 'Pickers 12')).toBe(true);
  });

  it('no avisa cuando los dos están', () => {
    expect(faltaNombreOlas(nombres, { 'Pickers 16': 'Christian Flores' }, 'Pickers 16')).toBe(false);
  });

  it('una pistola sin persona NO se marca: no tiene a quién registrarle nada', () => {
    expect(faltaNombreOlas(nombres, {}, 'Pickers 9')).toBe(false);
  });

  it('una cuenta que no está en la lista tampoco se marca', () => {
    expect(faltaNombreOlas(nombres, {}, 'Pickers 99')).toBe(false);
  });

  it('un nombre de planilla en blancos cuenta como vacío', () => {
    expect(faltaNombreOlas(nombres, { 'Pickers 12': '   ' }, 'Pickers 12')).toBe(true);
  });
});
