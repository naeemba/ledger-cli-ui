import { describe, expect, it } from 'vitest';
import { pickEditSurface } from './editSurface';
import { initDraft } from './entry/draftReducer';
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

  it('routes a split expense to raw (simple form would hide the split)', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Expenses:Tax', amount: '2', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
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
});
