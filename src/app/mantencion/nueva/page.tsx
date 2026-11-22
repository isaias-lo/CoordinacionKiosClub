import { NuevaSolicitud } from '@/features/mantencion/tienda/NuevaSolicitud';

export const dynamic = 'force-dynamic';

/** Jesús ingresa a nombre de una tienda lo que le llegó por WhatsApp. */
export default function IngresoWhatsappPage() {
  return <NuevaSolicitud modo="whatsapp" />;
}
