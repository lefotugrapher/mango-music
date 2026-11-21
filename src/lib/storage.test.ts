import { describe, expect, it } from 'vitest';
import { readJSON, removeKey, writeJSON } from './storage';

const throwingStore = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('quota');
  },
  removeItem() {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('storage helpers', () => {
  it('round-trips a value', () => {
    writeJSON('k', { a: 1 });
    expect(readJSON('k', null)).toEqual({ a: 1 });
  });

  it('returns the fallback when the key is missing', () => {
    expect(readJSON('missing', 7)).toBe(7);
  });

  it('returns the fallback when the stored value is not JSON', () => {
    localStorage.setItem('bad', '{not json');
    expect(readJSON('bad', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the store throws on read', () => {
    expect(readJSON('k', 'fallback', throwingStore)).toBe('fallback');
  });

  it('does not throw when the store throws on write or remove', () => {
    expect(() => writeJSON('k', 1, throwingStore)).not.toThrow();
    expect(() => removeKey('k', throwingStore)).not.toThrow();
  });

  it('removes a key', () => {
    writeJSON('k', 1);
    removeKey('k');
    expect(readJSON('k', null)).toBeNull();
  });
});
