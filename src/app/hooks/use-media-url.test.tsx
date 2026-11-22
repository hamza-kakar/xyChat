import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaUrl } from './use-media-url';

const media = vi.hoisted(() => ({
  cache: new Map<string, string>(),
  readStoredFile: vi.fn(),
}));

vi.mock('../../platform/media-url', () => ({
  mediaUrlCache: {
    get: (path: string) => media.cache.get(path),
    put: (path: string) => {
      const url = `blob:${path}`;
      media.cache.set(path, url);
      return url;
    },
  },
  readStoredFile: (path: string) => media.readStoredFile(path) as Promise<File | null>,
}));

function Probe({ path }: { readonly path: string | null }) {
  const url = useMediaUrl(path);
  return <p>{url ?? 'none'}</p>;
}

beforeEach(() => {
  media.cache.clear();
  media.readStoredFile.mockReset();
});

describe('useMediaUrl', () => {
  it('reads the file on a miss and serves the cached URL afterwards', async () => {
    media.readStoredFile.mockResolvedValue(new File(['x'], 'a.jpg'));
    const { rerender } = render(<Probe path="thumbs/c/a.jpg" />);
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(await screen.findByText('blob:thumbs/c/a.jpg')).toBeInTheDocument();
    rerender(<Probe path="thumbs/c/a.jpg" />);
    expect(media.readStoredFile).toHaveBeenCalledTimes(1);
  });

  it('stays empty for no path or a missing file', async () => {
    media.readStoredFile.mockResolvedValue(null);
    const { rerender } = render(<Probe path={null} />);
    expect(screen.getByText('none')).toBeInTheDocument();
    rerender(<Probe path="thumbs/c/missing.jpg" />);
    await vi.waitFor(() => {
      expect(media.readStoredFile).toHaveBeenCalledWith('thumbs/c/missing.jpg');
    });
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('ignores a read that finishes after the path changed', async () => {
    let finish: (file: File) => void = () => undefined;
    media.readStoredFile.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    media.readStoredFile.mockResolvedValueOnce(new File(['y'], 'b.jpg'));
    const { rerender } = render(<Probe path="thumbs/c/a.jpg" />);
    rerender(<Probe path="thumbs/c/b.jpg" />);
    expect(await screen.findByText('blob:thumbs/c/b.jpg')).toBeInTheDocument();
    finish(new File(['x'], 'a.jpg'));
    await Promise.resolve();
    expect(screen.getByText('blob:thumbs/c/b.jpg')).toBeInTheDocument();
  });
});
