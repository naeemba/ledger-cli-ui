import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import FriendlyBalance from './FriendlyBalance';

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

describe('FriendlyBalance', () => {
  it('renders an em-dash for a blank balance', () => {
    expect(html(<FriendlyBalance amount="" role="asset" />)).toContain('—');
  });
  it('shows an up arrow and positive color for an asset with money', () => {
    const out = html(<FriendlyBalance amount="$ 2,340.00" role="asset" />);
    expect(out).toContain('↑');
    expect(out).toContain('2,340.00');
    expect(out).toContain('text-positive');
    expect(out).not.toContain('text-negative');
  });
  it('shows a down arrow and negative color for a liability you owe, no chip', () => {
    const out = html(<FriendlyBalance amount="$ -500.00" role="liability" />);
    expect(out).toContain('↓');
    expect(out).toContain('500.00');
    expect(out).toContain('text-negative');
    expect(out).not.toContain('owed to you');
  });
  it('shows the owed-to-you chip for a reversed liability', () => {
    const out = html(<FriendlyBalance amount="$ 200.00" role="liability" />);
    expect(out).toContain('↑');
    expect(out).toContain('text-positive');
    expect(out).toContain('owed to you');
  });
});
