// features/transactions/entry/typeForms/HeaderFields.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { HeaderFieldsEditor } from './HeaderFields';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('HeaderFieldsEditor', () => {
  it('renders the date, payee and note values', () => {
    const out = html(
      <HeaderFieldsEditor
        header={{
          date: '2026-06-29',
          payee: 'Blue Bottle',
          status: 'none',
          note: 'morning',
        }}
        payees={['Blue Bottle']}
        onChange={() => {}}
      />
    );
    expect(out).toContain('2026-06-29');
    expect(out).toContain('Blue Bottle');
    expect(out).toContain('morning');
  });
});
