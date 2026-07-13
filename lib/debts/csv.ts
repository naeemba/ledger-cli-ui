import type { PersonDebt } from '@/features/debts';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['person', 'direction', 'net', 'currency'] as const;

export const debtsRowsToCsv = (
  debts: PersonDebt[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const debt of debts) {
    const direction = debt.direction === 'owes-you' ? 'owes you' : 'you owe';
    lines.push(formatRow([debt.person, direction, debt.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
