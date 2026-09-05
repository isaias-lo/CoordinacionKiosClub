import { z } from 'zod';

// ── Auth ───────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email:     z.string().email('Email inválido'),
  full_name: z.string().min(2, 'Nombre demasiado corto').max(100),
});

export const SendOtpSchema = z.object({
  email:  z.string().email('Email inválido'),
  cod:    z.string().min(1).max(20).optional(),
  tienda: z.string().max(100).optional(),
});

// ── Admin: Users ───────────────────────────────────────────────────────────

// Los roles son dinámicos: además de los built-in, el admin puede crear roles
// personalizados (tabla `roles`). Por eso se valida el FORMATO del id de rol,
// no una lista fija (que rechazaba los roles personalizados al crear usuarios).
const RoleId = z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Rol inválido');

export const CreateUserSchema = z.object({
  email:     z.string().email('Email inválido'),
  password:  z.string().min(8, 'Contraseña de mínimo 8 caracteres'),
  full_name: z.string().min(2).max(100),
  role:      RoleId,
});

export const UpdateUserSchema = z.object({
  id:        z.string().uuid('ID de usuario inválido'),
  role:      RoleId.optional(),
  full_name: z.string().min(2).max(100).optional(),
  password:  z.string().min(8).optional(),
});

// ── Admin: Roles ───────────────────────────────────────────────────────────

export const CreateRoleSchema = z.object({
  id:            z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  label:         z.string().min(1).max(100),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  home_path:     z.string().startsWith('/').optional(),
  allowed_paths: z.array(z.string()).optional(),
  permissions:   z.record(z.string(), z.string()).optional(),
});

export const UpdateRoleSchema = z.object({
  id:            z.string().min(1),
  label:         z.string().min(1).max(100).optional(),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  home_path:     z.string().startsWith('/').optional(),
  allowed_paths: z.array(z.string()).optional(),
  permissions:   z.record(z.string(), z.string()).optional(),
});

// ── Tiendas ────────────────────────────────────────────────────────────────

const StoreCodeSchema = z.string()
  .min(1).max(10)
  // Ñ permitida: hay códigos canónicos con Ñ (ej. 23PEÑ) que NO se normalizan a N.
  .regex(/^[0-9]{0,2}[A-ZÑ]{2,5}[0-9]?$/, 'Código de tienda inválido (ej: LAS1, 01VIT, 23PEÑ)');

export const CreateTiendaSchema = z.object({
  codigo:          StoreCodeSchema,
  nombre:          z.string().min(1).max(100),
  direccion:       z.string().max(200).optional(),
  region:          z.string().max(100).optional(),
  sector_comuna:   z.string().max(100).optional(),
  corredor:        z.string().max(100).optional(),
  tipo:            z.string().max(50).optional(),
  ventana:         z.string().max(50).optional(),
  frecuencia:      z.string().max(50).optional(),
  prom_por_dia:    z.string().max(20).optional(),
  lat:             z.number().min(-90).max(90).nullable().optional(),
  lon:             z.number().min(-180).max(180).nullable().optional(),
  correos:         z.string().max(500).optional(),
  tel_encargado:   z.string().max(30).optional(),
  supervisor:      z.string().max(100).optional(),
  tel_supervisor:  z.string().max(30).optional(),
  transportista:   z.string().max(100).optional(),
  recepcion_pallet: z.string().max(30).optional(), // 'consolidado' | 'desconsolidado' | ''
  // [Fase 4] Datos de envío de Sendu. Sin validarlos acá, la ruta los descartaba en silencio y el
  // formulario habría parecido guardar sin guardar nada.
  region_sendu:    z.string().max(60).optional(),
  comuna:          z.string().max(100).optional(),
  calle:           z.string().max(200).optional(),
  numero:          z.string().max(20).optional(),
  complemento:     z.string().max(100).optional(),
  activo:          z.boolean().optional(),
});

export const UpdateTiendaSchema = CreateTiendaSchema.partial().extend({
  codigo: StoreCodeSchema,
});

// ── Recepción Conductor ────────────────────────────────────────────────────

