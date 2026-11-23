import { QueryClient } from '@tanstack/react-query';

/** Chat data only changes through this app's own mutations (which
 * invalidate exact keys), so cached reads stay fresh for the session. */
const STALE_FOREVER = Number.POSITIVE_INFINITY;
/** Unused message blocks are dropped after a minute to bound memory. */
const GC_MS = 60_000;

/** Builds the app's query client. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_FOREVER,
        gcTime: GC_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}
