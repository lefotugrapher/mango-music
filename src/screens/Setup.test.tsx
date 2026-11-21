import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import { Setup } from './Setup';
import { DEFAULT_SETTINGS, useSettings } from '../settings/store';
import { makeDemoSession, renderApp } from '../test/render';

const LOOPBACK = new URL('http://127.0.0.1:5173/');
const VALID_ID = '0123456789abcdef0123456789abcdef';

function setup(props: Partial<Parameters<typeof Setup>[0]> = {}) {
  const onConnect = vi.fn();
  const onDemo = vi.fn();
  render(<Setup location={LOOPBACK} onConnect={onConnect} onDemo={onDemo} {...props} />);
  return { onConnect, onDemo };
}

const typeId = (value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Client ID' }), { target: { value } });

describe('Setup, signing in when a Client ID is already known', () => {
  it('is titled Mango Music', () => {
    setup({ clientId: VALID_ID });
    expect(screen.getByRole('heading', { level: 1, name: 'Mango Music' })).toBeInTheDocument();
  });

  it('is a single button: no Client ID field, no setup steps', async () => {
    const { onConnect } = setup({ clientId: VALID_ID });
    expect(screen.queryByRole('textbox', { name: 'Client ID' })).toBeNull();
    expect(screen.queryByText(/Redirect URI/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Spotify' }));
    expect(onConnect).toHaveBeenCalledWith(VALID_ID);
  });

  it('says where the sign-in happens and which ways of signing in Spotify offers', () => {
    setup({ clientId: VALID_ID });
    const note = screen.getByText(/Spotify's own page/);
    expect(note).toHaveTextContent(/email and password/);
    expect(note).toHaveTextContent(/Google/);
    expect(note).toHaveTextContent(/Apple/);
    expect(note).toHaveTextContent(/never sees your password/);
  });

  it('never asks for a password itself', () => {
    setup({ clientId: VALID_ID });
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  it('offers Continue with Spotify as the only choice', () => {
    setup({ clientId: VALID_ID });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Continue with Spotify']);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('still blocks signing in from an address Spotify refuses', () => {
    setup({ clientId: VALID_ID, location: new URL('http://localhost:5173/') });
    expect(screen.getByRole('alert')).toHaveTextContent(/localhost/);
    expect(screen.getByRole('button', { name: 'Continue with Spotify' })).toBeDisabled();
  });

  it('shows a notice passed from the app, such as a failed sign-in', () => {
    setup({ clientId: VALID_ID, notice: 'Spotify sign-in was cancelled.' });
    expect(screen.getByRole('status')).toHaveTextContent('Spotify sign-in was cancelled.');
  });
});

describe('Setup, the one-time step when no Client ID is known', () => {
  it('shows the exact redirect URI to register and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setup();
    expect(screen.getByText('http://127.0.0.1:5173/')).toBeInTheDocument();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy redirect URI' }));
    expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:5173/');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('says this only has to be done once', () => {
    setup();
    expect(screen.getByText(/only have to do this once/i)).toBeInTheDocument();
  });

  it('continues to Spotify with a valid Client ID, tidied up', async () => {
    const { onConnect } = setup();
    typeId(`  ${VALID_ID.toUpperCase()}  `);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Spotify' }));
    expect(onConnect).toHaveBeenCalledWith(VALID_ID);
  });

  it('explains an invalid Client ID and does not continue', async () => {
    const { onConnect } = setup();
    typeId('not-an-id');
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Spotify' }));
    expect(screen.getByText("That doesn't look like a Client ID (32 letters and numbers).")).toBeInTheDocument();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('asks for the Client ID when the field is left empty, rather than calling it invalid', async () => {
    const { onConnect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Spotify' }));
    expect(screen.getByText('Paste your Client ID first. Step 4 above shows where to find it.')).toBeInTheDocument();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('warns that the Client Secret is never needed', () => {
    setup();
    expect(screen.getByText(/never paste your Client Secret/i)).toBeInTheDocument();
  });

  it('on localhost, explains the problem, links to the loopback address, and blocks continuing', () => {
    setup({ location: new URL('http://localhost:5173/') });
    expect(screen.getByRole('alert')).toHaveTextContent(/localhost/);
    expect(screen.getByRole('link', { name: 'http://127.0.0.1:5173/' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:5173/',
    );
    expect(screen.getByRole('button', { name: 'Continue with Spotify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Look around first' })).toBeEnabled();
  });

  it('blocks continuing from an insecure address', () => {
    setup({ location: new URL('http://192.168.1.5:5173/') });
    expect(screen.getByRole('alert')).toHaveTextContent(/HTTPS/);
    expect(screen.getByRole('button', { name: 'Continue with Spotify' })).toBeDisabled();
  });

  it('opens straight on the form when asked to change the Client ID', () => {
    setup({ clientId: VALID_ID, editing: true });
    expect(screen.getByRole('textbox', { name: 'Client ID' })).toBeInTheDocument();
  });
});

describe('Settings', () => {
  beforeEach(() => {
    useSettings.setState({ ...DEFAULT_SETTINGS });
  });

  it('shows who is signed in', async () => {
    const session = makeDemoSession();
    const me = await session.source.me();
    renderApp(<Settings mode="demo" onDisconnect={() => {}} onChangeClientId={() => {}} />, { session });
    expect(await screen.findByText(me.name)).toBeInTheDocument();
  });

  it('changes appearance, glass quality and motion', async () => {
    renderApp(<Settings mode="demo" onDisconnect={() => {}} onChangeClientId={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(useSettings.getState().appearance).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    await userEvent.click(screen.getByRole('radio', { name: 'Solid' }));
    expect(useSettings.getState().glass).toBe('solid');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Reduce motion' }));
    expect(useSettings.getState().reduceMotion).toBe(true);
    expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true');
  });

  it('has a slider from solid to glassy', async () => {
    renderApp(<Settings mode="demo" onDisconnect={() => {}} onChangeClientId={() => {}} />);
    const slider = screen.getByRole('slider', { name: 'Glassiness' });
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(useSettings.getState().glassiness).toBe(100);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(useSettings.getState().glassiness).toBe(0);
    expect(slider).toHaveAttribute('aria-valuetext', 'Solid');
  });

  it('offers only "Exit demo" in the demo', async () => {
    const onDisconnect = vi.fn();
    renderApp(<Settings mode="demo" onDisconnect={onDisconnect} onChangeClientId={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Exit demo' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Change Client ID' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect Spotify' })).toBeNull();
  });

  it('offers Disconnect and Change Client ID when connected to Spotify', async () => {
    const onDisconnect = vi.fn();
    const onChangeClientId = vi.fn();
    renderApp(<Settings mode="spotify" onDisconnect={onDisconnect} onChangeClientId={onChangeClientId} />);
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect Spotify' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Change Client ID' }));
    expect(onChangeClientId).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Exit demo' })).toBeNull();
  });
});
