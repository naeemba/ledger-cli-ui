import runLedger from '@/utils/runLedger';

const MONTHS_BACK = 36;

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', '')) || 0;
};

const fetchMonthly = async (
  query: string,
  currency: string
): Promise<Map<string, number>> => {
  const stdout = await runLedger(
    ['reg', query, '--monthly', '-X', currency, '--format', 'NNN%D|%A|%t\n'],
    { sortByDate: false }
  );
  const map = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [date, account, amount] = line.split('|').map((s) => s.trim());
    if (!date || !amount) continue;
    // `-X` injects `<Adjustment>` / `<Revalued>` postings that inherit a real
    // payee; they must not be summed into the month's total.
    if (account.startsWith('<')) continue;
    map.set(date, (map.get(date) ?? 0) + parseAmount(amount));
  }
  return map;
};

export type CashFlowRow = {
  date: Date;
  income: number;
  expenses: number;
};

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
