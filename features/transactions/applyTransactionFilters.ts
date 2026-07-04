import type { ParsedTransaction } from '@/lib/journal/parser';

export type TransactionFilters = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

/**
 * Filter the user's transactions down to a search-params subset. Shared by
 * the `/transactions` page render and the `/api/transactions/export` route
 * so both apply identical semantics to the same query string.
 */
export const applyTransactionFilters = (
  txs: ParsedTransaction[],
  params: TransactionFilters
): ParsedTransaction[] => {
  const start = params.start ? Date.parse(params.start) : null;
  const end = params.end ? Date.parse(params.end) : null;
  const account = params.account?.toLowerCase().trim();
  const payee = params.payee?.toLowerCase().trim();
  const q = params.q?.toLowerCase().trim();

  return txs.filter((t) => {
    const ts = Date.parse(t.date);
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    if (payee && t.payee.toLowerCase() !== payee) return false;
    if (
      account &&
      !t.postings.some((p) => p.account.toLowerCase().includes(account))
    ) {
      return false;
    }
    if (q) {
      const hay = [t.payee, t.note ?? '', ...t.postings.map((p) => p.account)]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};
