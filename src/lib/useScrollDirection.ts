import { useEffect, useRef, useState } from 'react';

export type ScrollDirection = 'top' | 'up' | 'down';

/**
 * Which way the reader is scrolling `el`. A reversal only counts once it
 * exceeds `threshold` px from the furthest point reached, so trackpad jitter
 * does not make the bars twitch.
 */
export function useScrollDirection(el: HTMLElement | null, threshold = 12): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('top');
  const state = useRef<{ direction: ScrollDirection; anchor: number }>({ direction: 'top', anchor: 0 });

  useEffect(() => {
    if (!el) return;
    const set = (next: ScrollDirection, y: number) => {
      state.current = { direction: next, anchor: y };
      setDirection(next);
    };
    const onScroll = () => {
      const y = el.scrollTop;
      const { direction: current, anchor } = state.current;
      if (y <= threshold) {
        if (current !== 'top') set('top', y);
        else state.current.anchor = y;
        return;
      }
      const delta = y - anchor;
      if (delta > threshold) {
        if (current !== 'down') set('down', y);
        else state.current.anchor = y;
      } else if (delta < -threshold) {
        if (current !== 'up') set('up', y);
        else state.current.anchor = y;
      } else if ((current === 'down' && delta > 0) || (current === 'up' && delta < 0)) {
        // Still travelling the same way: move the anchor to the furthest point.
        state.current.anchor = y;
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [el, threshold]);

  return direction;
}
