export type ParsedHeader = {
  date: string;
  status: 'cleared' | 'pending' | 'none';
  payee: string;
};

const HEADER_REGEX = /^(\d{4})[-/](\d{2})[-/](\d{2})\s+(?:([*!])\s+)?(\S.*)$/;

export const parseHeader = (line: string): ParsedHeader | null => {
  const m = line.match(HEADER_REGEX);
  if (!m) return null;
  const [, y, mo, d, marker, payeeRaw] = m;
  const payee = payeeRaw.trim();
  if (!payee || payee === '*' || payee === '!') return null;
  const status =
    marker === '*' ? 'cleared' : marker === '!' ? 'pending' : 'none';
  return { date: `${y}-${mo}-${d}`, status, payee };
};

export type ParsedPosting = {
  account: string;
  amount: string;
  currency: string;
};

const POSTING_BARE_REGEX = /^\s+([^;\s][^\t]*?)\s*$/;
const POSTING_AMOUNT_REGEX =
  /^\s+([^\t;]+?)(?:\s{2,}|\t+)([^\s;]+\s+[-\d.,]+|[-\d.,]+\s+[^\s;]+)\s*$/;

const stripCommas = (s: string): string => s.replace(/,/g, '');
const isAmount = (s: string): boolean => /^-?\d[\d,]*(?:\.\d+)?$/.test(s);

export const parsePostingLine = (line: string): ParsedPosting | null => {
  const amountMatch = line.match(POSTING_AMOUNT_REGEX);
  if (amountMatch) {
    const [, account, valueRaw] = amountMatch;
    const parts = valueRaw.trim().split(/\s+/);
    if (parts.length !== 2) return null;
    const [first, second] = parts;
    let amount: string, currency: string;
    if (isAmount(first) && !isAmount(second)) {
      amount = stripCommas(first);
      currency = second;
    } else if (!isAmount(first) && isAmount(second)) {
      amount = stripCommas(second);
      currency = first;
    } else {
      return null;
    }
    return { account: account.trim(), amount, currency };
  }
  const bareMatch = line.match(POSTING_BARE_REGEX);
  if (bareMatch) {
    return { account: bareMatch[1].trim(), amount: '', currency: '' };
  }
  return null;
};
