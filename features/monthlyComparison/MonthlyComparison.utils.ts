import dayjs, { Dayjs } from 'dayjs';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import runLedger from '@/utils/runLedger';

const getMonthlyBalance = async (from: Dayjs, to: Dayjs) => {
  const defaultCurrency = getDefaultCurrency() ?? 'USD';

  const stdout = await runLedger([
    'bal',
    'Expenses',
    '-b',
    from.format('YYYY-MM-DD'),
    '-e',
    to.format('YYYY-MM-DD'),
    '-X',
    defaultCurrency,
    '--format',
    'NNN%A|%t|%T\n',
  ]);

  const total =
    stdout
      .split('NNN')
      .filter(Boolean)
      .find((each) => each.split('|')[1] === '0')
      ?.split('|')[2] ?? '';

  return total;
};

const YEARS_BACK = 3;

export const getMonthsTotals = async () => {
  const currentYear = dayjs().year();
  const years = Array.from(
    { length: YEARS_BACK + 1 },
    (_, i) => currentYear - i
  );
  const months = Array.from({ length: 12 }, (_, i) =>
    String(12 - i).padStart(2, '0')
  );

  const monthsTotals: { date: Dayjs; total: string }[] = [];
  for (const year of years) {
    for (const month of months) {
      const date = dayjs(`${year}-${month}-1`);
      if (date.isAfter(dayjs())) continue;
      const total = await getMonthlyBalance(
        date.startOf('month'),
        date.endOf('month')
      );
      if (total.length) {
        monthsTotals.push({ date, total });
      }
    }
  }
  return monthsTotals;
};
