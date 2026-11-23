/**
 * Pick-step test: the labelled file input forwards the chosen file.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportPickStep } from './import-pick-step';

describe('ImportPickStep', () => {
  it('forwards the picked file through the hidden input', () => {
    const onPicked = vi.fn();
    render(<ImportPickStep onPicked={onPicked} />);
    expect(screen.getByText('Import a WhatsApp export')).toBeInTheDocument();
    const input = screen.getByLabelText('Choose export file (.zip or .txt)');
    const file = new File(['x'], 'WhatsApp Chat - Family.zip');
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    expect(onPicked).toHaveBeenCalledWith(file);
  });
});
