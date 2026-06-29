import { parseBalanceRows } from '@/lib/balance/parse';

/** Strip thousands separators and any non-numeric commodity token. */
const toNumber = (raw: string): string => {
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  return cleaned === '' || cleaned === '-' ? '0' : cleaned;
};

export const extractAccountBalance = (
  stdout: string,
  account: string
): string => {
  const row = parseBalanceRows(stdout).find((r) => r.account === account);
  return row ? toNumber(row.amount) : '0';
};

/** Reject argv flag-smuggling: a non-empty value that does not begin with '-'. */
export const isSafeLedgerArg = (value: string): boolean => {
  const v = value.trim();
  return v !== '' && !v.startsWith('-');
};
