import { promises as fs } from 'fs';
import { resolveIncludes } from './parser';
// runs only on the server; the resolveUserJournal import provides the gate via db/auth deps
import { detectFirstPostingIndent, findUidInBlock, generateUid } from './uid';

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;

export type BackfillFileResult = {
  uidsAdded: number;
  fileTouched: boolean;
};

export const backfillJournalFile = async (
  filePath: string
): Promise<BackfillFileResult> => {
  const original = await fs.readFile(filePath, 'utf-8');
  const lines = original.split('\n');
  const output: string[] = [];
  let inBlock = false;
  let blockBuf: string[] = [];
  let uidsAdded = 0;

  const flushBlock = () => {
    if (blockBuf.length === 0) return;
    const blockText = blockBuf.join('\n');
    if (findUidInBlock(blockText) === null) {
      const indent = detectFirstPostingIndent(blockBuf);
      const uidLine = `${indent}; :uid: ${generateUid()}`;
      output.push(blockBuf[0], uidLine, ...blockBuf.slice(1));
      uidsAdded++;
    } else {
      output.push(...blockBuf);
    }
    blockBuf = [];
    inBlock = false;
  };

  for (const line of lines) {
    if (!inBlock) {
      if (HEADER_START_REGEX.test(line)) {
        inBlock = true;
        blockBuf = [line];
      } else {
        output.push(line);
      }
      continue;
    }
    if (line.trim() === '') {
      flushBlock();
      output.push(line);
      continue;
    }
    blockBuf.push(line);
  }
  flushBlock();

  const next = output.join('\n');
  if (next === original) {
    return { uidsAdded: 0, fileTouched: false };
  }
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, next, 'utf-8');
  await fs.rename(tmp, filePath);
  return { uidsAdded, fileTouched: true };
};

export type BackfillResult = {
  filesTouched: number;
  uidsAdded: number;
};

export const backfillUids = async (userId: string): Promise<BackfillResult> => {
  const { resolveUserJournal } = await import('@/lib/journals');
  const { mainPath } = await resolveUserJournal(userId);
  const files = await resolveIncludes(mainPath);
  let filesTouched = 0;
  let uidsAdded = 0;
  for (const file of files) {
    const result = await backfillJournalFile(file);
    if (result.fileTouched) filesTouched++;
    uidsAdded += result.uidsAdded;
  }
  return { filesTouched, uidsAdded };
};
