import { describe, it, expect } from 'vitest';
import { buildDueList } from './dueList';
import { parseRecurringFile } from '@/lib/journal/recurring';

const rules = parseRecurringFile(
  'main.ledger',
  [
    '~ every 1 months from 2026/01/05',
    '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
    '    ; :handled: 2026-05-05',
    '    ; Netflix',
    '    Expenses:Netflix                            USD 15',
    '    Assets:Checking                             USD -15',
    '',
    '~ Monthly',
    '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DKZ',
    '    Expenses:Rent                               USD 900',
    '    Assets:Checking                             USD -900',
    '',
  ].join('\n')
);

describe('buildDueList', () => {
  it('splits due (with backlog) from upcoming and flags unsupported', () => {
    const list = buildDueList(rules, '2026-07-16', '2026-08-15');
    expect(list.due.map((o) => o.date)).toEqual(['2026-06-05', '2026-07-05']);
    expect(list.due[0].overdue).toBe(true);
    expect(list.due[0].label).toBe('Netflix');
    expect(list.upcoming.map((o) => o.date)).toEqual(['2026-08-05']);
    expect(list.unsupported).toEqual([
      { ruleUid: '01HZX5G5KJDS9HQRYK8E5T0DKZ', period: 'Monthly' },
    ]);
  });

  it('rule without :handled: contributes no backlog', () => {
    const fresh = parseRecurringFile(
      'main.ledger',
      [
        '~ every 1 months from 2026/01/16',
        '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DAA',
        '    Expenses:Gym                             USD 20',
        '    Assets:Checking                          USD -20',
        '',
      ].join('\n')
    );
    const list = buildDueList(fresh, '2026-07-16', '2026-08-15');
    expect(list.due.map((o) => o.date)).toEqual(['2026-07-16']); // today only
  });
});
