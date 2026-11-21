import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Slider } from './Slider';

function setup(props: Partial<Parameters<typeof Slider>[0]> = {}) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  render(<Slider value={30} max={100} label="Position" step={5} onChange={onChange} onCommit={onCommit} {...props} />);
  const slider = screen.getByRole('slider', { name: 'Position' });
  // jsdom has no layout: give the track a 200px-wide box starting at x=0.
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 20,
    right: 200,
    bottom: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { slider, onChange, onCommit };
}

describe('Slider', () => {
  it('exposes its value to assistive technology', () => {
    const { slider } = setup({ formatValue: (v) => `${v} seconds` });
    expect(slider).toHaveAttribute('aria-valuenow', '30');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-valuetext', '30 seconds');
  });

  it('moves by one step with the arrow keys and reports change then commit', () => {
    const { slider, onChange, onCommit } = setup();
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(35);
    expect(onCommit).toHaveBeenLastCalledWith(35);
    // The next key press starts from what the slider now shows, not from a
    // prop the owner has not updated yet.
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenLastCalledWith(30);
  });

  it('jumps to the ends with Home and End, and never leaves the range', () => {
    const { slider, onCommit } = setup({ value: 98 });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onCommit).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onCommit).toHaveBeenLastCalledWith(100);
  });

  it('reports every change while dragging and commits once on release', () => {
    const { slider, onChange, onCommit } = setup();
    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(20);
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.pointerMove(slider, { clientX: 500, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(100);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider, { clientX: 500, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('ignores pointer movement when no drag is in progress', () => {
    const { slider, onChange } = setup();
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is disabled when there is nothing to scrub', () => {
    const { slider, onChange, onCommit } = setup({ max: 0, value: 0 });
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.pointerDown(slider, { clientX: 40, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
