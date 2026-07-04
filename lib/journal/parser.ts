import { fingerprintDraft } from './fingerprint';
import { UID_LINE_REGEX } from './uid';
import type { Posting } from '@/lib/transactions/posting';

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

export type { Annotation } from '@/lib/transactions/posting';

/** Alias for the canonical `Posting` type; kept for backward compatibility. */
export type ParsedPosting = Posting;

const POSTING_BARE_REGEX = /^\s+([^;\s][^\t]*?)\s*$/;

const stripCommas = (s: string): string => s.replace(/,/g, '');
const isAmount = (s: string): boolean => /^-?\d[\d,]*(?:\.\d+)?$/.test(s);

const splitAccountRest = (
  line: string
): { account: string; rest: string } | null => {
  const m = line.match(/^\s+(\S[^\t;]*?)(?:\s{2,}|\t+)(\S.*?)\s*$/);
  if (!m) return null;
  return { account: m[1].trim(), rest: m[2].trim() };
};

const parseAmtCur = (
  s: string
): { amount: string; currency: string } | null => {
  const parts = s.split(/\s+/);
  if (parts.length !== 2) return null;
  const [first, second] = parts;
  if (isAmount(first) && !isAmount(second)) {
    return { amount: stripCommas(first), currency: second };
  }
  if (!isAmount(first) && isAmount(second)) {
    return { amount: stripCommas(second), currency: first };
  }
  return null;
};

export const parsePostingLine = (line: string): ParsedPosting | null => {
  const split = splitAccountRest(line);
  if (split) {
    const { account, rest } = split;

    // Bare assertion: "= AMT CUR" (no posting amount).
    if (rest.startsWith('=')) {
      const assertion = parseAmtCur(rest.slice(1).trim());
      if (!assertion) return null;
      return { account, amount: '', currency: '', assertion };
    }

    // Total-cost annotation: "AMT CUR @@ AMT CUR".
    const atAt = rest.split('@@');
    if (atAt.length === 2) {
      const main = parseAmtCur(atAt[0].trim());
      const cost = parseAmtCur(atAt[1].trim());
      if (!main || !cost) return null;
      return { account, amount: main.amount, currency: main.currency, cost };
    }
    if (atAt.length > 2) return null;

    // Plain amount posting.
    const main = parseAmtCur(rest);
    if (!main) return null;
    return { account, amount: main.amount, currency: main.currency };
  }

  const bareMatch = line.match(POSTING_BARE_REGEX);
  if (bareMatch) {
    return { account: bareMatch[1].trim(), amount: '', currency: '' };
  }
  return null;
};

export type ParsedBlock = {
  uid: string | null;
  date: string;
  status: 'cleared' | 'pending' | 'none';
  payee: string;
  note: string | null;
  postings: ParsedPosting[];
  /**
   * Non-empty lines after the header that were neither a uid, a comment, nor a
   * valid posting. Journal-file parsing tolerates these (junk is skipped), but
   * an interactive editor can use them to flag silently-dropped content.
   */
  unparsedLines: string[];
};

const COMMENT_LINE_REGEX = /^\s*;\s?(.*)$/;

export const parseBlock = (block: string): ParsedBlock | null => {
  const lines = block.split('\n');
  if (lines.length === 0) return null;
  const header = parseHeader(lines[0]);
  if (!header) return null;

  let uid: string | null = null;
  const noteLines: string[] = [];
  const postings: ParsedPosting[] = [];
  const unparsedLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const uidMatch = line.match(UID_LINE_REGEX);
    if (uidMatch) {
      uid = uidMatch[1];
      continue;
    }
    const commentMatch = line.match(COMMENT_LINE_REGEX);
    if (commentMatch) {
      noteLines.push(commentMatch[1].trim());
      continue;
    }
    const posting = parsePostingLine(line);
    if (posting) {
      postings.push(posting);
    } else {
      unparsedLines.push(line);
    }
  }

  return {
    uid,
    date: header.date,
    status: header.status,
    payee: header.payee,
    note: noteLines.length > 0 ? noteLines.join('\n') : null,
    postings,
    unparsedLines,
  };
};

export type Transaction = {
  uid: string | null;
  file: string;
  startLine: number;
  endLine: number;
  date: string;
  payee: string;
  status: 'cleared' | 'pending' | 'none';
  note: string | null;
  postings: ParsedPosting[];
  rawBlock: string;
  fingerprint: string;
};

export type ParsedJournal = {
  files: Array<{ path: string; mtimeMs: number }>;
  transactions: Transaction[];
};

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;

export const parseJournalFile = (
  filePath: string,
  text: string
): Transaction[] => {
  const lines = text.split('\n');
  const transactions: Transaction[] = [];
  let blockStart: number | null = null;
  let blockLines: string[] = [];

  const flush = (endLine: number) => {
    if (blockStart === null) return;
    const block = parseBlock(blockLines.join('\n'));
    if (block) {
      const fingerprint = fingerprintDraft({
        date: block.date,
        payee: block.payee,
        status: block.status,
        note: block.note ?? undefined,
        uid: block.uid ?? undefined,
        postings: block.postings,
      });
      transactions.push({
        uid: block.uid,
        file: filePath,
        startLine: blockStart + 1,
        endLine: endLine + 1,
        date: block.date,
        payee: block.payee,
        status: block.status,
        note: block.note,
        postings: block.postings,
        rawBlock: blockLines.join('\n'),
        fingerprint,
      });
    }
    blockStart = null;
    blockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (blockStart === null) {
      if (HEADER_START_REGEX.test(line)) {
        blockStart = i;
        blockLines = [line];
      }
      continue;
    }
    if (line.trim() === '') {
      flush(i - 1);
      continue;
    }
    blockLines.push(line);
  }
  flush(lines.length - 1);
  return transactions;
};
