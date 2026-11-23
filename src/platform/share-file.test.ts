import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFile, downloadFile, shareFile } from './share-file';

const file = new File(['zip'], 'backup.zip');

afterEach(() => {
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stubShare(canShare: boolean, share: () => Promise<void>): void {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => canShare });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
}

describe('share-file', () => {
  it('shares only when the browser can share files', async () => {
    expect(canShareFile(file)).toBe(false);
    stubShare(true, () => Promise.resolve());
    expect(canShareFile(file)).toBe(true);
    expect(await shareFile(file)).toBe('shared');
  });

  it('tells a dismissed sheet from a refusal', async () => {
    stubShare(true, () => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await shareFile(file)).toBe('dismissed');
    stubShare(true, () => Promise.reject(new DOMException('no', 'NotAllowedError')));
    expect(await shareFile(file)).toBe('failed');
  });

  it('downloads through a temporary link and revokes it later', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadFile(file);
    expect(create).toHaveBeenCalledWith(file);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:backup');
  });
});
