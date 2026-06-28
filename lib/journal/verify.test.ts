import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyJournalParseable } from './verify';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('verifyJournalParseable', () => {
  it('returns ok for a syntactically valid journal', async () => {
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(
      file,
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const result = await verifyJournalParseable(file);
    expect(result.ok).toBe(true);
  });

  it('returns ok for an empty stub journal', async () => {
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(file, '; just a comment\n');
    const result = await verifyJournalParseable(file);
    expect(result.ok).toBe(true);
  });

  it('returns ok for a multi-file journal via include', async () => {
    const main = path.join(tmp, 'main.ledger');
    const sub = path.join(tmp, 'sub.ledger');
    await fs.writeFile(main, 'include ./sub.ledger\n');
    await fs.writeFile(
      sub,
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const result = await verifyJournalParseable(main);
    expect(result.ok).toBe(true);
  });

  it('returns parse failure for a journal where postings do not balance', async () => {
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(
      file,
      '2024-09-01 oops\n    Expenses:Food  USD 10\n    Assets:Cash  USD -7\n'
    );
    const result = await verifyJournalParseable(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Surface ledger's actual diagnostic, not just the (often useless) first
      // "In file included from"/"While parsing" context line.
      expect(result.message).toMatch(/Error: Transaction does not balance/);
    }
  });

  it('redacts absolute paths in error messages', async () => {
    // Unbalanced transactions are reliably rejected by ledger and produce
    // a stderr line that references the file path. We use that to assert
    // the sanitize() redaction holds.
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(
      file,
      '2024-09-01 oops\n    Expenses:Food  USD 10\n    Assets:Cash  USD -7\n'
    );
    const result = await verifyJournalParseable(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain(tmp);
      expect(result.message).not.toMatch(/\/[A-Za-z]+\/[A-Za-z]/);
    }
  });

  it('surfaces the real error, not the "In file included from" context, for an included file', async () => {
    // Reproduces the reported bug: an unbalanced transaction lives in an
    // included file, so ledger's FIRST stderr line is the unhelpful
    // "In file included from ... line N:". The message must carry the actual
    // diagnostic instead.
    const main = path.join(tmp, 'main.ledger');
    const sub = path.join(tmp, 'sub.ledger');
    await fs.writeFile(main, 'include ./sub.ledger\n');
    await fs.writeFile(
      sub,
      '2024-09-01 oops\n    Expenses:Food  USD 10\n    Assets:Cash  USD -7\n'
    );
    const result = await verifyJournalParseable(main);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Error: Transaction does not balance/);
      expect(result.message).not.toMatch(/^In file included from/);
      expect(result.message).not.toContain(tmp);
    }
  });

  it('returns parse failure when the file is missing', async () => {
    const result = await verifyJournalParseable(
      path.join(tmp, 'missing.ledger')
    );
    expect(result.ok).toBe(false);
  });
});
