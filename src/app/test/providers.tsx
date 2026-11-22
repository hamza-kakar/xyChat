/**
 * Test rendering with the app's providers: a fresh query client per test
 * (no retries, so failures surface at once) and a memory router.
 */
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

/** A query client that fails fast and never refetches on its own. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

/** Renders `ui` inside a query client and a router at `route`. */
export function renderWithProviders(
  ui: ReactNode,
  options: { readonly route?: string; readonly client?: QueryClient } = {},
): RenderResult & { readonly client: QueryClient } {
  const client = options.client ?? testQueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}
