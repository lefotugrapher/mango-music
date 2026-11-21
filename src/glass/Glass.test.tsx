import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Glass } from './Glass';
import { GlassFilterHost, useGlassFilter } from './GlassFilterHost';

function Probe({ w, h, r }: { w: number; h: number; r: number }) {
  const id = useGlassFilter(w, h, r);
  return <output data-testid="probe">{id ?? 'none'}</output>;
}

describe('Glass', () => {
  it('renders its children and reports the host tier and material', () => {
    render(
      <GlassFilterHost tier="blur">
        <Glass material="clear" data-testid="g">
          <span>inside</span>
        </Glass>
      </GlassFilterHost>,
    );
    const el = screen.getByTestId('g');
    expect(el).toHaveTextContent('inside');
    expect(el).toHaveAttribute('data-tier', 'blur');
    expect(el).toHaveAttribute('data-material', 'clear');
  });

  it('defaults to the regular material and the solid tier without a host', () => {
    render(<Glass data-testid="g">x</Glass>);
    const el = screen.getByTestId('g');
    expect(el).toHaveAttribute('data-material', 'regular');
    expect(el).toHaveAttribute('data-tier', 'solid');
  });

  it('never asks for a refraction filter on the solid tier', () => {
    render(
      <GlassFilterHost tier="solid">
        <Glass data-testid="g">x</Glass>
      </GlassFilterHost>,
    );
    expect(screen.getByTestId('g').querySelector('[data-refract]')).toBeNull();
    expect(document.querySelector('filter')).toBeNull();
  });

  it('renders the element type it is given', () => {
    render(
      <Glass as="nav" aria-label="Sidebar">
        x
      </Glass>,
    );
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
  });
});

describe('GlassFilterHost', () => {
  it('registers one SVG displacement filter per surface size on the refract tier', () => {
    render(
      <GlassFilterHost tier="refract">
        <Probe w={300} h={64} r={32} />
        <Probe w={300} h={64} r={32} />
        <Probe w={120} h={48} r={24} />
      </GlassFilterHost>,
    );
    const ids = screen.getAllByTestId('probe').map((p) => p.textContent);
    expect(ids[0]).not.toBe('none');
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(document.querySelectorAll('filter')).toHaveLength(2);
    expect(document.getElementById(ids[0]!)?.querySelector('feDisplacementMap')).not.toBeNull();
  });

  it('hands out no filter on the blur tier or for an unmeasured surface', () => {
    render(
      <GlassFilterHost tier="blur">
        <Probe w={300} h={64} r={32} />
      </GlassFilterHost>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('none');

    render(
      <GlassFilterHost tier="refract">
        <Probe w={0} h={0} r={0} />
      </GlassFilterHost>,
    );
    expect(screen.getAllByTestId('probe')[1]).toHaveTextContent('none');
  });
});