export const RecepcionSchema = z.object({
  cod:                   StoreCodeSchema,
  tienda:                z.string().min(1).max(100),
  direccion:             z.string().max(200).optional().default(''),
  palletsSent:           z.number().int().min(0).max(9999),
  bultosSent:            z.number().int().min(0).max(99999),
  contenedoresSent:      z.number().int().min(0).max(9999).optional().default(0),
  palletsRecibidos:      z.number().int().min(0).max(9999),
  bultosRecibidos:       z.number().int().min(0).max(99999),
  contenedoresRecibidos: z.number().int().min(0).max(9999).optional().default(0),
  conductor:             z.string().max(100).optional().default(''),
  pionetas:              z.string().max(200).optional().default(''),
  receptor:              z.string().min(1).max(100),
  rut:                   z.string().min(1).max(12),
  // Firma dibujada: ahora OPCIONAL — el acuse de recibo (recibiConforme) es el que confirma.
  signatureDataUrl:      z.string().startsWith('data:image/').optional().or(z.literal('')),
  // Acuse de recibo: true = "Recibí conforme", false = "Recibí con observaciones".
  recibiConforme:        z.boolean().optional(),
  // Cómo confirmó: 'dibujo' (firmó) o 'acuse' (solo marcó el acuse). Registro, no validación.
  firmaMetodo:           z.string().max(20).optional().default(''),
  // Fotos de recepción como data URLs base64 (el server las sube a `recepcion-fotos`).
  recepcionFotos:        z.array(z.string()).max(8).optional().default([]),
  // Origen: 'tienda' (QR+OTP) → hoja RECEPCIÓN/TIENDA; resto (chofer) → ENTREGA/TIENDA.
  origen:                z.enum(['tienda', 'conductor']).optional(),
  otpToken:              z.string().optional(),
  otpEmail:              z.string().email().optional(),
  observaciones:         z.string().max(500).optional().default(''),
  selloEstado:           z.enum(['intacto', 'roto', 'ausente']).optional(),
  selloLlegadaUrl:       z.string().url().optional().or(z.literal('')),
  selloLlegadaHora:      z.string().optional(),
  selloSalidaUrl:        z.string().url().optional().or(z.literal('')),
  selloSalidaHora:       z.string().optional(),
  cdSalidaUrl:           z.string().url().optional().or(z.literal('')),
  cdSalidaHora:          z.string().optional(),
  estadoFotoUrls:        z.array(z.string()).optional().default([]),
  codigoVerificacion:    z.string().length(6).optional(),
  canonicalId:           z.string().max(100).optional(),
  tipoIncidencia:        z.string().max(100).optional(),
  temperaturaLlegada:    z.number().min(-50).max(100).optional(),
  usuarioRecepcion:      z.string().max(100).optional(),
  regimen:               z.string().max(50).optional(),
  // Idempotencia + edición con auditoría (PR C2):
  clientOpId:            z.string().max(64).optional(),   // reintento/offline no duplica
  editar:                z.boolean().optional(),          // true = editar recepción existente
  recepcionId:           z.number().int().positive().optional(), // id a editar
});

// ── Recepción Tienda ───────────────────────────────────────────────────────

export const RecepcionTiendaSchema = z.object({
  cod:                   StoreCodeSchema,
  tienda:                z.string().min(1).max(100),
  direccion:             z.string().max(200).optional().default(''),
  palletsSent:           z.number().int().min(0).max(9999),
  bultosSent:            z.number().int().min(0).max(99999),
  contenedoresSent:      z.number().int().min(0).max(9999).optional().default(0),
  palletsRecibidos:      z.number().int().min(0).max(9999),
  bultosRecibidos:       z.number().int().min(0).max(99999),
  contenedoresRecibidos: z.number().int().min(0).max(9999).optional().default(0),
  receptor:              z.string().min(1).max(100),
  rut:                   z.string().min(1).max(12),
  signatureDataUrl:      z.string().startsWith('data:image/'),
  observaciones:         z.string().max(500).optional().default(''),
  selloEstado:           z.enum(['intacto', 'roto', 'ausente']).optional(),
  selloFotoUrl:          z.string().url().optional().or(z.literal('')),
  estadoFotoUrls:        z.array(z.string()).optional().default([]),
  guias:                 z.array(z.string()).optional().default([]),
  driveFileId:           z.string().max(100).optional().default(''),
  canonicalId:           z.string().max(100).optional(),
});

// ── Picking Pallets ────────────────────────────────────────────────────────

export const CreatePickingPalletSchema = z.object({
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  store_cod:    StoreCodeSchema,
  state_key:    z.string().min(1).max(50),
  picker_label: z.string().min(1).max(100),
  tipo:         z.enum(['P', 'B', 'C', 'CH', 'CC', 'CN', 'otro']),
  // .nullish() (no solo .optional()): el caller (addPalletSlot en PickingScreen) manda
  // explícitamente `null` para varios de estos campos —p. ej. `section: null` cuando el
  // grupo es mixto/"Todas" (ver seccionSlot)— y .optional() por sí solo rechaza `null`
  // (solo acepta el campo AUSENTE), así que ese caso ya fallaba con 400 antes de este fix.
  contenido:    z.string().max(50).nullish(),
  section:      z.string().max(30).nullish(), // sección de Picking (aseo-comida/hogar/…); null/omitida = sin clasificar
  refs:         z.string().max(500).nullish(),
  actor_name:   z.string().max(100).nullish(),
  client_op_id: z.string().uuid().optional(), // idempotencia: mismo id ⇒ no duplica
});

// ── Conductores ────────────────────────────────────────────────────────────

export const CreateConductorSchema = z.object({
  nombre:   z.string().min(2).max(100),
  telefono: z.string().max(20).optional(),
  empresa:  z.string().max(100).optional(),
});

export const UpdateConductorSchema = z.object({
  id:       z.number().int().positive(),
  nombre:   z.string().min(2).max(100).optional(),
  telefono: z.string().max(20).optional(),
  empresa:  z.string().max(100).optional(),
});

// ── Helper ─────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';

export function parseBody<T>(schema: ZodSchema<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; response: ReturnType<typeof NextResponse.json> } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues.map(e => `${e.path.map(String).join('.')}: ${e.message}`).join('; ');
  return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
}
