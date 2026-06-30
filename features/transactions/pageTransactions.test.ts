import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, pageTransactions, appendPage } from './pageTransactions';
import type { Transaction } from '@/lib/journal/parser';

const tx = (date: string, payee: string): Transaction => ({
  uid: `${date}-${payee}`,
  file: 'main.ledger',
  startLine: 1,
  endLine: 2,
  date,
  payee,
  status: 'none',
  note: null,
  postings: [{ account: 'Assets:Cash', amount: '1.00', currency: '$' }],
  rawBlock: `${date} ${payee}`,
  fingerprint: `${date}-${payee}`,
});

// 5 transactions across 5 days, deliberately out of order.
const all: Transaction[] = [
  tx('2026-01-01', 'A'),
  tx('2026-01-05', 'B'),
  tx('2026-01-03', 'C'),
  tx('2026-01-02', 'D'),
  tx('2026-01-04', 'B'),
];

describe('PAGE_SIZE', () => {
  it('is 50', () => {
    expect(PAGE_SIZE).toBe(50);
  });
});

describe('pageTransactions', () => {
  it('sorts by date descending and slices the first page', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-04']);
  });

  it('reports total as the filtered count, not the page size', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.total).toBe(5);
  });

  it('returns a numeric nextOffset while rows remain', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.nextOffset).toBe(2);
  });

  it('returns nextOffset null on the last page', () => {
    const page = pageTransactions(all, {}, 4, 2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-01']);
    expect(page.nextOffset).toBeNull();
  });

  it('returns empty rows and null nextOffset past the end', () => {
    const page = pageTransactions(all, {}, 99, 2);
    expect(page.rows).toEqual([]);
    expect(page.nextOffset).toBeNull();
  });

  it('applies filters before paging', () => {
    const page = pageTransactions(all, { payee: 'B' }, 0, 50);
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-04']);
  });

  it('returns slimmed rows (no rawBlock)', () => {
    const page = pageTransactions(all, {}, 0, 1);
    expect('rawBlock' in page.rows[0]).toBe(false);
  });
});

describe('appendPage', () => {
  it('concatenates rows and adopts the new nextOffset', () => {
    const first = pageTransactions(all, {}, 0, 2);
    const second = pageTransactions(all, {}, 2, 2);
    const merged = appendPage(
      { rows: first.rows, nextOffset: first.nextOffset },
      second
    );
    expect(merged.rows).toHaveLength(4);
    expect(merged.nextOffset).toBe(4);
  });
});
