export const dynamic = 'force-dynamic';

// URL canónica del panel unificado Estado / Registros. Renderiza EstadoScreen (el mismo panel que
// antes vivía en /despacho/estado): SeguimientoPanel (tabla densa + semáforo clickable + orden +
// filtros por columna — superconjunto de las columnas del antiguo /registros) + Historial.
// /despacho/estado redirige aquí. Ver unificación de paneles (Fases 1–5).
import { EstadoScreen } from '../../screens/EstadoScreen';

export default function RegistrosPage() {
  return <EstadoScreen />;
}
