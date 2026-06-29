// features/transactions/entry/types/registry.ts
import type { DraftState } from '../draftReducer';
import type { TransactionTypeAdapter } from './adapter';
import { exchangeAdapter } from './exchange';
import { expenseAdapter } from './expense';
import { fixBalanceAdapter } from './fixBalance';
import { incomeAdapter } from './income';
import { transferAdapter } from './transfer';

export const TYPE_ADAPTERS: readonly TransactionTypeAdapter<unknown>[] = [
  expenseAdapter,
  incomeAdapter,
  transferAdapter,
  exchangeAdapter,
  fixBalanceAdapter,
] as TransactionTypeAdapter<unknown>[];

export const detectType = (
  draft: DraftState
): { id: string; fields: unknown } | null => {
  for (const adapter of TYPE_ADAPTERS) {
    const fields = adapter.detect(draft);
    if (fields) return { id: adapter.id, fields };
  }
  return null;
};
