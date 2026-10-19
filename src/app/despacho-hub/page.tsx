import { redirect } from 'next/navigation';

// El menú viejo de asistentes. Inicio ya muestra los módulos de cada uno; ver RUTAS_REDIRIGIDAS en
// config/routes, que da permiso de Inicio a quien tenga esta ruta.
export default function DespachoHubPage() {
  redirect('/');
}
