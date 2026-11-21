import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatDuration(187000)).toBe('3:07');
    expect(formatDuration(59999)).toBe('0:59');
  });

  it('adds an hours field once a duration reaches an hour', () => {
    expect(formatDuration(3600000)).toBe('1:00:00');
    expect(formatDuration(3723000)).toBe('1:02:03');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});
