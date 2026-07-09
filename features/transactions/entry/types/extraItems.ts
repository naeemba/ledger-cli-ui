import type { Posting } from '@/lib/transactions/posting';

export type ExtraItem = { account: string; amount: string; currency: string };

/** Format a computed numeric amount to a compact string (trailing zeros trimmed, no -0, no scientific notation). */
export const formatAmount = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  const trimmed = n.toFixed(10).replace(/\.?0+$/, '');
  return trimmed === '-0' ? '0' : trimmed;
};

/**
 * Net amount per currency across postings, honoring `@@` cost annotations
 * (a cost-bearing posting contributes its signed cost to the cost currency,
 * exactly like {@link computeBalance}). Insertion order = first-seen currency.
 */
export const residualByCurrency = (
  postings: readonly Posting[]
): Map<string, number> => {
  const net = new Map<string, number>();
  for (const posting of postings) {
    if (posting.cost) {
      const amount = Number(posting.amount);
      const cost = Number(posting.cost.amount);
      if (!Number.isFinite(amount) || !Number.isFinite(cost)) continue;
      const sign = amount < 0 ? -1 : 1;
      net.set(
        posting.cost.currency,
        (net.get(posting.cost.currency) ?? 0) + sign * cost
      );
    } else {
      const value = Number(posting.amount);
      if (!Number.isFinite(value)) continue;
      net.set(posting.currency, (net.get(posting.currency) ?? 0) + value);
    }
  }
  return net;
};

/** Postings for `account` that zero the residual of `others`, one per nonzero currency. */
export const balancingPostings = (
  account: string,
  others: readonly Posting[]
): Posting[] => {
  const net = residualByCurrency(others);
  const out: Posting[] = [];
  for (const [currency, total] of net) {
    if (Math.abs(total) <= 1e-9) continue;
    out.push({ account, amount: formatAmount(-total), currency });
  }
  return out;
};

/**
 * Map extra-item rows to postings, dropping rows that lack an account or an
 * amount. A row with only one field filled is a partially-entered fee line, not
 * a posting: emitting it (e.g. a blank amount) would silently fold into
 * auto-balance rather than the intended fee, so both fields are required.
 */
export const extraItemPostings = (items: readonly ExtraItem[]): Posting[] =>
  items
    .filter((item) => item.account.trim() !== '' && item.amount.trim() !== '')
    .map((item) => ({
      account: item.account,
      amount: item.amount,
      currency: item.currency,
    }));

/** Project postings back to plain extra-item rows. */
export const toExtraItems = (postings: readonly Posting[]): ExtraItem[] =>
  postings.map((posting) => ({
    account: posting.account,
    amount: posting.amount,
    currency: posting.currency,
  }));

/** The one account shared by every posting, or null if none / more than one. */
export const singleAccount = (postings: readonly Posting[]): string | null => {
  const accounts = new Set(postings.map((posting) => posting.account));
  if (accounts.size !== 1) return null;
  return [...accounts][0] ?? null;
};
