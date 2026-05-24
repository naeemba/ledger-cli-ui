import { describe, it, expect } from 'vitest';
import { payeeRowsToCsv } from './csv';

describe('payeeRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(payeeRowsToCsv([], 'USD')).toBe('payee,amount,currency\n');
  });

  it('emits one row per payee, two decimal places', () => {
    expect(
      payeeRowsToCsv(
        [
          { payee: 'Whole Foods', total: 100 },
          { payee: 'Amazon', total: 20.5 },
        ],
        'USD'
      )
    ).toBe('payee,amount,currency\nWhole Foods,100.00,USD\nAmazon,20.50,USD\n');
  });

  it('quotes a payee name containing a comma', () => {
    expect(payeeRowsToCsv([{ payee: 'Smith, John', total: 10 }], 'USD')).toBe(
      'payee,amount,currency\n"Smith, John",10.00,USD\n'
    );
  });
});
