import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          30 * 1000,       // 30 s — fresh window
      gcTime:             5  * 60 * 1000,  // 5 min — keep in cache
      retry:              2,
      retryDelay:         attempt => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
    },
    mutations: {
      retry: 0,
    },
  },
});
