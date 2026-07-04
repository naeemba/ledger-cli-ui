import { promises as fs } from 'fs';
import path from 'path';
import {
  parseJournalFile,
  type ParsedJournal,
  type ParsedTransaction,
} from './parser';

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

export const parseJournal = async (
  mainPath: string
): Promise<ParsedJournal> => {
  const filePaths = await resolveIncludes(mainPath);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const transactions: ParsedTransaction[] = [];
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
