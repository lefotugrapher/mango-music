import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScrollDirection } from './useScrollDirection';

function scrollTo(el: HTMLElement, top: number) {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
}

describe('useScrollDirection', () => {
  it('follows the reader down and back up, ignoring jitter', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useScrollDirection(el));
    expect(result.current).toBe('top');

    scrollTo(el, 5);
    expect(result.current).toBe('top');

    scrollTo(el, 100);
    expect(result.current).toBe('down');

    // A few pixels back is not a change of direction.
    scrollTo(el, 95);
    expect(result.current).toBe('down');

    scrollTo(el, 60);
    expect(result.current).toBe('up');

    scrollTo(el, 68);
    expect(result.current).toBe('up');

    scrollTo(el, 0);
    expect(result.current).toBe('top');
  });

  it('keeps tracking a long scroll in one direction', () => {
    const el = document.createElement('div');
    const { result } = renderHook(() => useScrollDirection(el));
    scrollTo(el, 100);
    scrollTo(el, 105);
    scrollTo(el, 110);
    // 110 -> 96 is a 14px reversal from the furthest point reached.
    scrollTo(el, 96);
    expect(result.current).toBe('up');
  });

  it('reports top when there is no element yet', () => {
    const { result } = renderHook(() => useScrollDirection(null));
    expect(result.current).toBe('top');
  });
});
