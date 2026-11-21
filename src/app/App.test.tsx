import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LoginResult } from '../auth/spotifyAuth';
import type { PlayerError, PlayerState } from '../domain/types';
import { DEFAULT_SETTINGS, useSettings } from '../settings/store';
import { SpotifyError } from '../spotify/contract';
import { makeDemoSession } from '../test/render';
import { App, type AppDeps } from './App';
import type { SpotifySession } from '../session/spotifySession';

const VALID_ID = '0123456789abcdef0123456789abcdef';
const ROOT = 'http://127.0.0.1:5173/';

function fakeSpotifySession() {
  const demo = makeDemoSession();
  let signedOut: (() => void) | null = null;
  const tokens = {
    get: () => ({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 }),
    getAccessToken: async () => 'a',
    forceRefresh: async () => 'a',
    clear: vi.fn(),
    onSignedOut: (cb: () => void) => {
      signedOut = cb;
      return () => {
        signedOut = null;
      };
    },
  };
  const session: SpotifySession = { ...demo, mode: 'spotify', tokens };
  const dispose = vi.spyOn(session.player, 'dispose');
  return { session, tokens, dispose, fireSignedOut: () => act(() => signedOut?.()) };
}

function deps(overrides: Partial<AppDeps> & { href?: string } = {}): AppDeps {
  const { href = ROOT, ...rest } = overrides;
  return {
    location: new URL(href),
    completeLogin: vi.fn(async (): Promise<LoginResult> => ({ ok: true })),
    beginLogin: vi.fn(async () => {}),
    createSpotifySession: vi.fn(async () => fakeSpotifySession().session),
    replaceUrl: vi.fn(),
    ...rest,
  };
}

const remember = (tokens = true) => {
  localStorage.setItem('pane.clientId', JSON.stringify(VALID_ID));
  if (tokens) localStorage.setItem('pane.tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 }));
};

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS });
  window.location.hash = '';
});

describe('App', () => {
  it('shows Setup on a first visit', async () => {
    render(<App deps={deps()} />);
    expect(await screen.findByRole('button', { name: 'Connect Spotify' })).toBeInTheDocument();
  });

  it('enters the demo from Setup and leaves it again from Settings', async () => {
    render(<App deps={deps()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Look around first' }));
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Exit demo' }));
    expect(await screen.findByRole('button', { name: 'Connect Spotify' })).toBeInTheDocument();
  });

  it('remembers the Client ID and starts the Spotify sign-in', async () => {
    const d = deps();
    render(<App deps={d} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Client ID' }), { target: { value: VALID_ID } });
    await userEvent.click(screen.getByRole('button', { name: 'Connect Spotify' }));
    expect(JSON.parse(localStorage.getItem('pane.clientId')!)).toBe(VALID_ID);
    expect(d.beginLogin).toHaveBeenCalledWith(VALID_ID, ROOT);
  });

  it('finishes a sign-in, cleans the address bar, and opens Home', async () => {
    remember(false);
    const d = deps({ href: `${ROOT}?code=abc&state=def` });
    render(<App deps={d} />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(d.completeLogin).toHaveBeenCalledTimes(1);
    expect(d.replaceUrl).toHaveBeenCalledWith(ROOT);
    expect(d.createSpotifySession).toHaveBeenCalledWith(VALID_ID);
  });

  it.each([
    ['denied', 'Spotify sign-in was cancelled.'],
    ['state_mismatch', "Sign-in didn't complete. Try again."],
    ['exchange_failed', "Sign-in didn't complete. Try again."],
  ] as const)('returns to Setup with a reason when sign-in fails (%s)', async (reason, message) => {
    remember(false);
    const d = deps({
      href: `${ROOT}?error=access_denied`,
      completeLogin: vi.fn(async (): Promise<LoginResult> => ({ ok: false, reason })),
    });
    render(<App deps={d} />);
    // The notice is a status region; the start-up spinner is one too, so find it by its text.
    expect(await screen.findByText(message)).toHaveAttribute('role', 'status');
    expect(d.replaceUrl).toHaveBeenCalledWith(ROOT);
    expect(d.createSpotifySession).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Client ID' })).toHaveValue(VALID_ID);
  });

  it('restores a stored session straight into Home', async () => {
    remember();
    const d = deps();
    render(<App deps={d} />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(d.completeLogin).not.toHaveBeenCalled();
  });

  it('returns to Setup with a message when Spotify signs the user out', async () => {
    remember();
    const fake = fakeSpotifySession();
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    await screen.findByRole('heading', { name: 'Home' });
    await fake.fireSignedOut();
    expect(await screen.findByText('Spotify signed you out. Connect again.')).toHaveAttribute('role', 'status');
    expect(fake.dispose).toHaveBeenCalled();
  });

  it('disconnects: clears tokens, stops the player, keeps the Client ID', async () => {
    remember();
    const fake = fakeSpotifySession();
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect Spotify' }));
    expect(await screen.findByRole('button', { name: 'Connect Spotify' })).toBeInTheDocument();
    expect(fake.tokens.clear).toHaveBeenCalledTimes(1);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('pane.clientId')!)).toBe(VALID_ID);
    // A deliberate disconnect is not reported as Spotify signing the user out.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('forgets the Client ID when asked to change it', async () => {
    remember();
    const fake = fakeSpotifySession();
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Settings' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Change Client ID' }));
    expect(await screen.findByRole('textbox', { name: 'Client ID' })).toHaveValue('');
    expect(localStorage.getItem('pane.clientId')).toBeNull();
  });

  it("explains when the account isn't on the developer app's user list", async () => {
    remember();
    const fake = fakeSpotifySession();
    vi.spyOn(fake.session.source, 'me').mockRejectedValue(new SpotifyError(403, 'forbidden'));
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    expect(await screen.findByText(/isn't on the app's user list/)).toHaveAttribute('role', 'status');
    expect(fake.dispose).toHaveBeenCalled();
  });

  it('still opens the app when the profile check fails for another reason, such as being offline', async () => {
    remember();
    const fake = fakeSpotifySession();
    vi.spyOn(fake.session.source, 'me').mockRejectedValue(new SpotifyError(0, 'network'));
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('returns to Setup when the Spotify session cannot be created', async () => {
    remember();
    const d = deps({ createSpotifySession: vi.fn(async () => Promise.reject(new Error('boom'))) });
    render(<App deps={d} />);
    expect(await screen.findByText("Pane couldn't start Spotify. Try connecting again.")).toHaveAttribute('role', 'status');
  });

  it('keeps browsing available and says why when playback needs Premium', async () => {
    remember();
    const fake = fakeSpotifySession();
    const error: PlayerError = { kind: 'premium_required', message: 'Playback needs Spotify Premium. You can still browse.' };
    const state: PlayerState = { ...fake.session.player.getState(), error };
    vi.spyOn(fake.session.player, 'getState').mockReturnValue(state);
    render(<App deps={deps({ createSpotifySession: vi.fn(async () => fake.session) })} />);
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Playback needs Spotify Premium. You can still browse.');
  });
});
