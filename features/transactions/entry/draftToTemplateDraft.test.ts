import { describe, expect, it } from 'vitest';
import type { DraftState } from './draftReducer';
import { draftToTemplateDraft } from './draftToTemplateDraft';

const baseDraft = (postings: DraftState['postings']): DraftState => ({
  date: '2024-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: '',
  postings,
});

describe('draftToTemplateDraft', () => {
  it('trims payee, status, note and postings', () => {
    const draft = baseDraft([
      { account: '  Expenses:Food  ', amount: ' 10.00 ', currency: ' USD ' },
      { account: 'Assets:Cash', amount: '-10.00', currency: 'USD' },
    ]);
    draft.note = '  a note  ';

    const result = draftToTemplateDraft(draft);

    expect(result.payee).toBe('Coffee Shop');
    expect(result.status).toBe('cleared');
    expect(result.note).toBe('a note');
    expect(result.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '10.00',
      currency: 'USD',
    });
  });

  it('carries @@ cost annotations through to the template draft', () => {
    const draft = baseDraft([
      {
        account: 'Assets:USD',
        amount: '100',
        currency: 'USD',
        cost: { currency: 'EUR', amount: '90' },
      },
      { account: 'Assets:EUR', amount: '-90', currency: 'EUR' },
    ]);

    const result = draftToTemplateDraft(draft);

    expect(result.postings[0].cost).toEqual({
      currency: 'EUR',
      amount: '90',
    });
  });

  it('carries = balance-assertion annotations through to the template draft', () => {
    const draft = baseDraft([
      {
        account: 'Assets:Cash',
        amount: '10.00',
        currency: 'USD',
        assertion: { currency: 'USD', amount: '500.00' },
      },
      { account: 'Income:Gift', amount: '-10.00', currency: 'USD' },
    ]);

    const result = draftToTemplateDraft(draft);

    expect(result.postings[0].assertion).toEqual({
      currency: 'USD',
      amount: '500.00',
    });
  });
});
