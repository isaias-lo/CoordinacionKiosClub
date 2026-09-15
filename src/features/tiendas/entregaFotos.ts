import { supabase } from '@/lib/supabase';

/**
 * Bucket + subida de las fotos de entrega del chofer (Fase 0/3). Extraído de
 * `EntregaParadaForm.tsx` para que la cola offline (Fase 4, `conductor-hub/sincronizarPendientes`)
 * pueda reintentar la MISMA subida sin duplicar el nombre del bucket en dos archivos — ya pasó
 * antes en este proyecto que dos copias de una misma constante se desincronizan con el tiempo.
 */
export const ENTREGA_FOTOS_BUCKET = 'entrega-fotos';

export async function subirFotoEntrega(file: File | Blob, path: string): Promise<string> {
  const contentType = file instanceof File ? (file.type || 'image/jpeg') : 'image/jpeg';
  const { error } = await supabase.storage.from(ENTREGA_FOTOS_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(ENTREGA_FOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}
