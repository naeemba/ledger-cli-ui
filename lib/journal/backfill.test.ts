import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { backfillJournalFile } from './backfill';
import { parseJournalFile } from './parser';
import { findUidInBlock } from './uid';

const tmpdir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'backfill-'));

describe('backfillJournalFile', () => {
  it('inserts UID into every block lacking one', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      [
        '2024-09-01 lunch',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
        '2024-09-02 coffee',
        '    Expenses:Coffee  USD 4',
        '    Assets:Cash',
        '',
      ].join('\n')
    );
    const result = await backfillJournalFile(file);
    expect(result.uidsAdded).toBe(2);
    const text = await fs.readFile(file, 'utf-8');
    const txs = parseJournalFile(file, text);
    expect(txs.every((t) => t.uid !== null)).toBe(true);
  });

  it('is idempotent on a fully migrated file', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      [
        '2024-09-01 lunch',
        '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
      ].join('\n')
    );
    const result = await backfillJournalFile(file);
    expect(result.uidsAdded).toBe(0);
    expect(result.fileTouched).toBe(false);
  });

  it('preserves byte-for-byte content outside the UID insertion', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    const original =
      '2024/09/01 lunch\n\tExpenses:Food\t10 USD\n\tAssets:Cash\n';
    await fs.writeFile(file, original);
    await backfillJournalFile(file);
    const text = await fs.readFile(file, 'utf-8');
    const uid = findUidInBlock(text);
    expect(uid).not.toBeNull();
    const lines = text.split('\n');
    expect(lines[0]).toBe('2024/09/01 lunch');
    expect(lines[2]).toBe('\tExpenses:Food\t10 USD');
    expect(lines[3]).toBe('\tAssets:Cash');
    expect(lines[1]).toBe(`\t; :uid: ${uid}`);
  });

  it('matches first-posting indent (4-space)', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    await backfillJournalFile(file);
    const text = await fs.readFile(file, 'utf-8');
    const lines = text.split('\n');
    expect(lines[1]).toMatch(/^    ; :uid: /);
  });
});
