import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  parseHeader,
  parsePostingLine,
  parseBlock,
  resolveIncludes,
} from './parser';

describe('parseHeader', () => {
  it('parses YYYY-MM-DD with no status', () => {
    expect(parseHeader('2024-09-01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses YYYY/MM/DD and normalizes to YYYY-MM-DD', () => {
    expect(parseHeader('2024/09/01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses cleared marker', () => {
    expect(parseHeader("2024-09-01 * Trader Joe's")).toEqual({
      date: '2024-09-01',
      status: 'cleared',
      payee: "Trader Joe's",
    });
  });

  it('parses pending marker', () => {
    expect(parseHeader('2024-09-01 ! rent')).toEqual({
      date: '2024-09-01',
      status: 'pending',
      payee: 'rent',
    });
  });

  it('trims payee whitespace', () => {
    expect(parseHeader('2024-09-01    lunch with darya   ')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch with darya',
    });
  });

  it('returns null for non-header lines', () => {
    expect(parseHeader('    Expenses:Food  10')).toBeNull();
    expect(parseHeader('; a comment')).toBeNull();
    expect(parseHeader('')).toBeNull();
  });

  it('returns null for missing payee', () => {
    expect(parseHeader('2024-09-01')).toBeNull();
    expect(parseHeader('2024-09-01 *')).toBeNull();
  });
});

describe('parsePostingLine', () => {
  it('parses currency-before amount with space indent', () => {
    expect(parsePostingLine('    Expenses:Food  USD 10')).toEqual({
      account: 'Expenses:Food',
      amount: '10',
      currency: 'USD',
    });
  });

  it('parses currency-after amount with tab indent', () => {
    expect(parsePostingLine('\tExpenses:Family\t322 Kirt')).toEqual({
      account: 'Expenses:Family',
      amount: '322',
      currency: 'Kirt',
    });
  });

  it('strips comma thousands separators', () => {
    expect(parsePostingLine('\tAssets:Bank\t-1,000 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '-1000',
      currency: 'Kirt',
    });
  });

  it('parses negative amount', () => {
    expect(parsePostingLine('    Assets:Cash  USD -42.50')).toEqual({
      account: 'Assets:Cash',
      amount: '-42.50',
      currency: 'USD',
    });
  });

  it('returns blank amount for bare-account auto-balance', () => {
    expect(parsePostingLine('    Assets:Bank:Blubank')).toEqual({
      account: 'Assets:Bank:Blubank',
      amount: '',
      currency: '',
    });
  });

  it('handles decimal amounts', () => {
    expect(parsePostingLine('\tAssets:Bank\t65.14 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '65.14',
      currency: 'Kirt',
    });
  });

  it('returns null for non-posting lines', () => {
    expect(parsePostingLine('2024-09-01 lunch')).toBeNull();
    expect(parsePostingLine('    ; note')).toBeNull();
    expect(parsePostingLine('')).toBeNull();
  });
});

describe('parseBlock', () => {
  it('parses a basic transaction', () => {
    const block = [
      '2024-09-01 lunch',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2024-09-01');
    expect(result!.payee).toBe('lunch');
    expect(result!.uid).toBeNull();
    expect(result!.note).toBeNull();
    expect(result!.postings).toEqual([
      { account: 'Expenses:Food', amount: '10', currency: 'USD' },
      { account: 'Assets:Cash', amount: '', currency: '' },
    ]);
  });

  it('extracts UID from a metadata comment line', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result!.note).toBeNull();
  });

  it('collects non-UID comments into note', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; with darya',
      '    ; split the bill',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.note).toBe('with darya\nsplit the bill');
  });

  it('separates UID from note when both present', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    ; with darya',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result!.note).toBe('with darya');
  });

  it('returns null when first line is not a header', () => {
    expect(parseBlock('    Expenses:Food  USD 10')).toBeNull();
    expect(parseBlock('')).toBeNull();
  });
});

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
    const { parseJournal } = await import('./parser');
    const main = fixturePath('realistic', 'main.ledger');
    const result = await parseJournal(main);
    expect(result.transactions).toHaveLength(3);
    expect(result.files.map((f) => path.basename(f.path))).toEqual([
      'main.ledger',
      'q1.ledger',
    ]);
  });

  it('normalizes slash dates to dashes', async () => {
    const { parseJournal } = await import('./parser');
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya');
    expect(lunch?.date).toBe('2024-09-01');
  });

  it('strips comma thousands in amounts', async () => {
    const { parseJournal } = await import('./parser');
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya')!;
    const bank = lunch.postings.find(
      (p) => p.account === 'Assets:Bank:Blubank'
    );
    expect(bank?.amount).toBe('-1000');
  });

  it('preserves UID from source', async () => {
    const { parseJournal } = await import('./parser');
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const tj = transactions.find((t) => t.payee === "Trader Joe's");
    expect(tj?.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('attaches source coordinates', async () => {
    const { parseJournal } = await import('./parser');
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    for (const tx of transactions) {
      expect(tx.startLine).toBeGreaterThan(0);
      expect(tx.endLine).toBeGreaterThanOrEqual(tx.startLine);
      expect(tx.rawBlock.length).toBeGreaterThan(0);
    }
  });
});
