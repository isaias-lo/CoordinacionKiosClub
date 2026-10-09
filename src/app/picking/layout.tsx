// Estilos del rediseño de Picking (franja superior, menú lateral, lista de tiendas) e IBM Plex.
// Se cargan solo en /picking para no cambiar el resto de la app.
import '@/features/picking/marco/marco.css';
import '@/features/picking/seco/seco.css';
import '@/features/picking/seguimiento/seguimiento.css';

export default function PickingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
