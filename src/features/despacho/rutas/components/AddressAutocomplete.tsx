'use client';

import { useEffect, useRef } from 'react';
import { onGmapsReady } from '../utils/maps';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Se dispara al ELEGIR una sugerencia: entrega dirección + coords (evita un geocode extra). */
  onSelect: (sel: { address: string; lat: number; lng: number }) => void;
  /** Enter SIN elegir sugerencia (fallback: el padre geocodifica a mano con el texto escrito). */
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Input de dirección con autocompletado de Google Places (región Chile), tipo Google Maps: al elegir
 * una sugerencia entrega la dirección + sus coordenadas (así no hay que geocodificar de nuevo).
 * Reutilizable (punto de partida + paradas). Si Places aún no cargó, degrada a un input normal y el
 * `onEnter` del padre puede geocodificar el texto con el Geocoder de siempre.
 */
export default function AddressAutocomplete({ value, onChange, onSelect, onEnter, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attachedRef = useRef(false);
  // Refs para que el listener (que se registra una sola vez) siempre vea los callbacks actuales.
  const onSelectRef = useRef(onSelect);
  const onChangeRef = useRef(onChange);
  onSelectRef.current = onSelect;
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancel = false;
    onGmapsReady(() => {
      if (cancel || !inputRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const G = (window as any).google?.maps;
      if (!G?.places?.Autocomplete) return; // Places no disponible → queda como input normal
      const ac = new G.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'cl' },
        fields: ['formatted_address', 'geometry', 'name'],
      });
      attachedRef.current = true;
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return; // escribió algo pero no eligió una sugerencia válida
        const address = place.formatted_address || place.name || inputRef.current?.value || '';
        onChangeRef.current(address);
        onSelectRef.current({ address, lat: loc.lat(), lng: loc.lng() });
      });
    });
    return () => { cancel = true; };
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      autoComplete="off"
      onChange={e => onChangeRef.current(e.target.value)}
      onKeyDown={e => {
        if (e.key !== 'Enter') return;
        // Con Places adjunto, Enter elige la sugerencia (lo maneja Google → place_changed). Sin
        // Places, Enter dispara el fallback del padre (geocode manual).
        if (!attachedRef.current) { e.preventDefault(); onEnter?.(); }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}
