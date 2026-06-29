import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TransactionEntry from './TransactionEntry';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const noopAction = async () => ({ ok: true }) as never;

describe('TransactionEntry', () => {
  const common = {
    accounts: ['Assets:Checking'],
    payees: ['Whole Foods'],
    defaultCurrency: 'USD',
    submitAction: noopAction,
    getAccountBalance: async () => '0',
  };

  it('renders the Form tab', () => {
    const out = html(<TransactionEntry {...common} />);
    expect(out).toContain('Form');
    // TabBar renders a tab button
    expect(out).toContain('role="tab"');
  });

  it('registers a Raw tab', () => {
    const out = html(
      <TransactionEntry
        {...common}
        initialDraft={{
          date: '2026-06-29',
          payee: 'Acme',
          status: 'none',
          postings: [
            { account: 'Income:Salary', amount: '-100', currency: 'USD' },
            { account: 'Assets:Checking', amount: '100', currency: 'USD' },
          ],
        }}
      />
    );
    expect(out).toContain('Raw');
  });

  it('renders posting accounts from initialDraft', () => {
    const out = html(
      <TransactionEntry
        {...common}
        initialDraft={{
          payee: 'Whole Foods',
          status: 'none',
          postings: [
            { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
            { account: 'Assets:Checking', amount: '', currency: 'USD' },
          ],
        }}
      />
    );
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
  });

  it('hidden draft input contains serialized JSON', () => {
    const out = html(
      <TransactionEntry
        {...common}
        initialDraft={{
          payee: 'Whole Foods',
          status: 'none',
          postings: [
            { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
            { account: 'Assets:Checking', amount: '', currency: 'USD' },
          ],
        }}
      />
    );
    // The hidden input with name="draft" must exist and contain JSON
    expect(out).toContain('name="draft"');
    // JSON is HTML-attribute-escaped; check the escaped form of "payee":"Whole Foods"
    expect(out).toContain('&quot;payee&quot;:&quot;Whole Foods&quot;');
  });

  it('renders Add transaction button for create mode', () => {
    const out = html(<TransactionEntry {...common} />);
    expect(out).toContain('Add transaction');
  });

  it('renders Save changes button for edit mode', () => {
    const out = html(
      <TransactionEntry
        {...common}
        mode="edit"
        uid="abc123"
        initialDraft={{
          payee: 'Test',
          status: 'none',
          postings: [
            { account: 'Expenses:Food', amount: '10', currency: 'USD' },
            { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
          ],
        }}
      />
    );
    expect(out).toContain('Save changes');
  });

  it('shows Types as the first tab and defaults to it in create mode', () => {
    const out = html(
      <TransactionEntry
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
        submitAction={async () => ({ ok: false })}
        getAccountBalance={async () => '0'}
      />
    );
    expect(out).toContain('Types');
    // Types is default → its "Pick a type" prompt is present on first render.
    expect(out).toContain('Pick a type');
  });

  it('defaults to the Form tab in edit mode when the draft matches no type', () => {
    const out = html(
      <TransactionEntry
        {...common}
        mode="edit"
        uid="abc123"
        initialDraft={{
          payee: 'Split',
          status: 'none',
          note: '',
          postings: [
            { account: 'Expenses:Food', amount: '5', currency: 'USD' },
            { account: 'Expenses:Fun', amount: '5', currency: 'USD' },
            { account: 'Assets:Checking', amount: '-10', currency: 'USD' },
          ],
        }}
      />
    );
    // Form tab is active → its Postings UI renders, NOT the Types "Pick a type" prompt.
    expect(out).not.toContain('Pick a type');
    expect(out).toContain('+ Add posting');
  });

  it('renders tabs in a custom order with the first tab active', () => {
    const out = html(
      <TransactionEntry {...common} tabOrder={['raw', 'form', 'types']} />
    );
    // The first ordered tab (Raw) is the selected one.
    const rawIdx = out.indexOf('Raw');
    const formIdx = out.indexOf('Form');
    const typesIdx = out.indexOf('Types');
    expect(rawIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(formIdx);
    expect(formIdx).toBeLessThan(typesIdx);
    // Raw is the active tab → its LedgerEditor surface renders.
    expect(out).toContain('aria-label="Transaction ledger text"');
  });

  it('defaults to the first tab order entry when tabOrder is omitted', () => {
    const out = html(<TransactionEntry {...common} />);
    const typesIdx = out.indexOf('Types');
    const formIdx = out.indexOf('Form');
    const rawIdx = out.indexOf('Raw');
    expect(typesIdx).toBeLessThan(formIdx);
    expect(formIdx).toBeLessThan(rawIdx);
  });
});
