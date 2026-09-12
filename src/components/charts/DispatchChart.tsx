'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { EmptyState } from '../ui/empty-state';
import { BarChart3 } from 'lucide-react';

export interface ChartData {
  day: string;
  fullDate: string;
  pallets: number;
  bultos: number;
  contenedores: number;
  chocolates: number;
}

// [m-03] El orden del tooltip es el de la leyenda. Sin esto, Recharts las lista alfabéticamente
// (Bultos, Chocolates, Contenedores, Pallets) y no coincide con lo que se ve arriba.
const ORDEN_SERIES = ['pallets', 'bultos', 'contenedores', 'chocolates'];

export default function DispatchChart({ data, loading }: { data: ChartData[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border-2 border-knavy/30 border-t-knavy animate-spin" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin datos de despacho"
        description="Aún no hay registros para los últimos 7 días."
        variant="inline"
      />
    );
  }

  // Una serie que vale 0 todos los días no se dibuja ni se lista: ocupa lugar y no dice nada.
  const hayContenedores = data.some(d => d.contenedores > 0);

  return (
    // [m-04] Alto explícito: con "100%" Recharts tiene que medir el contenedor, y en el primer
    // pintado (antes de que el layout exista) medía -1 y avisaba por consola en cada carga.
    <ResponsiveContainer width="100%" height={180} minWidth={0}>
      <BarChart data={data} barGap={4} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: '#8E8E93', fontFamily: 'Barlow, sans-serif' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#8E8E93', fontFamily: 'Barlow, sans-serif' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid #E8E8ED',
            borderRadius: 10,
            fontSize: 12,
            fontFamily: 'Barlow, sans-serif',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
          formatter={(value, name) => [
            Number(value).toLocaleString('es-CL'),
            name === 'pallets'     ? 'Pallets' :
            name === 'bultos'      ? 'Bultos' :
            name === 'contenedores' ? 'Contenedores' : 'Chocolates',
          ]}
          labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate ?? label}
          itemSorter={item => ORDEN_SERIES.indexOf(String(item.dataKey))}
        />
        <Bar dataKey="pallets"      fill="#1B2A6B" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="bultos"       fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.7} />
        {hayContenedores && <Bar dataKey="contenedores" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.85} />}
        <Bar dataKey="chocolates"   fill="#9333EA" radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  );
}
