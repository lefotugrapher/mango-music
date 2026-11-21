import type { CSSProperties } from 'react';
import { MusicNote } from '@phosphor-icons/react';
import type { Image } from '../domain/types';
import './ui.css';

type Props = {
  image?: Image;
  /** Pass '' when the name is already written next to the artwork. */
  alt: string;
  /** Covers are always square. Only artist photos may be circles. */
  shape?: 'square' | 'circle';
  size?: number | 'fill';
  radius?: number;
  className?: string;
};

export function Artwork({ image, alt, shape = 'square', size = 'fill', radius, className }: Props) {
  const style: CSSProperties & Record<string, string | number> = { width: size === 'fill' ? '100%' : size };
  if (radius != null) style['--art-radius'] = `${radius}px`;

  return (
    <span className={className ? `artwork ${className}` : 'artwork'} data-shape={shape} style={style}>
      {image ? (
        <img src={image.url} alt={alt} loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span
          className="artwork__placeholder"
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
        >
          <MusicNote weight="fill" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
