import { exec } from 'child_process';
import dayjs, { Dayjs } from 'dayjs';
import { promisify } from 'util';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import getLedgerCommand from '@/utils/getLedgerCommand';

const execPromise = promisify(exec);

const getMonthlyBalance = async (from: Dayjs, to: Dayjs) => {
  const defaultCurrency = getDefaultCurrency();

  const { stdout } = await execPromise(
    `${getLedgerCommand()} bal Expenses -b "${from.format('YYYY-MM-DD')}" -e "${to.format('YYYY-MM-DD')}" -X ${defaultCurrency} --format "NNN%A|%t|%T\n"`
  );

  const total =
    stdout
      .split('NNN')
      .filter(Boolean)
      .find((each) => each.split('|')[1] === '0')
      ?.split('|')[2] ?? '';
  console.log({ total });

  return total;
};

export const getMonthsTotals = async () => {
  const months = [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12',
  ].reverse();

  const years = [2024, 2023];
  const monthsTotals: { date: Dayjs; total: string }[] = [];
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    for (let j = 0; j < months.length; j++) {
      const month = months[j];
      const date = dayjs(`${year}-${month}-1`);
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
