import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const PRICE_TABLE = `
  CREATE TABLE IF NOT EXISTS "commodity_price" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "symbol" text NOT NULL,
    "quote" text NOT NULL,
    "price" real NOT NULL,
    "fetched_at" integer NOT NULL,
    "fetched_date" text NOT NULL,
    CONSTRAINT "commodity_price_unique_per_day" UNIQUE ("symbol","quote","fetched_date")
  );
`;

const RUN_TABLE = `
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "started_at" integer NOT NULL,
    "completed_at" integer,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
`;

describe('CommodityPriceRepository', () => {
  let ctx: TestDbContext;
  let repo: CommodityPriceRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-repo-');
    ctx.sqlite.exec(PRICE_TABLE);
    repo = new CommodityPriceRepository(drizzle(ctx.sqlite, { schema }));
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
    ctx.sqlite.exec(RUN_TABLE);
    repo = new PriceFetchRunRepository(drizzle(ctx.sqlite, { schema }));
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
