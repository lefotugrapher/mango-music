import type { ReactNode } from 'react';
import { Glass } from '../glass/Glass';
import './ui.css';

type Props = {
  label: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** A floating glass disc, for controls that sit over content. */
  glass?: boolean;
  /** Set for toggles; leave undefined for plain buttons. */
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

export function IconButton({ label, onClick, size = 'md', glass = false, pressed, disabled, className, children }: Props) {
  const shared = {
    type: 'button' as const,
    className: ['icon-btn', glass ? 'icon-btn--glass' : '', className ?? ''].filter(Boolean).join(' '),
    'data-size': size,
    'aria-label': label,
    'aria-pressed': pressed,
    disabled,
    onClick,
  };
  if (glass) {
    return (
      <Glass as="button" material="clear" refract={false} radius={999} {...shared}>
        {children}
      </Glass>
    );
  }
  return <button {...shared}>{children}</button>;
}
