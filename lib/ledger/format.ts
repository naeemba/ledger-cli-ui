import { parseHeader, parsePostingLine } from '@/lib/journal/parser';
import { formatPosting } from '@/lib/transactions/schema';

/**
 * Re-align posting amounts in a raw ledger block to the canonical column used
 * by the form layer, while leaving everything that is not a plain posting
 * (header, comments, uid line, blanks, unparsable lines) byte-for-byte intact.
 *
 * Defensive: if the first line is not a valid transaction header, the input is
 * returned unchanged so a half-typed entry is never mangled.
 */
export const formatLedgerText = (raw: string): string => {
  const lines = raw.split('\n');
  if (lines.length === 0 || !parseHeader(lines[0])) return raw;

  const formatted = lines.map((line, i) => {
    if (i === 0) return line; // header preserved verbatim
    if (line.trim() === '') return line; // blank
    if (line.trim().startsWith(';')) return line; // comment / uid line
    const posting = parsePostingLine(line);
    if (!posting) return line; // unparsable — keep as-is
    return formatPosting(posting);
  });

  return formatted.join('\n');
};
