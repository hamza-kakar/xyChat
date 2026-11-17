import type { Page } from '@playwright/test';

/**
 * Installs a listener for `securitypolicyviolation` events before any app
 * script runs (AGENTS.md §15.1). Every e2e flow asserts the collected list
 * stays empty.
 */
export async function installCspListener(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: unknown[] = [];
    Object.defineProperty(window, '__cspViolations', {
      value: violations,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push({
        directive: event.violatedDirective,
        sourceFile: event.sourceFile,
        blocked: event.blockedURI,
      });
    });
  });
}

export async function cspViolations(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const record = (window as { __cspViolations?: unknown[] }).__cspViolations;
    return record ?? [];
  });
}
