import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import EntryTabOrderForm from './EntryTabOrderForm';

vi.mock('@/features/settings/actions', () => ({
  setEntryTabOrderAction: vi.fn(),
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('EntryTabOrderForm', () => {
  it('renders the three tab labels in the given order', () => {
    const out = html(<EntryTabOrderForm initial={['raw', 'types', 'form']} />);
    const rawIdx = out.indexOf('Raw');
    const typesIdx = out.indexOf('Types');
    const formIdx = out.indexOf('Form');
    expect(rawIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(typesIdx);
    expect(typesIdx).toBeLessThan(formIdx);
  });

  it('marks the first tab as the default and exposes move controls', () => {
    const out = html(<EntryTabOrderForm initial={['types', 'form', 'raw']} />);
    expect(out).toContain('Default');
    expect(out).toContain('Move Types up');
    expect(out).toContain('Move Raw down');
  });
});
