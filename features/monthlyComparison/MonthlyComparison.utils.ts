import { parseMonthlyTotals, type CashFlowRow } from '@/lib/monthly/parse';
import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;
const PERIOD = `last ${MONTHS_BACK} months`;

const fetchMonthly = async (
  query: string,
  currency: string,
  invert: boolean
): Promise<Map<string, number>> => {
  // `-p 'last N months'` lets ledger apply the calendar window instead of
  // fetching all history and slicing in JS. `--invert` (income only) flips
  // ledger's credit sign so income arrives positive — no JS negation. The
  // `%A` account column lets parseMonthlyTotals drop `-X` revaluation
  // pseudo-postings and accumulate months that span several accounts.
  const args = ['reg', query, '--monthly', '-X', currency];
  if (invert) args.push('--invert');
  args.push('-p', PERIOD, '--format', 'NNN%D|%A|%t\n');
  const stdout = await runLedger(args, { sortByDate: false });
  return parseMonthlyTotals(stdout);
};

export type { CashFlowRow };

export const getCashFlow = async (currency: string): Promise<CashFlowRow[]> => {
  const [expensesMap, incomeMap] = await Promise.all([
    fetchMonthly('^Expenses', currency, false),
    fetchMonthly('^Income', currency, true),
  ]);
  const allDates = new Set([...expensesMap.keys(), ...incomeMap.keys()]);
  return Array.from(allDates)
    .map((date) => {
      const expenses = expensesMap.get(date) ?? 0;
      const income = incomeMap.get(date) ?? 0;
      return { date: new Date(date), expenses, income, net: income - expenses };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};
