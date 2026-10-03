import type { SharedDebtNet, SharedDebtRow } from './payload';
import {
  PAYABLE_ROOT,
  RECEIVABLE_ROOT,
  personAccountPatterns,
} from '@/features/debts/parse';

// Framing that can't occur in ledger's rendered amounts or (realistically) a
// payee: a record separator before each row and a unit separator between
// fields. A multi-commodity running total spans several lines, so rows can't
// be split on newlines.
const RECORD = '\x1e';
const FIELD = '\x1f';

const personPatterns = (person: string): string[] => [
  ...personAccountPatterns(RECEIVABLE_ROOT, person),
  ...personAccountPatterns(PAYABLE_ROOT, person),
];

// `--amount -amount` makes ledger negate every posting, so the figures read
// from the viewer's side. No `-X`: each amount stays in its own commodity.
const VIEWER_SIDE = ['--amount', '-amount'];

/**
 * One person's postings, oldest first — ledger accumulates the running total in
 * output order, so `--sort -date` would total from the newest row. The caller
 * reverses the parsed rows for display. `--` stops option parsing so a person
 * name can't smuggle a flag.
 */
export const sharedRowsArgs = (person: string): string[] => [
  'register',
  ...VIEWER_SIDE,
  '--format',
  `${RECORD}%(format_date(date, "%Y-%m-%d"))${FIELD}%(scrub(display_amount))${FIELD}%(scrub(display_total))${FIELD}%P\n`,
  '--',
  ...personPatterns(person),
];

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const parseSharedRows = (stdout: string): SharedDebtRow[] =>
  stdout
    .split(RECORD)
    .filter((record) => record.includes(FIELD))
    .map((record) => {
      const [date, amount, total, payee] = record.split(FIELD);
      return {
        date: date.trim(),
        payee: payee.trim(),
        amount: amount.trim(),
        balance: lines(total),
      };
    })
    .reverse();

/**
 * Net per commodity. `quantity()` can't read a multi-commodity total, so ledger
 * groups by commodity: a bare header line per group, then one collapsed row per
 * transaction whose running total is that commodity's net so far.
 */
export const sharedNetArgs = (person: string): string[] => [
  'register',
  ...VIEWER_SIDE,
  '--group-by',
  'commodity',
  '--collapse',
  '--format',
  `${RECORD}%(quantity(scrub(display_total)))${FIELD}%(commodity(scrub(display_total)))${FIELD}%(scrub(abs(display_total)))\n`,
  '--',
  ...personPatterns(person),
];

/**
 * Keep the last row per commodity (its final net) and read only the sign of
 * ledger's quantity: negative means the viewer owes the owner. A zero net is a
 * settled commodity and is dropped.
 */
export const parseSharedNet = (stdout: string): SharedDebtNet[] => {
  const lastByCommodity = new Map<
    string,
    { quantity: number; amount: string }
  >();
  for (const record of stdout.split(RECORD)) {
    // A group header follows the previous row on its own line; keep line one.
    const [quantityText, commodity, amount] = (
      record.split('\n')[0] ?? ''
    ).split(FIELD);
    if (amount === undefined) continue;
    lastByCommodity.set(commodity.trim(), {
      quantity: Number(quantityText),
      amount: amount.trim(),
    });
  }
  return [...lastByCommodity.values()]
    .filter(({ quantity }) => Number.isFinite(quantity) && quantity !== 0)
    .map(({ quantity, amount }) => ({
      amount,
      direction: quantity < 0 ? 'viewer-owes' : 'owner-owes',
    }));
};
