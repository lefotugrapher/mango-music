import { describe, expect, it } from 'vitest';
import { challengeFor, createVerifier } from './pkce';

describe('pkce', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('creates a 64 character URL-safe verifier', () => {
    expect(createVerifier()).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
  });

  it('uses the injected random source', () => {
    expect(createVerifier((n) => new Uint8Array(n))).toBe('A'.repeat(64));
  });

  it('produces different verifiers', () => {
    expect(createVerifier()).not.toBe(createVerifier());
  });
});
