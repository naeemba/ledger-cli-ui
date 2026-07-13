import type { BalanceRow } from '@/lib/balance/parse';

export const RECEIVABLE_ROOT = 'Assets:Receivable';
export const PAYABLE_ROOT = 'Liabilities:Payable';

export type PersonDebt = {
  person: string;
  // Signed net from ledger. Only its SIGN is read (for direction) — never summed
  // or otherwise recomputed in JS.
  quantity: number;
  // Ledger-rendered net magnitude, e.g. "$ 30.00" (already base-converted).
  amount: string;
  direction: 'owes-you' | 'you-owe';
};

// Capture only the first account segment after the root, so nested sub-accounts
// (e.g. Assets:Receivable:Bob:Car and :Bob:Rent) collapse into one person "Bob".
// A prefix register arg then nets all of that person's sub-accounts together.
const PERSON_ACCOUNT = /^(?:Assets:Receivable|Liabilities:Payable):([^:]+)/;

/** Distinct person names holding any receivable/payable account. */
export const peopleFromBalance = (rows: BalanceRow[]): string[] => {
  const people = new Set<string>();
  for (const row of rows) {
    const match = row.account.match(PERSON_ACCOUNT);
    if (match) people.add(match[1].trim());
  }
  return [...people];
};

/**
 * Read the final running-total line of a person's collapsed register net,
 * formatted `<quantity>|<commodity>|<absolute-rendered>`. Returns null for a
 * settled (zero) or empty balance. The quantity's sign — not any JS arithmetic —
 * decides direction; the net figure itself comes straight from ledger.
 */
export const parseNet = (person: string, stdout: string): PersonDebt | null => {
  const last = stdout.trim().split('\n').filter(Boolean).pop();
  if (!last) return null;
  const [quantityRaw, , rendered] = last.split('|');
  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity === 0) return null;
  return {
    person,
    quantity,
    amount: (rendered ?? '').trim(),
    direction: quantity > 0 ? 'owes-you' : 'you-owe',
  };
};
