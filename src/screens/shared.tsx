import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { GearSix } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router';
import type { AlbumRef, Image, ShelfItem } from '../domain/types';
import { usePalette } from '../nowplaying/palette';
import { usePlayer, useSource } from '../session/hooks';
import { Artwork } from '../ui/Artwork';
import { Card } from '../ui/Card';
import './screens.css';

/** Opening a card navigates to it; a track has no page, so it plays. */
export function useOpenItem() {
  const navigate = useNavigate();
  const player = usePlayer();
  return useCallback(
    (item: ShelfItem) => {
      if (item.kind === 'track') void player.play({ uris: [item.uri] });
      // Mix ids contain a colon ("artist:<id>"), so the id is always encoded.
      else void navigate(`/${item.kind}/${encodeURIComponent(item.id)}`);
    },
    [navigate, player],
  );
}

export function usePlayItem() {
  const player = usePlayer();
  const source = useSource();
  return useCallback(
    (item: ShelfItem) => {
      if (item.kind === 'mix') {
        // A mix exists only here, so Spotify cannot be asked to play it by
        // name: fetch its songs and play those.
        void source
          .mix(item.id)
          .then((mix) => {
            const uris = mix.tracks.filter((track) => track.playable).map((track) => track.uri);
            if (uris.length > 0) return player.play({ uris, index: 0 });
          })
          .catch(() => {
            // Opening the mix shows the reason; a card has nowhere to put one.
          });
        return;
      }
      void player.play(item.kind === 'track' ? { uris: [item.uri] } : { contextUri: item.uri });
    },
    [player, source],
  );
}

export const albumToItem = (album: AlbumRef): ShelfItem => ({
  kind: 'album',
  id: album.id,
  uri: album.uri,
  title: album.name,
  subtitle: album.releaseDate?.slice(0, 4) ?? album.artists.map((a) => a.name).join(', '),
  image: album.images[0],
});

/**
 * A detail page takes a wash of colour from its artwork. Only the colour is
 * used; the artwork itself is shown untouched.
 */
export function useTintStyle(image?: Image): CSSProperties {
  const [tint] = usePalette(image?.url);
  return { '--tint': tint } as CSSProperties;
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">{title}</h1>
        <Link to="/settings" className="page__account" aria-label="Settings">
          <GearSix aria-hidden="true" />
        </Link>
      </header>
      {children}
    </div>
  );
}

export function CardGrid({ items }: { items: ShelfItem[] }) {
  const onOpen = useOpenItem();
  const onPlay = usePlayItem();
  return (
    <ul className="card-grid">
      {items.map((item) => (
        <li key={`${item.kind}:${item.id}`} className="card-grid__cell">
          <Card item={item} onOpen={onOpen} onPlay={item.kind === 'artist' ? undefined : onPlay} />
        </li>
      ))}
    </ul>
  );
}

/** The header shared by album and playlist pages. */
export function DetailHeader({
  image,
  title,
  subtitle,
  meta,
  description,
  actions,
  shape = 'square',
  art,
}: {
  image?: Image;
  /** Shown in place of the image, for pages that have no artwork of their own. */
  art?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  meta?: string;
  description?: string;
  actions: ReactNode;
  shape?: 'square' | 'circle';
}) {
  return (
    <header className="detail__header">
      <div className="detail__art">{art ?? <Artwork image={image} alt="" shape={shape} radius={10} />}</div>
      <div className="detail__info">
        <h1 className="detail__title">{title}</h1>
        {subtitle && <div className="detail__subtitle">{subtitle}</div>}
        {meta && <div className="detail__meta">{meta}</div>}
        {description && <p className="detail__description">{description}</p>}
        <div className="detail__actions">{actions}</div>
      </div>
    </header>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-label={label}>
      <span className="loading__spinner" aria-hidden="true" />
    </div>
  );
}

/** Calls `onVisible` whenever the returned element scrolls near the viewport. */
export function useSentinel(onVisible: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}
