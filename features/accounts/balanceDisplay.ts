import type { AccountRole } from '@/features/transactions/entry/types/accountRole';

export type BalanceDirection = 'favor' | 'against';
export type BalanceDisplay = { direction: BalanceDirection; chip?: string };

/**
 * Turn an account's role and its signed base-currency balance into a
 * user-facing direction (favor/against) plus an optional exception chip that
 * appears only when the balance sits opposite its role's normal side.
 *
 * Normal sides: assets/expenses are debit-normal (positive is expected);
 * liabilities/income are credit-normal (ledger reports them negative).
 */
export function balanceDisplay(
  role: AccountRole,
  signed: number
): BalanceDisplay {
  if (signed === 0) return { direction: 'favor' };
  switch (role) {
    case 'asset':
      return signed > 0
        ? { direction: 'favor' }
        : { direction: 'against', chip: 'overdrawn' };
    case 'liability':
      return signed < 0
        ? { direction: 'against' }
        : { direction: 'favor', chip: 'owed to you' };
    case 'income':
      return signed < 0
        ? { direction: 'favor' }
        : { direction: 'against', chip: 'reduced' };
    case 'expense':
      return signed > 0
        ? { direction: 'against' }
        : { direction: 'favor', chip: 'refunded' };
    case 'equity':
    case 'unknown':
    default:
      return signed >= 0 ? { direction: 'favor' } : { direction: 'against' };
  }
}
