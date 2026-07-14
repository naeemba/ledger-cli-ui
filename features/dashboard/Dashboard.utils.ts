import { uidFromNote } from '@/lib/journal/uid';
import { parseAmountParts } from '@/utils/amountParts';
import runLedger from '@/utils/runLedger';

export const getHighestExpense = (stdout: string): string => {
  let highestExpense = { amount: 0, str: '' };
  stdout.split('\n').forEach((expense) => {
    if (!expense) return;
    const amountField = expense.split('|')[1];
    if (!amountField) return;
    const amount = parseAmountParts(amountField).signed;
    if (Number.isFinite(amount) && amount > highestExpense.amount) {
      highestExpense = { amount, str: expense };
    }
  });
  return highestExpense.str;
};

export type RecentPosting = {
  date: string;
  payee: string;
  account: string;
  amount: string;
  uid?: string;
};

/**
 * Parses the `NNN%D|%P|%A|%t|%(note)\n` output of `ledger reg --head N` into
 * typed rows, dropping malformed lines. The note is the rejoined remainder
 * after the fixed fields, so a `|` inside a note can't drop the uid.
 */
export const parseRecentPostings = (stdout: string): RecentPosting[] =>
  stdout
    .split('NNN')
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 4 && cols[0].trim())
    .map((cols) => ({
      date: cols[0].trim(),
      payee: cols[1].trim(),
      account: cols[2].trim(),
      amount: cols[3].trim(),
      uid: uidFromNote(cols.slice(4).join('|')) ?? undefined,
    }));

export const getRecentTransactions = async (
  limit: number
): Promise<RecentPosting[]> => {
  const stdout = await runLedger([
    'reg',
    '--head',
    String(limit),
    '--format',
    'NNN%D|%P|%A|%t|%(note)\n',
  ]);
  return parseRecentPostings(stdout);
};

export type JournalStats = {
  timePeriod: string;
  uniquePayees: string;
  uniqueAccounts: string;
  postings: string;
  uncleared: string;
  daysSinceLast: string;
  last7: string;
  last30: string;
  thisMonth: string;
};

const pick = (out: string, re: RegExp): string =>
  out.match(re)?.[1]?.trim() ?? '';

export const getJournalStats = async (): Promise<JournalStats> => {
  const stdout = await runLedger(['stats']);
  return {
    timePeriod: pick(stdout, /Time period:\s*(.+?)(?:\n|$)/),
    uniquePayees: pick(stdout, /Unique payees:\s*(\d+)/),
    uniqueAccounts: pick(stdout, /Unique accounts:\s*(\d+)/),
    postings: pick(stdout, /Number of postings:\s*(\d+)/),
    uncleared: pick(stdout, /Uncleared postings:\s*(\d+)/),
    daysSinceLast: pick(stdout, /Days since last post:\s*(\d+)/),
    last7: pick(stdout, /Posts in last 7 days:\s*(\d+)/),
    last30: pick(stdout, /Posts in last 30 days:\s*(\d+)/),
    thisMonth: pick(stdout, /Posts seen this month:\s*(\d+)/),
  };
};
