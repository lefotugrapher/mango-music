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

describe('Setup', () => {
  it('shows the exact redirect URI to register and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setup();
    expect(screen.getByText('http://127.0.0.1:5173/')).toBeInTheDocument();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy redirect URI' }));
    expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:5173/');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('connects with a valid Client ID, tidied up', async () => {
    const { onConnect } = setup();
    typeId(`  ${VALID_ID.toUpperCase()}  `);
    await userEvent.click(screen.getByRole('button', { name: 'Connect Spotify' }));
    expect(onConnect).toHaveBeenCalledWith(VALID_ID);
  });

  it('explains an invalid Client ID and does not connect', async () => {
    const { onConnect } = setup();
    typeId('not-an-id');
    await userEvent.click(screen.getByRole('button', { name: 'Connect Spotify' }));
    expect(screen.getByText("That doesn't look like a Client ID (32 letters and numbers).")).toBeInTheDocument();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('warns that the Client Secret is never needed', () => {
    setup();
    expect(screen.getByText(/never paste your Client Secret/i)).toBeInTheDocument();
  });

  it('on localhost, explains the problem, links to the loopback address, and blocks connecting', () => {
    setup({ location: new URL('http://localhost:5173/') });
    expect(screen.getByRole('alert')).toHaveTextContent(/localhost/);
    expect(screen.getByRole('link', { name: 'http://127.0.0.1:5173/' })).toHaveAttribute(
      'href',
      'http://127.0.0.1:5173/',
    );
    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Look around first' })).toBeEnabled();
  });

  it('blocks connecting from an insecure address', () => {
    setup({ location: new URL('http://192.168.1.5:5173/') });
    expect(screen.getByRole('alert')).toHaveTextContent(/HTTPS/);
    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeDisabled();
  });

  it('starts the demo', async () => {
    const { onDemo } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Look around first' }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it('shows a notice passed from the app, such as a failed sign-in', () => {
    setup({ notice: 'Spotify sign-in was cancelled.' });
    expect(screen.getByRole('status')).toHaveTextContent('Spotify sign-in was cancelled.');
  });

  it('pre-fills a remembered Client ID', () => {
    setup({ defaultClientId: VALID_ID });
    expect(screen.getByRole('textbox', { name: 'Client ID' })).toHaveValue(VALID_ID);
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
