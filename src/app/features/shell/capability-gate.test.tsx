import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { checkCapabilities, type CapabilityReport } from '../../../platform/capabilities';
import { CapabilityGate } from './capability-gate';

vi.mock('../../../platform/capabilities', () => ({
  checkCapabilities: vi.fn(),
}));

const mockedCheck = vi.mocked(checkCapabilities);

function report(overrides: Partial<CapabilityReport>): CapabilityReport {
  return { ok: true, failures: [], ...overrides };
}

describe('CapabilityGate', () => {
  it('shows a checking state while probes run', () => {
    mockedCheck.mockReturnValue(new Promise(() => undefined));
    render(
      <CapabilityGate>
        <p>inner content</p>
      </CapabilityGate>,
    );
    expect(screen.getByText('Checking browser support…')).toBeInTheDocument();
    expect(screen.queryByText('inner content')).not.toBeInTheDocument();
  });

  it('renders children when all capabilities pass', async () => {
    mockedCheck.mockResolvedValue(report({}));
    render(
      <CapabilityGate>
        <p>inner content</p>
      </CapabilityGate>,
    );
    expect(await screen.findByText('inner content')).toBeInTheDocument();
  });

  it('renders the unsupported screen listing failures', async () => {
    mockedCheck.mockResolvedValue(report({ ok: false, failures: ['webAssembly'] }));
    render(
      <CapabilityGate>
        <p>inner content</p>
      </CapabilityGate>,
    );
    expect(await screen.findByText('WebAssembly')).toBeInTheDocument();
    expect(screen.queryByText('inner content')).not.toBeInTheDocument();
  });
});
