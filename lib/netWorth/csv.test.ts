import { describe, it, expect } from 'vitest';
import { netWorthRowsToCsv } from './csv';

describe('netWorthRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(netWorthRowsToCsv([], 'USD')).toBe('month,net_worth,currency\n');
  });

  it('emits one row per month using YYYY-MM keys', () => {
    expect(
      netWorthRowsToCsv(
        [
          { date: '2024-01-31', value: 12000 },
          { date: '2024-02-29', value: 12500 },
        ],
        'USD'
      )
    ).toBe(
      'month,net_worth,currency\n2024-01,12000.00,USD\n2024-02,12500.00,USD\n'
    );
  });
});
