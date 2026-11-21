import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './ui.css';

type Props = {
  value: number;
  max: number;
  label: string;
  step?: number;
  formatValue?: (value: number) => string;
  /** Fires continuously while the value moves. */
  onChange?: (value: number) => void;
  /** Fires once when the user lets go, or after each key press. */
  onCommit?: (value: number) => void;
  className?: string;
};

export function Slider({ value, max, label, step = 1, formatValue, onChange, onCommit, className }: Props) {
  // While dragging, and briefly after release, the slider shows the user's
  // value rather than the prop, so the thumb does not snap back before the
  // owner has caught up (a seek is asynchronous).
  const [held, setHeld] = useState<number | null>(null);
  const dragging = useRef(false);
  const latest = useRef(value);
  const disabled = !(max > 0);
  const shown = disabled ? 0 : Math.min(max, Math.max(0, held ?? value));

  useEffect(() => {
    if (!dragging.current) setHeld(null);
  }, [value]);

  useEffect(() => {
    if (held == null || dragging.current) return;
    const timer = setTimeout(() => setHeld(null), 1000);
    return () => clearTimeout(timer);
  }, [held]);

  const clamp = (v: number) => Math.min(max, Math.max(0, v));

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? clamp(((e.clientX - rect.left) / rect.width) * max) : 0;
  };

  const move = (v: number) => {
    latest.current = v;
    setHeld(v);
    onChange?.(v);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    move(fromPointer(e));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) move(fromPointer(e));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    onCommit?.(latest.current);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const page = Math.max(step, max / 10);
    const next: Record<string, number> = {
      ArrowRight: shown + step,
      ArrowUp: shown + step,
      ArrowLeft: shown - step,
      ArrowDown: shown - step,
      PageUp: shown + page,
      PageDown: shown - page,
      Home: 0,
      End: max,
    };
    const target = next[e.key];
    if (target == null) return;
    e.preventDefault();
    const v = clamp(target);
    latest.current = v;
    setHeld(v);
    onChange?.(v);
    onCommit?.(v);
  };

  const ratio = disabled ? 0 : shown / max;

  return (
    <div
      className={className ? `slider ${className}` : 'slider'}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={formatValue ? formatValue(shown) : undefined}
      aria-disabled={disabled || undefined}
      data-dragging={dragging.current || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className="slider__track">
        <span className="slider__fill" style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </div>
  );
}
