import { describe, it, expect } from 'vitest';
import { reconcileRowsToCsv } from './csv';

describe('reconcileRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(reconcileRowsToCsv([], 'USD')).toBe(
      'date,payee,account,amount,currency\n'
    );
  });

  it('emits one row per posting', () => {
    expect(
      reconcileRowsToCsv(
        [
          {
            date: '2024-03-15',
            payee: 'Amazon',
            account: 'Expenses:Online',
            amount: 'USD 49.99',
            days: 100,
          },
        ],
        'USD'
      )
    ).toBe(
      'date,payee,account,amount,currency\n2024-03-15,Amazon,Expenses:Online,USD 49.99,USD\n'
    );
  });

  it('quotes payees containing commas', () => {
    expect(
      reconcileRowsToCsv(
        [
          {
            date: '2024-03-15',
            payee: 'Smith, John',
            account: 'Expenses:Online',
            amount: 'USD 49.99',
            days: 100,
          },
        ],
        'USD'
      )
    ).toBe(
      'date,payee,account,amount,currency\n2024-03-15,"Smith, John",Expenses:Online,USD 49.99,USD\n'
    );
  });
});
