/**
 * Pick-step test (§12.8.2): the hidden file input forwards the chosen file.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPickStep } from './import-pick-step';

describe('ImportPickStep (§12.8.2)', () => {
  it('forwards the picked file through the hidden input', () => {
    const onPicked = vi.fn();
    const { container } = render(<ImportPickStep onPicked={onPicked} />);
    expect(screen.getByText('Import a WhatsApp export')).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['x'], 'WhatsApp Chat - Family.zip');
    if (input !== null) {
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);
    }
    expect(onPicked).toHaveBeenCalledWith(file);
  });
});
