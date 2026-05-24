import { describe, it, expect } from 'vitest';
import { cashFlowRowsToCsv } from './csv';

describe('cashFlowRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(cashFlowRowsToCsv([], 'USD')).toBe(
      'month,income,expenses,net,currency\n'
    );
  });

  it('emits one row per month in input order with net = income - expenses', () => {
    expect(
      cashFlowRowsToCsv(
        [
          {
            date: new Date('2026-01-01T00:00:00Z'),
            income: 4500,
            expenses: 3200,
          },
          {
            date: new Date('2026-02-01T00:00:00Z'),
            income: 4500,
            expenses: 2800,
          },
        ],
        'USD'
      )
    ).toBe(
      'month,income,expenses,net,currency\n2026-01,4500.00,3200.00,1300.00,USD\n2026-02,4500.00,2800.00,1700.00,USD\n'
    );
  });
});
