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
    expect(out).toContain('aria-selected="true"');
  });
  it('disables tabs marked disabled', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toContain('disabled');
  });
  it('marks inactive tabs aria-selected="false" and uses tablist/tab roles', () => {
    const out = html(
      <TabBar
        tabs={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        active="a"
        onSelect={() => {}}
      />
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('role="tab"');
    expect(out).toContain('aria-selected="false"');
  });
});
