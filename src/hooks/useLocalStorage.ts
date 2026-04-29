import { useState } from 'react';

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = (newVal: T) => {
    setValue(newVal);
    localStorage.setItem(key, JSON.stringify(newVal));
  };

  return [value, set] as const;
}
