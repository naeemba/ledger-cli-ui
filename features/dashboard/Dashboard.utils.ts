import { parseNetWorthRows, type NetWorthRow } from '@/lib/netWorth/parse';
import { parseAmountParts } from '@/utils/amountParts';
import runLedger from '@/utils/runLedger';

export const firstNonEmptyLine = (stdout: string): string =>
  stdout
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim() ?? '';

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

export type SafeToSpend = {
  /** Rendered by ledger in the base currency, e.g. "$ 1,500.00". */
  amount: string;
  /** ISO date the figure covers up to (exclusive). */
  until: string;
  /** True when `until` is the next forecast income, false when it's the fallback horizon. */
  basedOnIncome: boolean;
};

/**
 * Safe to Spend = liquid assets after every bill due before the next income,
 * computed entirely by ledger: with `--forecast -e <cutoff>` the forecast
 * bill postings debit the asset accounts, so `bal ^Assets` at the cutoff IS
 * the projected spendable balance — no JS subtraction. Investment accounts
 * (PORTFOLIO_ACCOUNT_PREFIX) are excluded as not liquid. Forecast gotcha:
 * "Monthly from <date>" directives fire on the 1st under --forecast (the
 * day-of-month anchor is not honored), so the income cutoff is approximate.
 */
export const getSafeToSpend = async (
  currency: string,
  start: string,
  horizonEnd: string,
  portfolioPrefix: string
): Promise<SafeToSpend> => {
  const incomeStdout = await runLedger(
    [
      'reg',
      '^Income',
      '--forecast',
      `d<[${horizonEnd}]`,
      '-b',
      start,
      '-e',
      horizonEnd,
      '--sort',
      'date',
      '--date-format',
      '%Y-%m-%d',
      '--format',
      '%D\n',
    ],
    { sortByDate: false }
  );
  const nextIncome =
    incomeStdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)[0] ?? null;
  const until = nextIncome ?? horizonEnd;
  const stdout = await runLedger([
    'bal',
    '^Assets',
    'and',
    'not',
    `^${portfolioPrefix}`,
    '--forecast',
    `d<[${until}]`,
    '-e',
    until,
    '-X',
    currency,
    '--collapse',
    '--format',
    '%T\n',
  ]);
  const amount =
    stdout
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  return { amount, until, basedOnIncome: nextIncome !== null };
};

export type UpcomingBill = {
  date: string;
  account: string;
  amount: string;
};

/**
 * Forecasts the next stretch of expenses from the journal's periodic (`~`)
 * directives via `ledger --forecast`. Ledger generates the future postings;
 * JS only parses rows. Ledger only forecasts dates after the journal's last
 * real transaction, so already-posted bills don't reappear.
 */
export const getUpcomingBills = async (
  start: string,
  end: string
): Promise<UpcomingBill[]> => {
  const stdout = await runLedger(
    [
      'reg',
      '^Expenses',
      '--forecast',
      `d<[${end}]`,
      '-b',
      start,
      '-e',
      end,
      '--sort',
      'date',
      '--date-format',
      '%Y-%m-%d',
      '--format',
      '%D|%A|%t\n',
    ],
    { sortByDate: false }
  );
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, account, amount] = line.split('|');
      return { date, account, amount };
    })
    .filter((bill) => bill.date && bill.account && bill.amount);
};

/**
 * Monthly net-worth running total for the sparkline — same query as the
 * /net-worth page: window with `--display`, never `-b`, because `%T` must
 * accumulate from journal start (see LEDGER-AUDIT #13). Months with no net
 * change emit no row; the sparkline just skips them.
 */
export const getNetWorthSeries = async (
  currency: string,
  cutoff: string
): Promise<NetWorthRow[]> => {
  const stdout = await runLedger(
    [
      'reg',
      '^Assets',
      '^Liabilities',
      '--monthly',
      '-X',
      currency,
      '--display',
      `date>=[${cutoff}]`,
      '--format',
      'NNN%D|%T\n',
    ],
    { sortByDate: false }
  );
  return parseNetWorthRows(stdout);
};

/**
 * Net-worth change over a period as ledger renders it: a period-limited
 * `bal ^Assets ^Liabilities` IS the delta — no JS subtraction of two totals.
 */
export const getNetWorthChange = async (
  currency: string,
  start: string,
  end: string
): Promise<string> => {
  const stdout = await runLedger([
    'bal',
    '^Assets',
    '^Liabilities',
    '-p',
    `from ${start} to ${end}`,
    '-X',
    currency,
    '--collapse',
    '--format',
    '%T\n',
  ]);
  return firstNonEmptyLine(stdout);
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
