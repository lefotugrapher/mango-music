import { Component, type ErrorInfo, type ReactNode } from 'react';
import '../ui/ui.css';

type Props = { children: ReactNode; onReload?: () => void };
type State = { failed: boolean };

/**
 * The last line of defence: if any screen throws while rendering, show a way
 * out instead of leaving a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pane hit an unexpected error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    return (
      <div className="empty" style={{ height: '100%', justifyContent: 'center' }}>
        <h1 className="empty__title">Something went wrong</h1>
        <p className="empty__body">Pane ran into a problem it could not recover from. Reloading usually fixes it.</p>
        <button type="button" className="btn btn--primary" onClick={reload}>
          Reload Pane
        </button>
      </div>
    );
  }
}
