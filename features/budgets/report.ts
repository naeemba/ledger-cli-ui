import runLedger from '@/utils/runLedger';

export const BUDGET_ROW_FORMAT =
  '%A|%(get_at(display_total, 0))|%(0 - get_at(display_total, 1))|%(get_at(display_total, 0) + get_at(display_total, 1))|%(quantity(get_at(display_total, 0)))|%(quantity(0 - get_at(display_total, 1)))\n';

export type BudgetRow = {
  account: string;
  actual: string; // ledger-rendered, e.g. "$ 1,850.00"
  budgeted: string; // ledger-rendered
  difference: string; // ledger-rendered, negative = under budget
  usedRatio: number | null; // actualQuantity / budgetedQuantity, ONLY for bar width; null when budgeted quantity is 0
};

export type UnbudgetedRow = { account: string; amount: string };

export type BudgetReport = {
  month: BudgetRow[]; // current month
  yearToDate: BudgetRow[]; // Jan 1 through end of current month (cumulative)
  unbudgeted: UnbudgetedRow[];
};

export const parseBudgetRows = (stdout: string): BudgetRow[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('-'))
    .map((line) => line.split('|'))
    .filter((fields) => fields.length === 6 && fields[0] !== '')
    .map(
      ([
        account,
        actual,
        budgeted,
        difference,
        actualQuantity,
        budgetedQuantity,
      ]) => {
        const budgetedNumber = Number(budgetedQuantity);
        return {
          account,
          actual,
          budgeted,
          difference,
          usedRatio:
            budgetedNumber === 0
              ? null
              : Number(actualQuantity) / budgetedNumber,
        };
      }
    );

export const parseUnbudgetedRows = (stdout: string): UnbudgetedRow[] =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('|'))
    .filter((fields) => fields.length === 2 && fields[0] !== '')
    .map(([account, amount]) => ({ account, amount }));

// UTC string arithmetic (same style as lib/journal/schedule.ts) — no local
// timezone Date parsing.
const startOfYear = (today: string): string => `${today.slice(0, 4)}/01/01`;

const startOfNextMonth = (today: string): string => {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}/${String(nextMonth).padStart(2, '0')}/01`;
};

export const getBudgetReport = async (
  currency: string,
  today: string
): Promise<BudgetReport> => {
  const [monthStdout, yearToDateStdout, unbudgetedStdout] = await Promise.all([
    runLedger(
      [
        'budget',
        '^Expenses',
        '-p',
        'this month',
        '-X',
        currency,
        '--flat',
        '--format',
        BUDGET_ROW_FORMAT,
      ],
      { sortByDate: false }
    ),
    runLedger(
      [
        'budget',
        '^Expenses',
        '-b',
        startOfYear(today),
        '-e',
        startOfNextMonth(today),
        '-X',
        currency,
        '--flat',
        '--format',
        BUDGET_ROW_FORMAT,
      ],
      { sortByDate: false }
    ),
    runLedger(
      [
        'bal',
        '^Expenses',
        '--unbudgeted',
        '-p',
        'this month',
        '-X',
        currency,
        '--flat',
        '--format',
        '%A|%T\n',
      ],
      { sortByDate: false }
    ),
  ]);

  return {
    month: parseBudgetRows(monthStdout),
    yearToDate: parseBudgetRows(yearToDateStdout),
    unbudgeted: parseUnbudgetedRows(unbudgetedStdout),
  };
};
