import { useId, useState, type FormEvent } from 'react';
import { ArrowSquareOut, Check, Copy } from '@phosphor-icons/react';
import { parseClientId, redirectUriFor } from '../auth/redirect';
import { Glass } from '../glass/Glass';
import { MeshBackground } from '../nowplaying/MeshBackground';
import './screens.css';

type Props = {
  /** A message from the app, e.g. why the last sign-in did not finish. */
  notice?: string;
  defaultClientId?: string;
  /** Where the app is being served from. Injected in tests. */
  location?: Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname'>;
  onConnect: (clientId: string) => void;
  onDemo: () => void;
};

const BRAND_COLOURS = ['#fa2d48', '#7a1fa2', '#ff7a59', '#2b1b6b'];
const DASHBOARD = 'https://developer.spotify.com/dashboard';

/**
 * First run. Each person connects their own Spotify developer app, so the
 * project needs no shared credentials and no server.
 */
export function Setup({ notice, defaultClientId = '', location = window.location, onConnect, onDemo }: Props) {
  const info = redirectUriFor(location);
  const [value, setValue] = useState(defaultClientId);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const errorId = useId();
  const hintId = useId();
  const blocked = info.problem !== null;
  const redirectUri = info.suggested ?? info.uri;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    const clientId = parseClientId(value);
    if (!clientId) {
      setError("That doesn't look like a Client ID (32 letters and numbers).");
      return;
    }
    setError(null);
    onConnect(clientId);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the URI is on screen to copy by hand.
    }
  };

  return (
    <div className="setup">
      <MeshBackground colors={BRAND_COLOURS} />
      <div className="setup__scrim" aria-hidden="true" />

      <Glass as="main" className="setup__card" radius={28}>
        <header className="setup__header">
          <span className="setup__mark" aria-hidden="true" />
          <h1 className="setup__title">Pane</h1>
          <p className="setup__lede">A glass player for your own Spotify account.</p>
        </header>

        {notice && (
          <p className="setup__notice" role="status">
            {notice}
          </p>
        )}

        {info.problem === 'localhost' && (
          <p className="setup__alert" role="alert">
            Spotify doesn't accept <code>localhost</code> addresses. Open Pane at{' '}
            <a href={info.suggested}>{info.suggested}</a> instead, then connect.
          </p>
        )}
        {info.problem === 'insecure' && (
          <p className="setup__alert" role="alert">
            Spotify only accepts HTTPS addresses, or <code>127.0.0.1</code> on this computer. Open Pane from one of
            those to connect.
          </p>
        )}

        <ol className="setup__steps">
          <li>
            Open the{' '}
            <a href={DASHBOARD} target="_blank" rel="noreferrer noopener">
              Spotify Developer Dashboard
              <ArrowSquareOut aria-hidden="true" />
            </a>{' '}
            and choose <strong>Create app</strong>. Any name and description will do.
          </li>
          <li>
            Add this <strong>Redirect URI</strong>, exactly as written:
            <span className="setup__uri">
              <code>{redirectUri}</code>
              <button type="button" className="setup__copy" aria-label="Copy redirect URI" onClick={() => void copy()}>
                {copied ? <Check weight="bold" aria-hidden="true" /> : <Copy aria-hidden="true" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </span>
          </li>
          <li>
            Tick <strong>Web API</strong> and <strong>Web Playback SDK</strong>, then save.
          </li>
          <li>
            Open the app's settings, copy its <strong>Client ID</strong>, and paste it here.
          </li>
        </ol>

        <form className="setup__form" onSubmit={submit} noValidate>
          <label className="setup__label" htmlFor={`${hintId}-input`}>
            Client ID
          </label>
          <input
            id={`${hintId}-input`}
            className="setup__input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="32 letters and numbers"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && (
            <p id={errorId} className="setup__error">
              {error}
            </p>
          )}
          <p id={hintId} className="setup__hint">
            Never paste your Client Secret. Pane doesn't need it, and it should stay private.
          </p>

          <div className="setup__buttons">
            <button type="submit" className="btn btn--primary" disabled={blocked}>
              Connect Spotify
            </button>
            <button type="button" className="btn" onClick={onDemo}>
              Look around first
            </button>
          </div>
        </form>

        <p className="setup__foot">
          Playback needs Spotify Premium. Everything stays in this browser. Pane is an unofficial project and is not
          affiliated with Spotify.
        </p>
      </Glass>
    </div>
  );
}
