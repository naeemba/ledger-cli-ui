import { groupThousands } from '@/utils/formatAmount';

// Strips a free-text amount field back to a raw, parseable number string:
// a single optional leading minus, the digits, and at most one decimal point.
// This is the value that gets stored and submitted, so it must never contain
// the grouping commas the user sees while typing.
export const cleanAmountInput = (input: string): string => {
  const digitsAndDots = input.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  const single =
    firstDot === -1
      ? digitsAndDots
      : digitsAndDots.slice(0, firstDot + 1) +
        digitsAndDots.slice(firstDot + 1).replace(/\./g, '');
  // A minus is only meaningful at the very start of the field.
  const negative = input.trimStart().startsWith('-');
  return (negative ? '-' : '') + single;
};

// Renders a raw number string with comma thousands separators for display in
// the input. Preserves a trailing dot and the exact decimals the user typed so
// editing stays lossless; tolerates already-grouped input defensively. The
// grouping rule itself is shared with `groupThousands` so display and input
// never drift.
export const groupAmountInput = (raw: string): string => {
  const clean = cleanAmountInput(raw);
  if (clean === '') return '';
  const negative = clean.startsWith('-');
  const body = negative ? clean.slice(1) : clean;
  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const decPart = dot === -1 ? undefined : body.slice(dot + 1);
  const groupedInt = groupThousands(intPart);
  const out = decPart === undefined ? groupedInt : `${groupedInt}.${decPart}`;
  return (negative ? '-' : '') + out;
};

// Maps a caret position expressed as "after N significant characters" onto the
// grouped string, where commas are the only non-significant characters. Keeps
// the caret anchored to the digit the user was editing across reformatting.
export const caretAfterFormat = (
  formatted: string,
  significantBefore: number
): number => {
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (seen >= significantBefore) return i;
    if (formatted[i] !== ',') seen++;
  }
  return formatted.length;
};

// Counts the decimal places in a raw number string (digits after a single dot).
// Used to render a derived amount at the same precision as its source rather
// than a hard-coded scale.
export const decimalPlaces = (raw: string): number => {
  const clean = cleanAmountInput(raw);
  const dot = clean.indexOf('.');
  return dot === -1 ? 0 : clean.length - dot - 1;
};

const SIGNIFICANT = /[0-9.-]/;

export const countSignificant = (value: string, end: number): number => {
  let n = 0;
  for (let i = 0; i < end && i < value.length; i++) {
    if (SIGNIFICANT.test(value[i])) n++;
  }
  return n;
};
