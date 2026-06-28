import path from 'path';
import { describe, it, expect } from 'vitest';
import { resolveIncludes, parseJournal } from './loader';

const fixturePath = (...parts: string[]) =>
  path.resolve(__dirname, '__fixtures__', ...parts);

describe('resolveIncludes', () => {
  it('returns the main file when there are no includes', async () => {
    const main = fixturePath('includes-basic', 'sub.ledger');
    expect(await resolveIncludes(main)).toEqual([main]);
  });

  it('resolves a single include relative to its host file', async () => {
    const main = fixturePath('includes-basic', 'main.ledger');
    const sub = fixturePath('includes-basic', 'sub.ledger');
    expect(await resolveIncludes(main)).toEqual([main, sub]);
  });

  it('throws on include cycles', async () => {
    const main = fixturePath('includes-cycle', 'main.ledger');
    await expect(resolveIncludes(main)).rejects.toThrow(/cycle/i);
  });
});

describe('parseJournal', () => {
  it('parses multi-file journals with includes', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const result = await parseJournal(main);
    expect(result.transactions).toHaveLength(3);
    expect(result.files.map((f) => path.basename(f.path))).toEqual([
      'main.ledger',
      'q1.ledger',
    ]);
  });

  it('normalizes slash dates to dashes', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya');
    expect(lunch?.date).toBe('2024-09-01');
  });

  it('strips comma thousands in amounts', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya')!;
    const bank = lunch.postings.find(
      (p) => p.account === 'Assets:Bank:Blubank'
    );
    expect(bank?.amount).toBe('-1000');
  });

  it('preserves UID from source', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const tj = transactions.find((t) => t.payee === "Trader Joe's");
    expect(tj?.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('attaches source coordinates', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    for (const tx of transactions) {
      expect(tx.startLine).toBeGreaterThan(0);
      expect(tx.endLine).toBeGreaterThanOrEqual(tx.startLine);
      expect(tx.rawBlock.length).toBeGreaterThan(0);
    }
  });
});
