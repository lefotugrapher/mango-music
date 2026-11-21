import type { ReactNode } from 'react';
import './ui.css';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2 className="empty__title">{title}</h2>
      {body && <p className="empty__body">{body}</p>}
      {action}
    </div>
  );
}
