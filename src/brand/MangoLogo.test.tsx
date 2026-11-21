import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Brand, MangoLogo } from './MangoLogo';

describe('MangoLogo', () => {
  it('is decorative unless it is given a name', () => {
    const { container } = render(<MangoLogo />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('can stand on its own as a named image', () => {
    render(<MangoLogo title="Mango Music" />);
    expect(screen.getByRole('img', { name: 'Mango Music' })).toBeInTheDocument();
  });

  it('is a mango with a bite taken out, a stem and a leaf, drawn in the current text colour', () => {
    const { container } = render(<MangoLogo />);
    // The bite is cut out of the body with a mask, so whatever is behind shows through.
    const mask = container.querySelector('mask');
    expect(mask?.querySelector('circle')).not.toBeNull();
    const body = container.querySelector('[data-part="body"]');
    expect(body).toHaveAttribute('mask', `url(#${mask?.id})`);
    expect(container.querySelector('[data-part="stem"]')).not.toBeNull();
    expect(container.querySelector('[data-part="leaf"]')).not.toBeNull();
    for (const part of container.querySelectorAll('[data-part]')) expect(part).toHaveAttribute('fill', 'currentColor');
  });

  it('gives every copy its own mask, so two logos on a page do not share one', () => {
    const { container } = render(
      <>
        <MangoLogo />
        <MangoLogo />
      </>,
    );
    const ids = [...container.querySelectorAll('mask')].map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('Brand', () => {
  it('reads as "Mango Music": the mango mark followed by the word Music', () => {
    render(<Brand />);
    const brand = screen.getByRole('img', { name: 'Mango Music' });
    expect(brand).toHaveTextContent(/^Music$/);
    expect(brand.querySelector('svg')).not.toBeNull();
  });
});
