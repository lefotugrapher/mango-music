import { FastForward, Pause, Play, Repeat, RepeatOnce, Rewind, Shuffle } from '@phosphor-icons/react';
import { IconButton } from '../ui/IconButton';
import { useTransport } from './usePlayback';

const REPEAT_LABEL = { off: 'Repeat', context: 'Repeat: all', track: 'Repeat: one' } as const;

/** Shuffle, previous, play/pause, next, repeat. `size` picks the mini-bar or full-sheet scale. */
export function Transport({ size, modes = true }: { size: 'sm' | 'lg'; modes?: boolean }) {
  const t = useTransport();
  const side = size === 'lg' ? 'md' : 'sm';
  return (
    <div className="transport" data-size={size}>
      {modes && (
        <IconButton label="Shuffle" size="sm" pressed={t.state.shuffle} disabled={!t.hasTrack} onClick={t.toggleShuffle}>
          <Shuffle weight="bold" aria-hidden="true" />
        </IconButton>
      )}
      <IconButton label="Previous" size={side} disabled={!t.hasTrack} onClick={t.previous}>
        <Rewind weight="fill" aria-hidden="true" />
      </IconButton>
      <IconButton label={t.playing ? 'Pause' : 'Play'} size={size === 'lg' ? 'lg' : 'md'} disabled={!t.hasTrack} onClick={t.toggle}>
        {t.playing ? <Pause weight="fill" aria-hidden="true" /> : <Play weight="fill" aria-hidden="true" />}
      </IconButton>
      <IconButton label="Next" size={side} disabled={!t.hasTrack} onClick={t.next}>
        <FastForward weight="fill" aria-hidden="true" />
      </IconButton>
      {modes && (
        <IconButton
          label={REPEAT_LABEL[t.state.repeat]}
          size="sm"
          pressed={t.state.repeat !== 'off'}
          disabled={!t.hasTrack}
          onClick={t.cycleRepeat}
        >
          {t.state.repeat === 'track' ? (
            <RepeatOnce weight="bold" aria-hidden="true" />
          ) : (
            <Repeat weight="bold" aria-hidden="true" />
          )}
        </IconButton>
      )}
    </div>
  );
}
