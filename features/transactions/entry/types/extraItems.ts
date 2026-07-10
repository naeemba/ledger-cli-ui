import type { Posting } from '@/lib/transactions/posting';

export type ExtraItem = { account: string; amount: string; currency: string };

/**
 * Net amount per currency across postings, honoring `@@` cost annotations
 * (a cost-bearing posting contributes its signed cost to the cost currency,
 * exactly like {@link computeBalance}). Insertion order = first-seen currency.
 * Used only to decide *whether* a balancing line is needed — never to write an
 * amount into the journal.
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

/**
 * A single amount-less posting on `account` when `others` leave a residual;
 * ledger fills the exact balancing amount (multi-currency and cost aware) when
 * it parses the saved transaction. Empty when `others` already balance.
 *
 * We deliberately do NOT compute the amount in JS: a float-derived figure can
 * diverge from ledger's exact residual and get the transaction rejected on
 * save. The residual sum here is only a predicate — is a balancing line needed?
 */
export const balancingPostings = (
  account: string,
  others: readonly Posting[]
): Posting[] => {
  const hasResidual = [...residualByCurrency(others).values()].some(
    (total) => Math.abs(total) > 1e-9
  );
  return hasResidual ? [{ account, amount: '', currency: '' }] : [];
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
