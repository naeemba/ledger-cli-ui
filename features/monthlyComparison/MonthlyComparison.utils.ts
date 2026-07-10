import parseAmountColumn from '@/utils/parseAmountColumn';
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
  // ledger's credit sign so income arrives positive — no JS negation.
  const args = ['reg', query, '--monthly', '-X', currency];
  if (invert) args.push('--invert');
  args.push('-p', PERIOD, '--format', 'NNN%D|%t\n');
  const stdout = await runLedger(args, { sortByDate: false });
  const map = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [date, amount] = line.split('|').map((s) => s.trim());
    if (date && amount) map.set(date, parseAmountColumn(amount));
  }
  return map;
};

export type CashFlowRow = {
  date: Date;
  income: number;
  expenses: number;
  /** income − expenses, computed once here so every consumer agrees. */
  net: number;
};

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
