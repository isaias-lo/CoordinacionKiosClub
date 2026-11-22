'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useContextoMant } from '../useContextoMant';
import { useCambiosMant } from '../useCambiosMant';
import { traerAjustes, traerPanel, type DatosAjustes, type DatosPanel } from '../apiCliente';
import { CONFIG_POR_DEFECTO, contadoresDelTablero, fichasDelTablero } from '../utils/tablero';
import { Aviso, Tarjeta } from '../ui';
import { Tablero } from './Tablero';
import { PorRevisar } from './PorRevisar';
import { Ajustes } from './Ajustes';

type Pestana = 'tablero' | 'revisar' | 'ajustes';
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'tablero', texto: 'Tablero' },
  { id: 'revisar', texto: 'Por revisar' },
  { id: 'ajustes', texto: 'Ajustes' },
];

/**
 * /mantencion — el panel de Jesús, encargado de Mantención. Escritorio primero.
 *
 * Una sola ruta con pestañas, como el mockup aprobado: así el rol `encargado-mantencion` necesita un
 * solo permiso (`/mantencion`). La pestaña y la tienda abierta viajan en la URL (`?tab=…&tienda=…`)
 * para que un enlace o un recargar dejen todo donde estaba.
 *
 * Las pestañas de rutas, precierres y materiales del mockup son de la Fase 2: no están.
 */
export function PanelMantencion() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pestana = (PESTANAS.find(p => p.id === params.get('tab'))?.id ?? 'tablero') as Pestana;
  const tiendaAbierta = params.get('tienda');
  const aviso = params.get('aviso');

  const { contexto } = useContextoMant();
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [ajustes, setAjustes] = useState<DatosAjustes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await traerPanel());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }, []);
  const cargarAjustes = useCallback(async () => {
    try { setAjustes(await traerAjustes()); } catch { /* el tablero sigue con la semilla */ }
  }, []);

  useEffect(() => { void cargar(); void cargarAjustes(); }, [cargar, cargarAjustes]);
  useCambiosMant(cargar);

  const ir = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) { if (v === null) q.delete(k); else q.set(k, v); }
    q.delete('aviso');
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const config = ajustes?.config ?? CONFIG_POR_DEFECTO;
  const solicitudes = useMemo(() => datos?.solicitudes ?? [], [datos]);
  const pares = useMemo(() => datos?.paresDescartados ?? [], [datos]);
  const fichas = useMemo(
    () => fichasDelTablero(solicitudes, contexto?.tiendas ?? [], config, pares),
    [solicitudes, contexto, config, pares],
  );
  const cuenta = contadoresDelTablero(fichas, solicitudes, pares);

  const sinPermiso = contexto && !contexto.veTodo;

  return (
    <div className="min-h-full" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <PageHeader
        title="Mantención"
        subtitle="Panel del encargado"
        actions={(
          <Link href="/mantencion/nueva"
            className="flex min-h-[40px] items-center gap-2 rounded-xl px-3 text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ingresar por WhatsApp</span>
          </Link>
        )}
      />
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {sinPermiso && <Aviso tono="error">Este panel es de Mantención. Tu cuenta no tiene ese permiso.</Aviso>}
        {aviso === 'enviada' && <Aviso tono="ok">Solicitud ingresada. Está en «Por revisar».</Aviso>}
        {aviso === 'guardada' && <Aviso tono="aviso">Sin conexión: quedó guardada y se envía sola al volver la señal.</Aviso>}
        {error && (
          <Aviso tono="error">
            No se pudo cargar ({error}).{' '}
            <button type="button" className="font-semibold underline" onClick={() => void cargar()}>Reintentar</button>
          </Aviso>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Contador titulo="Abiertas" valor={cuenta.abiertas} nota="en todas las tiendas" />
          <Contador titulo="Tiendas en alerta" valor={cuenta.tiendasEnAlerta} nota="pasan algún umbral" alerta={cuenta.tiendasEnAlerta > 0} />
          <Contador titulo="Urgentes" valor={cuenta.urgentes} nota="clasificadas urgentes" alerta={cuenta.urgentes > 0} />
          <Contador titulo="Por revisar" valor={cuenta.porRevisar} nota="sin clasificar o duplicadas" />
        </div>

        <div role="tablist" aria-label="Secciones" className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {PESTANAS.map(p => (
            <button key={p.id} role="tab" type="button" aria-selected={pestana === p.id}
              onClick={() => ir({ tab: p.id, tienda: null })}
              className="-mb-px min-h-[44px] border-b-2 px-4 text-sm font-semibold"
              style={pestana === p.id
                ? { borderColor: 'var(--color-primary)', color: 'var(--color-text)' }
                : { borderColor: 'transparent', color: 'var(--color-text-sub)' }}>
              {p.texto}{p.id === 'revisar' && cuenta.porRevisar > 0 ? ` (${cuenta.porRevisar})` : ''}
            </button>
          ))}
        </div>

        {datos === null && !error && <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>Cargando…</p>}

        {datos && pestana === 'tablero' && (
          <Tablero fichas={fichas} solicitudes={solicitudes} tiendaAbierta={tiendaAbierta}
            abrirTienda={cod => ir({ tienda: cod })} alCambiar={cargar} />
        )}
        {datos && pestana === 'revisar' && (
          <PorRevisar solicitudes={solicitudes} pares={pares} alCambiar={cargar} />
        )}
        {pestana === 'ajustes' && (
          ajustes
            ? <Ajustes datos={ajustes} alGuardar={cargarAjustes} />
            : <Tarjeta><p className="text-sm">Cargando ajustes…</p></Tarjeta>
        )}
      </main>
    </div>
  );
}

function Contador({ titulo, valor, nota, alerta }: { titulo: string; valor: number; nota: string; alerta?: boolean }) {
  return (
    <Tarjeta>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-sub)' }}>{titulo}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: alerta ? 'var(--est-error)' : 'var(--color-text)' }}>{valor}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{nota}</p>
    </Tarjeta>
  );
}
