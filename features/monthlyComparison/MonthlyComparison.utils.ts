import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;

// Pull the signed magnitude out of a rendered ledger amount regardless of
// commodity position (`$ 4,500.00`, `4500.00 USD`, `-30`). The old
// split-on-whitespace guess silently returned 0 for the suffix-commodity
// shape, dropping a month's figure without a trace.
const parseAmount = (raw: string): number => {
  const match = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replaceAll(',', '')) || 0 : 0;
};

const fetchMonthly = async (
  query: string,
  currency: string
): Promise<Map<string, number>> => {
  const stdout = await runLedger(
    ['reg', query, '--monthly', '-X', currency, '--format', 'NNN%D|%t\n'],
    { sortByDate: false }
  );
  const map = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [date, amount] = line.split('|').map((s) => s.trim());
    if (date && amount) map.set(date, parseAmount(amount));
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
    fetchMonthly('^Expenses', currency),
    fetchMonthly('^Income', currency),
  ]);
  const allDates = new Set([...expensesMap.keys(), ...incomeMap.keys()]);
  return Array.from(allDates)
    .map((date) => {
      const expenses = expensesMap.get(date) ?? 0;
      const income = -(incomeMap.get(date) ?? 0);
      return { date: new Date(date), expenses, income, net: income - expenses };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-MONTHS_BACK);
};
