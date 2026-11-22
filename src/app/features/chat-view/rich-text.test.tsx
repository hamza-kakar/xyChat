import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from './rich-text';

describe('RichText (§12.5, §15.2)', () => {
  it('renders WhatsApp styles as elements', () => {
    const { container } = render(<RichText body="*bold* _it_ ~gone~ `code`" />);
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('it');
    expect(container.querySelector('s')?.textContent).toBe('gone');
    expect(container.querySelector('code')?.textContent).toBe('code');
  });

  it('renders quotes, bullets, numbered lines and a monospace block', () => {
    const { container } = render(
      <RichText body={'> quoted\n- item\n2. second\n```\nmono  block\n```'} />,
    );
    expect(screen.getByText('quoted')).toHaveClass('italic');
    expect(screen.getByText('item')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(container.querySelector('code.block')?.textContent).toBe('\nmono  block\n');
  });

  it('keeps blank lines between paragraphs', () => {
    const { container } = render(<RichText body={'one\n\nthree'} />);
    const lines = container.querySelectorAll('div > span.block');
    expect([...lines].map((line) => line.textContent)).toEqual(['one', '', 'three']);
  });

  it('links allowed URLs safely and leaves code unlinked', () => {
    render(<RichText body="see https://example.com/x and `https://example.com/y`" />);
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'https://example.com/y' })).toBeNull();
  });

  it('renders markup in a message as plain text', () => {
    const { container } = render(<RichText body={'<img src=x onerror="alert(1)"> <b>hi</b>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="alert(1)"> <b>hi</b>');
  });

  it('lets the content decide its direction', () => {
    const { container } = render(<RichText body="سلام" />);
    expect(container.firstElementChild).toHaveAttribute('dir', 'auto');
  });
});
