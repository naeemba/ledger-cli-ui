import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BANNER_MARKER } from './formatter';
import { __resetPriceLockForTests } from './lock';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import * as schema from '@/db/schema';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
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
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "started_at" integer NOT NULL,
    "completed_at" integer,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY,
    "baseCurrency" text NOT NULL,
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
`;

const seedUser = async (
  ctx: TestDbContext,
  id: string,
  postings: string,
  baseCurrency: string
) => {
  ctx.sqlite
    .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
    .run(id, id, `${id}@example.com`);
  ctx.sqlite
    .prepare(`INSERT INTO "userSetting" ("userId","baseCurrency") VALUES (?,?)`)
    .run(id, baseCurrency);
  const dir = getJournalDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'main.ledger'), postings, 'utf-8');
};

describe('PriceService.refreshAll', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    __resetPriceLockForTests();
    ctx = await setupTestDb('prices-svc-');
    ctx.sqlite.exec(PRICE_TABLE);

    const db = drizzle(ctx.sqlite, { schema });
    service = new PriceService({
      db,
      commodityRepo: new CommodityPriceRepository(db),
      runRepo: new PriceFetchRunRepository(db),
      journalRepo: new JournalRepository(db),
    });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.restoreAllMocks();
  });

  it('fetches the union of all users (symbols, base) in one provider call', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    await seedUser(
      ctx,
      'bob',
      '2026/01/01 Y\n  Assets:Cash  1 ADA\n  Income\n',
      'EUR'
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 }, ADA: { EUR: 0.38 } }),
    } as Response);

    const result = await service.refreshAll();

    expect(result.status).toBe('success');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('writes the per-user price-db.ledger with the banner + P lines', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 } }),
    } as Response);

    await service.refreshAll();

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toContain(BANNER_MARKER);
    expect(file).toContain('P ');
    expect(file).toContain('BTC');
    expect(file).toContain('60000');
    expect(file).toContain('EUR');
  });

  it('marks the run as partial when the provider reports failed symbols', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 NOPE\n  Income\n',
      'USD'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const result = await service.refreshAll();
    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.failed).toContain('NOPE');
    }
  });

  it('marks the run as failed on provider throw, without regenerating files', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    const existing = '; user-written content\n';
    await fs.writeFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      existing,
      'utf-8'
    );

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const result = await service.refreshAll();
    expect(result.status).toBe('failed');

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toBe(existing);
  });

  it('migrates a legacy price-db.ledger into the table before regenerating', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    await fs.writeFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'P 2026/01/01 12:00:00 BTC 50000 EUR\n',
      'utf-8'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 } }),
    } as Response);

    await service.refreshAll();

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toContain('50000');
    expect(file).toContain('60000');
  });

  it('persists the price_fetch_run row with completion data', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 } }),
    } as Response);

    await service.refreshAll();

    const rows = ctx.sqlite
      .prepare('SELECT * FROM price_fetch_run ORDER BY id DESC')
      .all() as Array<{
      status: string;
      completed_at: number | null;
      symbols_fetched: number;
      symbols_failed: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('success');
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].symbols_fetched).toBe(1);
    expect(rows[0].symbols_failed).toBe(0);
  });

  it('coalesces concurrent calls into a single provider request', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );

    let release: () => void = () => {};
    const gate = new Promise<Response>((r) => {
      release = () =>
        r({
          ok: true,
          status: 200,
          json: async () => ({ BTC: { EUR: 60000 } }),
        } as Response);
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => gate);

    const a = service.refreshAll();
    const b = service.refreshAll();
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ra.status).toBe('success');
    expect(rb.status).toBe('success');
  });
});
