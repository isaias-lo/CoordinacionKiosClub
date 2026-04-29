import { useApp } from '../../../context/AppContext';

const TABS = ['Tiendas', 'Resumen'];

export function TabBar() {
  const { state, dispatch } = useApp();
  const { activeTab } = state;

  const getBadge = (idx: number) => {
    if (idx === 1) {
      return Object.values(state.dispatch).reduce((acc, items) => acc + items.length, 0);
    }
    return 0;
  };

  return (
    <div className="flex bg-white border-b-2 border-bg-2 flex-shrink-0">
      {TABS.map((label, idx) => {
        const badge = getBadge(idx);
        const active = activeTab === idx;
        return (
          <button
            key={label}
            onClick={() => dispatch({ type: 'SET_TAB', payload: idx })}
            className={`flex-1 py-3 px-1 text-center font-barlow-condensed text-sm font-semibold tracking-wide cursor-pointer transition-all border-b-[3px] -mb-0.5 ${
              active
                ? 'text-red border-red'
                : 'text-text-3 border-transparent hover:text-text-2'
            }`}>
            {label}
            {badge > 0 && (
              <span className="inline-flex items-center justify-center bg-red text-white text-[10px] font-mono rounded-[10px] px-1.5 ml-1.5 min-w-[18px]">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
