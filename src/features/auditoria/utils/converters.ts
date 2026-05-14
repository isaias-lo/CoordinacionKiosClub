import type {
  AuditEntry, TipoAuditoria, CorreccionAuditoria, ResultadoAuditoria,
  OperacionEntry, TipoError, ProductoError,
} from '../types';

export function entryToRow(entry: AuditEntry, userId: string) {
  return {
    id: entry.id, user_id: userId,
    fecha: entry.fecha, hora: entry.hora,
    auditor: entry.auditor, picker: entry.picker ?? '',
    picker_nombre: entry.pickerNombre ?? '',
    tienda_cod: entry.tiendaCod, tienda_nombre: entry.tiendaNombre, tienda_area: entry.tiendaArea,
    tipo: entry.tipo, operaciones: entry.operaciones, pallets: entry.pallets,
    tiene_errores: entry.tieneErrores, tipos_error: entry.tiposError,
    correccion: entry.correccion, resultado: entry.resultado,
    observaciones: entry.observaciones, reauditoria_de_id: entry.reauditoriaDeId ?? null,
    productos: entry.productos,
    foto_url:        entry.fotoUrl ?? null,
    foto_urls:       entry.fotoUrls ?? [],
    error_foto_urls: entry.errorFotoUrls ?? [],
    pallet_fotos:    entry.palletFotos ?? [],
  };
}

export function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as string, fecha: r.fecha as string, hora: r.hora as string,
    auditor: r.auditor as string, picker: r.picker as string,
    pickerNombre: (r.picker_nombre as string) || undefined,
    tiendaCod: r.tienda_cod as string, tiendaNombre: r.tienda_nombre as string,
    tiendaArea: r.tienda_area as AuditEntry['tiendaArea'],
    tipo: r.tipo as TipoAuditoria, operaciones: (r.operaciones as OperacionEntry[]) ?? [],
    pallets: r.pallets as number, tieneErrores: r.tiene_errores as boolean,
    tiposError: (r.tipos_error as TipoError[]) ?? [],
    correccion: r.correccion as CorreccionAuditoria, resultado: r.resultado as ResultadoAuditoria,
    observaciones: r.observaciones as string,
    reauditoriaDeId: r.reauditoria_de_id as string | undefined,
    productos: (r.productos as ProductoError[]) ?? [],
    fotoUrl:       (r.foto_url as string) || undefined,
    fotoUrls:      (r.foto_urls as string[]) || undefined,
    errorFotoUrls: (r.error_foto_urls as string[]) || undefined,
    palletFotos:   (r.pallet_fotos as AuditEntry['palletFotos']) || undefined,
  };
}
