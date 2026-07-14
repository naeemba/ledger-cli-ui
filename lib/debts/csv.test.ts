import { describe, it, expect } from 'vitest';
import { debtsRowsToCsv } from './csv';
import type { PersonDebt } from '@/features/debts';

const debt = (over: Partial<PersonDebt>): PersonDebt => ({
  person: 'Alex',
  quantity: 30,
  amount: '$ 30.00',
  direction: 'owes-you',
  ...over,
});

describe('debtsRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(debtsRowsToCsv([], 'USD')).toBe('person,direction,net,currency\n');
  });

  it('emits one row per person with a readable direction', () => {
    expect(
      debtsRowsToCsv(
        [
          debt({ person: 'Alex', amount: '30.00', direction: 'owes-you' }),
          debt({
            person: 'Carol',
            quantity: -100,
            amount: '100.00',
            direction: 'you-owe',
          }),
        ],
        'USD'
      )
    ).toBe(
      'person,direction,net,currency\nAlex,owes you,30.00,USD\nCarol,you owe,100.00,USD\n'
    );
  });
});
