import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { attachment } from '../../test/fixtures';
import { AudioPlayer } from './audio-player';

const resolveAudioSource = vi.hoisted(() => vi.fn());
const saveAudioDuration = vi.hoisted(() => vi.fn());

vi.mock('./audio-source', () => ({ resolveAudioSource }));
vi.mock('../../queries/media-queries', () => ({ saveAudioDuration }));

const voice = attachment({
  mediaType: 'voice',
  fileName: 'PTT-20261117-WA0001.opus',
  mime: 'audio/ogg',
  thumbPath: null,
});

const play = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

describe('AudioPlayer', () => {
  it('loads on first play, plays, stores the measured duration and cycles speed', async () => {
    const user = userEvent.setup();
    resolveAudioSource.mockResolvedValue({ file: new Blob(['wav']), durationMs: null });
    const { container } = renderWithProviders(<AudioPlayer attachment={voice} tone="surface" />);
    await user.click(screen.getByRole('button', { name: 'Play Voice note' }));
    expect(resolveAudioSource).toHaveBeenCalledWith(voice);
    const audio = container.querySelector('audio');
    if (audio === null) return;
    await vi.waitFor(() => {
      expect(audio.getAttribute('src')).toBe('blob:voice');
    });
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalled();
    });
    fireEvent.play(audio);
    expect(screen.getByRole('button', { name: 'Pause Voice note' })).toBeInTheDocument();
    Object.defineProperty(audio, 'duration', { configurable: true, value: 12.4 });
    fireEvent.loadedMetadata(audio);
    expect(saveAudioDuration).toHaveBeenCalledWith(voice.id, 12_400);
    expect(screen.getByText('0:00 / 0:12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Playback speed 1×' }));
    expect(audio.playbackRate).toBe(1.5);
    expect(screen.getByRole('button', { name: 'Playback speed 1.5×' })).toBeInTheDocument();
  });

  it('says so when the audio cannot be prepared', async () => {
    const user = userEvent.setup();
    resolveAudioSource.mockResolvedValue(null);
    renderWithProviders(<AudioPlayer attachment={voice} tone="bubble" />);
    await user.click(screen.getByRole('button', { name: 'Play Voice note' }));
    expect(await screen.findByText('This audio could not be played.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Voice note' })).toBeDisabled();
  });
});
