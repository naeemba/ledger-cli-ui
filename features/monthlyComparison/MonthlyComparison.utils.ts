import { parseMonthlyTotals, type CashFlowRow } from '@/lib/monthly/parse';
import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;

const fetchMonthly = async (
  query: string,
  currency: string
): Promise<Map<string, number>> => {
  const stdout = await runLedger(
    ['reg', query, '--monthly', '-X', currency, '--format', 'NNN%D|%A|%t\n'],
    { sortByDate: false }
  );
  return parseMonthlyTotals(stdout);
};

export type { CashFlowRow };

export const getCashFlow = async (currency: string): Promise<CashFlowRow[]> => {
  const [expensesMap, incomeMap] = await Promise.all([
    fetchMonthly('^Expenses', currency),
    fetchMonthly('^Income', currency),
  ]);
  const allDates = new Set([...expensesMap.keys(), ...incomeMap.keys()]);
  return Array.from(allDates)
    .map((date) => ({
      date: new Date(date),
      expenses: expensesMap.get(date) ?? 0,
      income: -(incomeMap.get(date) ?? 0),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-MONTHS_BACK);
};
