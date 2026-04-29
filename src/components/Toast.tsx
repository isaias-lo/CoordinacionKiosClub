import { useApp } from '../context/AppContext';

export function Toast() {
  const { state } = useApp();
  const { toast } = state;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 rounded-card px-4 py-3 text-[13px] font-medium text-white z-[999] whitespace-nowrap pointer-events-none transition-opacity duration-200 shadow-card2 max-w-[90vw] ${
        toast ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: toast?.color || '#1A2550',
      }}>
      {toast?.msg}
    </div>
  );
}
