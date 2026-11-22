/**
 * Audio and voice-note player (AGENTS.md §13.2): play/pause, a seek bar,
 * elapsed/total time and playback speed. The file loads on first play
 * (decoded first where the engine can't play Opus); one item plays at a
 * time and playback pauses when the app is hidden. The duration measured
 * on first play is stored.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import clsx from 'clsx';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { MEDIA } from '../../config';
import { PauseIcon, PlayIcon } from '../../components/icons';
import { logger } from '../../logging';
import { saveAudioDuration } from '../../queries/media-queries';
import type { AttachmentView } from '../../../client/db-client';
import { audioPlayback } from './audio-playback';
import { resolveAudioSource } from './audio-source';
import { formatClock } from './media-format';

const MS_PER_SECOND = 1000;

type Phase = 'idle' | 'preparing' | 'ready' | 'failed';

/** Props for {@link AudioPlayer}. */
export interface AudioPlayerProps {
  readonly attachment: AttachmentView;
  /** Colours for use inside a bubble vs. on a plain surface. */
  readonly tone: 'bubble' | 'surface';
}

/** Loads the file on demand and owns its object URL. */
function useAudioUrl(attachment: AttachmentView) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [decodedMs, setDecodedMs] = useState<number | null>(null);
  useEffect(
    () => () => {
      if (url !== null) {
        URL.revokeObjectURL(url);
      }
    },
    [url],
  );
  const prepare = (): void => {
    setPhase('preparing');
    void resolveAudioSource(attachment)
      .then((source) => {
        if (source === null) {
          setPhase('failed');
          logger.warn('media.audio-unavailable', { mediaType: attachment.mediaType });
          return;
        }
        setDecodedMs(source.durationMs);
        setUrl(URL.createObjectURL(source.file));
        setPhase('ready');
      })
      .catch(() => {
        setPhase('failed');
      });
  };
  const fail = (): void => {
    setPhase('failed');
  };
  return { phase, url, decodedMs, prepare, fail };
}

/** Starts playback at the chosen rate; a refused play just stays paused. */
function startPlayback(audio: HTMLAudioElement, rate: number, onRefused: () => void): void {
  audio.playbackRate = rate;
  audio.play().catch(onRefused);
}

/** Player state: source, play/pause, position, measured duration, speed. */
function usePlayer(attachment: AttachmentView, audioRef: RefObject<HTMLAudioElement | null>) {
  const source = useAudioUrl(attachment);
  const [isPlaying, setPlaying] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(false);
  const [position, setPosition] = useState(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const [rateIndex, setRateIndex] = useState(0);
  const rate = MEDIA.PLAYBACK_RATES[rateIndex] ?? 1;
  const knownMs = attachment.durationMs ?? source.decodedMs;
  const duration = measured ?? (knownMs === null ? 0 : knownMs / MS_PER_SECOND);
  const refused = (): void => {
    setPlaying(false);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null || source.url === null || !wantsPlay) {
      return;
    }
    setWantsPlay(false);
    startPlayback(audio, rate, refused);
  }, [audioRef, source.url, wantsPlay, rate]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio !== null) {
        audio.pause();
        audioPlayback.release(audio);
      }
    };
  }, [audioRef]);

  const toggle = (): void => {
    const audio = audioRef.current;
    if (audio === null) {
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else if (source.url === null) {
      setWantsPlay(true);
      if (source.phase !== 'preparing') {
        source.prepare();
      }
    } else {
      startPlayback(audio, rate, refused);
    }
  };
  const seek = (next: number): void => {
    if (audioRef.current !== null) {
      audioRef.current.currentTime = next;
    }
    setPosition(next);
  };
  const cycleRate = (): void => {
    const nextIndex = (rateIndex + 1) % MEDIA.PLAYBACK_RATES.length;
    setRateIndex(nextIndex);
    if (audioRef.current !== null) {
      audioRef.current.playbackRate = MEDIA.PLAYBACK_RATES[nextIndex] ?? 1;
    }
  };
  const onMetadata = (seconds: number): void => {
    if (Number.isFinite(seconds) && seconds > 0) {
      setMeasured(seconds);
      if (attachment.durationMs === null) {
        saveAudioDuration(attachment.id, Math.round(seconds * MS_PER_SECOND));
      }
    }
  };
  return {
    source,
    isPlaying,
    setPlaying,
    position,
    setPosition,
    duration,
    rate,
    toggle,
    seek,
    cycleRate,
    onMetadata,
  };
}

/** Status line: preparing, failed, or elapsed / total. */
function statusText(phase: Phase, position: number, duration: number): string {
  if (phase === 'preparing') {
    return en.media.audioPreparing;
  }
  if (phase === 'failed') {
    return en.media.audioFailed;
  }
  return formatString(en.media.audioTime, {
    elapsed: formatClock(position),
    total: formatClock(duration),
  });
}

export function AudioPlayer({ attachment, tone }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const player = usePlayer(attachment, audioRef);
  const { source, isPlaying, position, duration, rate } = player;
  const label = en.chatView.mediaLabels[attachment.mediaType];
  const isBubble = tone === 'bubble';
  const accent = isBubble ? 'text-link-on-bubble' : 'text-accent';
  const speedText = formatString(en.media.audioSpeedValue, { speed: rate });
  return (
    <div className="flex w-64 max-w-full flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={formatString(isPlaying ? en.media.audioPause : en.media.audioPlay, { label })}
          disabled={source.phase === 'failed'}
          className={clsx(
            'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
            accent,
          )}
          onClick={player.toggle}
        >
          {isPlaying ? <PauseIcon className="h-7 w-7" /> : <PlayIcon className="h-7 w-7" />}
        </button>
        <input
          type="range"
          aria-label={en.media.audioSeek}
          aria-valuetext={statusText('ready', position, duration)}
          min={0}
          max={Math.max(duration, 0.1)}
          step={0.1}
          value={Math.min(position, duration)}
          disabled={source.url === null}
          className="accent-accent min-h-11 min-w-0 flex-1"
          onChange={(event) => {
            player.seek(Number(event.target.value));
          }}
        />
        <button
          type="button"
          aria-label={formatString(en.media.audioSpeed, { speed: speedText })}
          className={clsx('min-h-11 min-w-11 shrink-0 rounded-full text-sm font-semibold', accent)}
          onClick={player.cycleRate}
        >
          {speedText}
        </button>
      </div>
      <p
        className={clsx(
          'flex justify-between gap-2 ps-1 text-xs',
          isBubble ? 'text-text-muted-on-bubble' : 'text-text-muted',
        )}
      >
        <span>{label}</span>
        <span aria-live="polite">{statusText(source.phase, position, duration)}</span>
      </p>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- exported voice notes and audio files carry no caption tracks to offer. */}
      <audio
        ref={audioRef}
        src={source.url ?? undefined}
        preload="none"
        onPlay={(event) => {
          audioPlayback.claim(event.currentTarget);
          player.setPlaying(true);
        }}
        onPause={(event) => {
          audioPlayback.release(event.currentTarget);
          player.setPlaying(false);
        }}
        onEnded={(event) => {
          audioPlayback.release(event.currentTarget);
          player.setPlaying(false);
          player.setPosition(0);
        }}
        onTimeUpdate={(event) => {
          player.setPosition(event.currentTarget.currentTime);
        }}
        onLoadedMetadata={(event) => {
          player.onMetadata(event.currentTarget.duration);
        }}
        onError={() => {
          if (source.url !== null) {
            source.fail();
          }
        }}
      />
    </div>
  );
}
