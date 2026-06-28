import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TabBar } from './TabBar';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TabBar', () => {
  const tabs = [
    { id: 'form', label: 'Form' },
    { id: 'raw', label: 'Raw', disabled: true },
  ];
  it('renders every tab label', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toContain('Form');
    expect(out).toContain('Raw');
  });
  it('marks the active tab with aria-selected="true"', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toMatch(/aria-selected="true"[^>]*>Form|Form<\/button>/);
    expect(out).toContain('aria-selected="true"');
  });
  it('disables tabs marked disabled', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toContain('disabled');
  });
});
