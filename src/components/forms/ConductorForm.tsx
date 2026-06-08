'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { User, Phone, Building2, Loader2 } from 'lucide-react';
import { useCreateConductor, useUpdateConductor, type Conductor } from '@/hooks/queries/useConductores';

/* ── Schema (subset of backend schema for the form) ────────────── */
const ConductorFormSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres').max(100),
  telefono: z.string().max(20).optional().or(z.literal('')),
  empresa:  z.string().max(100).optional().or(z.literal('')),
});

type ConductorFormValues = z.infer<typeof ConductorFormSchema>;

interface ConductorFormProps {
  /** If provided, renders the form in edit mode */
  conductor?: Conductor;
  onSuccess?: () => void;
  onCancel?:  () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red mt-1 font-medium">{message}</p>;
}

function FormField({
  label, icon: Icon, error, children,
}: { label: string; icon: React.ElementType; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-3">
        <Icon size={11} strokeWidth={2} />
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

const inputCls = [
  'bg-bg border border-border rounded-btn px-3 py-2.5 text-text text-[14px]',
  'outline-none transition-all focus:border-knavy focus:shadow-[0_0_0_3px_rgba(27,42,107,0.12)]',
  'placeholder:text-text-3',
].join(' ');

export function ConductorForm({ conductor, onSuccess, onCancel }: ConductorFormProps) {
  const isEdit = !!conductor;
  const createMutation = useCreateConductor();
  const updateMutation = useUpdateConductor();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ConductorFormValues>({
    resolver: zodResolver(ConductorFormSchema),
    defaultValues: {
      nombre:   conductor?.nombre   ?? '',
      telefono: conductor?.telefono ?? '',
      empresa:  conductor?.empresa  ?? '',
    },
  });

  // Sync external data changes into the form (e.g. after optimistic update)
  useEffect(() => {
    if (conductor) {
      reset({
        nombre:   conductor.nombre   ?? '',
        telefono: conductor.telefono ?? '',
        empresa:  conductor.empresa  ?? '',
      });
    }
  }, [conductor, reset]);

  async function onSubmit(values: ConductorFormValues) {
    const payload = {
      nombre:   values.nombre.trim(),
      telefono: values.telefono?.trim() || undefined,
      empresa:  values.empresa?.trim()  || undefined,
    };

    if (isEdit && conductor) {
      await updateMutation.mutateAsync({ id: conductor.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
      reset();
    }
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormField label="Nombre" icon={User} error={errors.nombre?.message}>
        <input
          {...register('nombre')}
          placeholder="Nombre completo"
          className={inputCls}
          autoComplete="name"
        />
      </FormField>

      <FormField label="Teléfono" icon={Phone} error={errors.telefono?.message}>
        <input
          {...register('telefono')}
          placeholder="+56 9 XXXX XXXX (opcional)"
          className={inputCls}
          type="tel"
          autoComplete="tel"
        />
      </FormField>

      <FormField label="Empresa" icon={Building2} error={errors.empresa?.message}>
        <input
          {...register('empresa')}
          placeholder="Empresa transportista (opcional)"
          className={inputCls}
          autoComplete="organization"
        />
      </FormField>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-btn text-[13px] font-semibold text-text-2 bg-bg border border-border hover:bg-border/60 transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || (isEdit && !isDirty)}
          className="flex-1 py-2.5 rounded-btn text-[13px] font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #1B2A6B, #2D3F8C)' }}
        >
          {isPending
            ? <><Loader2 size={14} className="animate-spin" /> Guardando...</>
            : isEdit ? 'Guardar cambios' : 'Agregar conductor'
          }
        </button>
      </div>
    </form>
  );
}
