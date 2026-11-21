import { useId, useState, type FormEvent } from 'react';
import { ArrowSquareOut, Check, Copy, SpotifyLogo } from '@phosphor-icons/react';
import { parseClientId, redirectUriFor, type RedirectInfo } from '../auth/redirect';
import { Glass } from '../glass/Glass';
import { MeshBackground } from '../nowplaying/MeshBackground';
import './screens.css';

type Props = {
  /** A message from the app, e.g. why the last sign-in did not finish. */
  notice?: string;
  /** The Client ID to sign in with, when one is built in or remembered. */
  clientId?: string | null;
  /** Open on the Client ID form even though one is known. */
  editing?: boolean;
  /** Where the app is being served from. Injected in tests. */
  location?: Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname'>;
  onConnect: (clientId: string) => void;
  onDemo: () => void;
};

const BRAND_COLOURS = ['#fa2d48', '#7a1fa2', '#ff7a59', '#2b1b6b'];
const DASHBOARD = 'https://developer.spotify.com/dashboard';

function AddressProblem({ info }: { info: RedirectInfo }) {
  if (info.problem === 'localhost') {
    return (
      <p className="setup__alert" role="alert">
        Spotify doesn't accept <code>localhost</code> addresses. Open Pane at{' '}
        <a href={info.suggested}>{info.suggested}</a> instead, then continue.
      </p>
    );
  }
  if (info.problem === 'insecure') {
    return (
      <p className="setup__alert" role="alert">
        Spotify only accepts HTTPS addresses, or <code>127.0.0.1</code> on this computer. Open Pane from one of those
        to continue.
      </p>
    );
  }
  return null;
}

/**
 * Signing in. Pane never handles a Spotify password: the button sends the
 * person to Spotify's own page, which offers email and password, Google,
 * Apple and Facebook, and Spotify sends them back signed in.
 */
function SignIn({
  blocked,
  onContinue,
  onDemo,
  onEdit,
}: {
  blocked: boolean;
  onContinue: () => void;
  onDemo: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="setup__signin">
      <button type="button" className="btn setup__spotify" disabled={blocked} onClick={onContinue}>
        <SpotifyLogo weight="fill" aria-hidden="true" />
        Continue with Spotify
      </button>
      <p className="setup__methods">
        You sign in on Spotify's own page, with your email and password, Google, Apple or Facebook. Pane never sees
        your password.
      </p>
      <button type="button" className="btn setup__secondary" onClick={onDemo}>
        Look around first
      </button>
      <button type="button" className="setup__link" onClick={onEdit}>
        Use a different Client ID
      </button>
    </div>
  );
}

/** The one-time step: registering a Spotify developer app and giving Pane its Client ID. */
function ClientIdForm({
  redirectUri,
  blocked,
  onConnect,
  onDemo,
}: {
  redirectUri: string;
  blocked: boolean;
  onConnect: (clientId: string) => void;
  onDemo: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (!value.trim()) {
      setError('Paste your Client ID first. Step 4 above shows where to find it.');
      return;
    }
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
    <>
      <p className="setup__once">
        Spotify asks every app that plays its music to be registered. You only have to do this once: after that,
        signing in is one button.
      </p>

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
        <label className="setup__label" htmlFor={inputId}>
          Client ID
        </label>
        <input
          id={inputId}
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
          <button type="submit" className="btn setup__spotify" disabled={blocked}>
            <SpotifyLogo weight="fill" aria-hidden="true" />
            Continue with Spotify
          </button>
          <button type="button" className="btn setup__secondary" onClick={onDemo}>
            Look around first
          </button>
        </div>
      </form>
    </>
  );
}

export function Setup({ notice, clientId = null, editing = false, location = window.location, onConnect, onDemo }: Props) {
  const info = redirectUriFor(location);
  const [showForm, setShowForm] = useState(editing || !clientId);
  const blocked = info.problem !== null;

  return (
    <div className="setup">
      <MeshBackground colors={BRAND_COLOURS} />
      <div className="setup__scrim" aria-hidden="true" />

      <Glass as="main" className="setup__card" radius={28} data-view={showForm ? 'form' : 'signin'}>
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
        <AddressProblem info={info} />

        {showForm || !clientId ? (
          <ClientIdForm
            redirectUri={info.suggested ?? info.uri}
            blocked={blocked}
            onConnect={onConnect}
            onDemo={onDemo}
          />
        ) : (
          <SignIn
            blocked={blocked}
            onContinue={() => onConnect(clientId)}
            onDemo={onDemo}
            onEdit={() => setShowForm(true)}
          />
        )}

        <p className="setup__foot">
          Playback needs Spotify Premium. Everything stays in this browser. Pane is an unofficial project and is not
          affiliated with Spotify.
        </p>
      </Glass>
    </div>
  );
}
