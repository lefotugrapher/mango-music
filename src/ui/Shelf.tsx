import { useId } from 'react';
import type { ShelfItem } from '../domain/types';
import { Card } from './Card';
import './ui.css';

type Props = {
  title: string;
  items: ShelfItem[];
  onOpen: (item: ShelfItem) => void;
  onPlay?: (item: ShelfItem) => void;
};

/** A titled, horizontally scrolling row of cards. Renders nothing when empty. */
export function Shelf({ title, items, onOpen, onPlay }: Props) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section className="shelf" aria-labelledby={headingId}>
      <h2 id={headingId} className="shelf__title">
        {title}
      </h2>
      <ul className="shelf__row">
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="shelf__cell">
            <Card item={item} onOpen={onOpen} onPlay={onPlay} />
          </li>
        ))}
      </ul>
    </section>
  );
}
