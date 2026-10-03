import { describe, expect, it } from 'vitest';
import { shouldAskBeforeClosing } from './shouldAskBeforeClosing';

describe('shouldAskBeforeClosing', () => {
  it('asks when something is typed and Escape is pressed', () => {
    expect(shouldAskBeforeClosing(true, 'escape-key')).toBe(true);
  });

  it('asks when something is typed and the user clicks outside', () => {
    expect(shouldAskBeforeClosing(true, 'outside-press')).toBe(true);
  });

  it('closes at once on the X / Close button even with something typed', () => {
    expect(shouldAskBeforeClosing(true, 'close-press')).toBe(false);
  });

  it('closes at once on Escape when nothing is typed', () => {
    expect(shouldAskBeforeClosing(false, 'escape-key')).toBe(false);
  });
});
