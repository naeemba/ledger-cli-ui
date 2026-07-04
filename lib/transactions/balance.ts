import type { Posting } from '@/lib/transactions/posting';

export type Balance =
  | { kind: 'balanced' }
  | { kind: 'auto-balance' }
  | { kind: 'invalid' }
  | { kind: 'too-many-blanks' }
  | { kind: 'unbalanced'; issues: [string, number][] };

/**
 * Classify whether a set of postings balances to zero per currency. Shared by
 * {@link Transaction.balance}; kept as a standalone function so the algorithm
 * can be unit-tested directly against posting fixtures.
 */
export const computeBalance = (postings: readonly Posting[]): Balance => {
  // Assertion-only postings check a balance; they don't participate in balancing.
  const active = postings.filter(
    (p) => !(p.assertion && p.amount.trim() === '')
  );
  const blanks = active.filter((p) => p.amount.trim() === '').length;
  if (blanks > 1) return { kind: 'too-many-blanks' };
  if (blanks === 1) return { kind: 'auto-balance' };
  const byCurrency = new Map<string, number>();
  for (const p of active) {
    if (p.cost) {
      const cost = Number(p.cost.amount);
      const amount = Number(p.amount);
      if (!Number.isFinite(cost) || !Number.isFinite(amount)) {
        return { kind: 'invalid' };
      }
      const sign = amount < 0 ? -1 : 1;
      byCurrency.set(
        p.cost.currency,
        (byCurrency.get(p.cost.currency) ?? 0) + sign * cost
      );
    } else {
      const value = Number(p.amount);
      if (!Number.isFinite(value)) return { kind: 'invalid' };
      byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
    }
  }
  const issues = [...byCurrency.entries()].filter(
    ([, total]) => Math.abs(total) > 1e-9
  );
  if (issues.length === 0) return { kind: 'balanced' };
  return { kind: 'unbalanced', issues };
};
