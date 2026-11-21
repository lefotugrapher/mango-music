import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserKind, installState, listenForInstall, promptInstall, resetInstallForTests } from './install';

afterEach(() => {
  resetInstallForTests();
  vi.restoreAllMocks();
});

describe('browserKind', () => {
  it('tells Safari from Chromium browsers and the rest', () => {
    expect(
      browserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
      ),
    ).toBe('safari');
    expect(
      browserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      ),
    ).toBe('chromium');
    expect(
      browserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
      ),
    ).toBe('chromium');
    expect(browserKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0')).toBe(
      'other',
    );
  });
});

describe('install prompt', () => {
  it('offers the browser install button once the browser says the app can be installed', async () => {
    const stop = listenForInstall(window);
    expect(installState().canPrompt).toBe(false);

    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    expect(installState().canPrompt).toBe(true);

    await expect(promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    // A prompt can be shown only once.
    expect(installState().canPrompt).toBe(false);
    stop();
  });

  it('counts as installed after the browser reports it', () => {
    const stop = listenForInstall(window);
    window.dispatchEvent(new Event('appinstalled'));
    expect(installState().installed).toBe(true);
    stop();
  });

  it('does nothing when there is no prompt to show', async () => {
    await expect(promptInstall()).resolves.toBe(false);
  });
});
