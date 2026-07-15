import { describe, expect, it } from 'vitest';
import { pickEditSurface } from './editSurface';
import { initDraft } from './entry/draftReducer';
import { parseBlock } from '@/lib/journal/parser';
import type { Posting } from '@/lib/transactions/model';

const draftOf = (postings: Posting[]) =>
  initDraft(
    { date: '2026-07-14', payee: 'Test', status: 'none', note: '', postings },
    'USD'
  );

describe('pickEditSurface', () => {
  it('routes a plain 2-posting expense to the expense form', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('expense');
  });

  it('routes a split expense with an EXPLICIT paying amount to raw', () => {
    // Split compile leaves the paying line amount-less, so it cannot reproduce
    // this explicit `-12` — round-trip fails and it falls back to raw rather
    // than silently rewriting that posting.
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Expenses:Tax', amount: '2', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
  });

  it('routes a split expense with an amount-less paying line to the expense form', () => {
    // Exactly what the entry form writes for a split: two expense postings and
    // an amount-less paying line for ledger to balance. This round-trips, so it
    // belongs in the expense form (with its ExtraItemsField), not raw.
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Cigarette', amount: '300', currency: 'KIRT' },
        { account: 'Expenses:Wage', amount: '0.9', currency: 'KIRT' },
        { account: 'Assets:Bank:Blubank', amount: '', currency: '' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('expense');
  });

  it('routes a split whose amount-less paying line carries the default currency to the expense form', () => {
    // loadTransactionForEdit runs withDefaultCurrency over the parsed draft,
    // stamping the default currency onto the amount-less paying line. Compile
    // emits that line with currency '' — the mismatch must not force raw.
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Cigarette', amount: '300', currency: 'KIRT' },
        { account: 'Expenses:Wage', amount: '0.9', currency: 'KIRT' },
        { account: 'Assets:Bank:Blubank', amount: '', currency: 'KIRT' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('expense');
  });

  it('routes a clean 2-posting exchange to the exchange form', () => {
    const surface = pickEditSurface(
      draftOf([
        {
          account: 'Assets:Broker',
          amount: '1',
          currency: 'AAPL',
          cost: { amount: '100', currency: 'USD' },
        },
        { account: 'Assets:Cash', amount: '-100', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('exchange');
  });

  it('routes an undetectable multi-posting shape to raw', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Assets:A', amount: '50', currency: 'USD' },
        { account: 'Assets:B', amount: '50', currency: 'USD' },
        { account: 'Assets:C', amount: '-100', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
  });

  it('routes a plain income pair to the income form', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
        { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('income');
  });

  it('routes a plain transfer pair to the transfer form', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Assets:Savings', amount: '100', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('transfer');
  });

  it('routes an asserted balance-fix pair to the fix-balance form', () => {
    const surface = pickEditSurface(
      draftOf([
        {
          account: 'Assets:Checking',
          amount: '',
          currency: '',
          assertion: { amount: '500', currency: 'USD' },
        },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('fix-balance');
  });

  // A real fix-balance transaction round-trips through the journal, not a
  // hand-built draft. The synthetic test above hard-codes `amount: ''`, which is
  // exactly the condition fixBalanceAdapter.detect keys on — so it only proves
  // detect given that shape, not that the writer/parser actually produce it.
  // Parse a real block to confirm the assertion line survives as `amount: ''`
  // (parser.ts) and still detects, rather than quietly routing to Raw.
  it('routes a parsed fix-balance block to the fix-balance form', () => {
    const block = parseBlock(
      [
        '2026-07-14 Balance adjustment',
        '    Assets:Checking    = 500 USD',
        '    Equity:Adjustments',
      ].join('\n')
    );
    if (!block) throw new Error('expected the fix-balance block to parse');
    // Route the parser's own postings (assertion line kept as `amount: ''`,
    // adjustment line bare) — not a hand-built draft — through the surface picker.
    const surface = pickEditSurface(draftOf(block.postings));
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('fix-balance');
  });

  // Accepted simplification: a receivable/payable debt pair opens the Transfer
  // form. Assert the routing so a change to transferAdapter.detect can't silently
  // send it to Raw (or worse, another type) and corrupt the debt on save. The
  // detect→compile round trip for this pair is asserted in roundTrip.test.ts.
  it('routes a receivable/payable debt pair to the transfer form', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Assets:Receivable:Bob', amount: '50', currency: 'USD' },
        { account: 'Liabilities:Payable:Bob', amount: '-50', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('transfer');
  });

  // A refund (money back into an asset, an expense credited down, no income
  // posting) is detected by neither expense (its base amount is negative) nor
  // income (needs exactly one income posting), so it falls to Raw. Guard the
  // sign: a regression in classifyAccount flipping it to expense would invert it.
  it('routes a refund (asset + negative expense) to raw', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Assets:Checking', amount: '10', currency: 'USD' },
        { account: 'Expenses:Food', amount: '-10', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
  });
});
