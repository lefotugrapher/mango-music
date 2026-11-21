import { Play } from '@phosphor-icons/react';
import type { ShelfItem } from '../domain/types';
import { Artwork } from './Artwork';
import './ui.css';

type Props = {
  item: ShelfItem;
  onOpen: (item: ShelfItem) => void;
  onPlay?: (item: ShelfItem) => void;
};

export function Card({ item, onOpen, onPlay }: Props) {
  return (
    <article className="card" data-kind={item.kind}>
      <button type="button" className="card__open" onClick={() => onOpen(item)}>
        <Artwork image={item.image} alt="" shape={item.kind === 'artist' ? 'circle' : 'square'} />
        <span className="card__title truncate">{item.title}</span>
        <span className="card__subtitle truncate">{item.subtitle}</span>
      </button>
      {onPlay && (
        <button type="button" className="card__play" aria-label={`Play ${item.title}`} onClick={() => onPlay(item)}>
          <Play weight="fill" aria-hidden="true" />
        </button>
      )}
    </article>
  );
}
