import { promises as fs } from 'fs';
import path from 'path';
import { fingerprintDraft } from './fingerprint';
import { UID_LINE_REGEX } from './uid';

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

export type ParsedBlock = {
  uid: string | null;
  date: string;
  status: 'cleared' | 'pending' | 'none';
  payee: string;
  note: string | null;
  postings: ParsedPosting[];
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
    }
  }

  return {
    uid,
    date: header.date,
    status: header.status,
    payee: header.payee,
    note: noteLines.length > 0 ? noteLines.join('\n') : null,
    postings,
  };
};

const INCLUDE_LINE_REGEX = /^\s*include\s+(\S.*?)\s*$/;

export const resolveIncludes = async (mainPath: string): Promise<string[]> => {
  const seen = new Set<string>();
  const order: string[] = [];

  const visit = async (filePath: string, stack: string[]): Promise<void> => {
    const abs = path.resolve(filePath);
    if (stack.includes(abs)) {
      throw new Error(
        `Include cycle detected: ${[...stack, abs].join(' -> ')}`
      );
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    order.push(abs);
    const text = await fs.readFile(abs, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(INCLUDE_LINE_REGEX);
      if (m) {
        const target = path.resolve(path.dirname(abs), m[1]);
        await visit(target, [...stack, abs]);
      }
    }
  };

  await visit(mainPath, []);
  return order;
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

export const parseJournal = async (
  mainPath: string
): Promise<ParsedJournal> => {
  const filePaths = await resolveIncludes(mainPath);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const transactions: Transaction[] = [];
  for (const filePath of filePaths) {
    const [stat, text] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, 'utf-8'),
    ]);
    files.push({ path: filePath, mtimeMs: stat.mtimeMs });
    transactions.push(...parseJournalFile(filePath, text));
  }
  return { files, transactions };
};
