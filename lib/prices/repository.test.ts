import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('CommodityPriceRepository', () => {
  let ctx: TestDbContext;
  let repo: CommodityPriceRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-repo-');
    repo = new CommodityPriceRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('inserts new rows', async () => {
    const fetchedAt = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 60000,
        fetchedAt,
        fetchedDate: '2026-05-25',
      },
    ]);
    const rows = await repo.listForQuote('EUR');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(60000);
  });

  it('upserts on (symbol, quote, fetched_date) conflict', async () => {
    const fetchedAt = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 60000,
        fetchedAt,
        fetchedDate: '2026-05-25',
      },
    ]);
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 61000,
        fetchedAt,
        fetchedDate: '2026-05-25',
      },
    ]);
    const rows = await repo.listForQuote('EUR');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(61000);
  });

  it('dedupes same-day duplicate conflict keys in one batch (last-wins)', async () => {
    // Mirrors the legacy-import path, which emits one row per `P` directive and
    // can carry several same-day entries for one commodity. Without deduping,
    // the single ON CONFLICT DO UPDATE statement throws Postgres 21000.
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 60000,
        fetchedAt: new Date('2026-05-25T06:00:00Z'),
        fetchedDate: '2026-05-25',
      },
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 61000,
        fetchedAt: new Date('2026-05-25T18:00:00Z'),
        fetchedDate: '2026-05-25',
      },
    ]);
    const rows = await repo.listForQuote('EUR');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(61000);
  });

  it('returns rows ordered by fetchedAt ascending', async () => {
    const day1 = new Date('2026-05-24T06:00:00Z');
    const day2 = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 61000,
        fetchedAt: day2,
        fetchedDate: '2026-05-25',
      },
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 60000,
        fetchedAt: day1,
        fetchedDate: '2026-05-24',
      },
    ]);
    const rows = await repo.listForQuote('USD');
    expect(rows.map((r) => r.fetchedDate)).toEqual([
      '2026-05-24',
      '2026-05-25',
    ]);
  });

  it('listForQuote filters by quote currency', async () => {
    const at = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 67000,
        fetchedAt: at,
        fetchedDate: '2026-05-25',
      },
      {
        symbol: 'BTC',
        quote: 'EUR',
        price: 60000,
        fetchedAt: at,
        fetchedDate: '2026-05-25',
      },
    ]);
    expect(await repo.listForQuote('USD')).toHaveLength(1);
    expect(await repo.listForQuote('EUR')).toHaveLength(1);
  });
});

describe('PriceFetchRunRepository', () => {
  let ctx: TestDbContext;
  let repo: PriceFetchRunRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('runs-repo-');
    repo = new PriceFetchRunRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('insert returns the inserted row with id', async () => {
    const row = await repo.insert({
      startedAt: new Date('2026-05-25T06:00:00Z'),
      status: 'success',
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe('success');
  });

  it('update mutates an existing run row', async () => {
    const row = await repo.insert({
      startedAt: new Date('2026-05-25T06:00:00Z'),
      status: 'success',
    });
    await repo.update(row.id, {
      completedAt: new Date('2026-05-25T06:00:05Z'),
      status: 'partial',
      symbolsFetched: 5,
      symbolsFailed: 1,
      errorMessage: 'NOPE/USD',
    });
    const latest = await repo.latest();
    expect(latest?.status).toBe('partial');
    expect(latest?.symbolsFetched).toBe(5);
  });

  it('latest returns the most recent row by id', async () => {
    await repo.insert({ startedAt: new Date(), status: 'success' });
    await repo.insert({ startedAt: new Date(), status: 'failed' });
    const latest = await repo.latest();
    expect(latest?.status).toBe('failed');
  });

  it('latest returns null on empty table', async () => {
    expect(await repo.latest()).toBeNull();
  });
});
