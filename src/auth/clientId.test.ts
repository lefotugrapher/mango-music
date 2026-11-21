import { describe, expect, it } from 'vitest';
import { resolveClientId } from './clientId';

const A = '0123456789abcdef0123456789abcdef';
const B = 'fedcba9876543210fedcba9876543210';

describe('resolveClientId', () => {
  it('has nothing to offer when no Client ID is configured or remembered', () => {
    expect(resolveClientId({ builtIn: undefined, stored: null })).toBeNull();
    expect(resolveClientId({ builtIn: '', stored: null })).toBeNull();
  });

  it('uses the Client ID built into this copy of the app', () => {
    expect(resolveClientId({ builtIn: A, stored: null })).toEqual({ id: A, source: 'built-in' });
  });

  it('prefers a Client ID the person entered themselves', () => {
    expect(resolveClientId({ builtIn: A, stored: B })).toEqual({ id: B, source: 'stored' });
    expect(resolveClientId({ builtIn: undefined, stored: B })).toEqual({ id: B, source: 'stored' });
  });

  it('tidies a configured value and ignores one that is not a Client ID', () => {
    expect(resolveClientId({ builtIn: `  ${A.toUpperCase()}\n`, stored: null })).toEqual({ id: A, source: 'built-in' });
    expect(resolveClientId({ builtIn: 'your-client-id-here', stored: null })).toBeNull();
    expect(resolveClientId({ builtIn: A, stored: 'garbage' })).toEqual({ id: A, source: 'built-in' });
  });
});
