const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/**
 * Escapa un valor para interpolarlo de forma segura en HTML generado con
 * `document.write`/template strings (usado en las exportaciones de Historial
 * y Estadísticas). Sin esto, un nombre de picker con `<`/`>` puede corromper
 * o inyectar markup en la ventana de exportación.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}
