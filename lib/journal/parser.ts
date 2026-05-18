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
