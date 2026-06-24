import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('renders the tagline and all three feature ticks', () => {
    const out = renderToStaticMarkup(<BrandPanel />);
    expect(out).toContain('Track every cent. Plain text. Yours.');
    expect(out).toContain('Double-entry');
    expect(out).toContain('CLI-powered');
    expect(out).toContain('Self-hosted');
  });
});
