import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, useLongPress } from './use-long-press';

function Pressable({
  onLongPress,
  onClick,
}: {
  readonly onLongPress: () => void;
  readonly onClick: () => void;
}) {
  const press = useLongPress(onLongPress);
  return (
    <button type="button" onClick={onClick} {...press}>
      target
    </button>
  );
}

function setup() {
  const onLongPress = vi.fn();
  const onClick = vi.fn();
  render(<Pressable onLongPress={onLongPress} onClick={onClick} />);
  return { onLongPress, onClick, target: screen.getByRole('button', { name: 'target' }) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLongPress', () => {
  it('fires after holding a touch and swallows the click that follows', () => {
    const { onLongPress, onClick, target } = setup();
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(target);
    fireEvent.click(target);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(target);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a short tap, and the tap still clicks', () => {
    const { onLongPress, onClick, target } = setup();
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 100);
    });
    fireEvent.pointerUp(target);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(target);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cancels when the finger moves (scrolling)', () => {
    const { onLongPress, target } = setup();
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(target, { clientX: 10, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('ignores mouse presses and opens on right-click instead', () => {
    const { onLongPress, target } = setup();
    fireEvent.pointerDown(target, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.contextMenu(target);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice when a long press is followed by the context menu', () => {
    const { onLongPress, target } = setup();
    fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 0, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.contextMenu(target);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
