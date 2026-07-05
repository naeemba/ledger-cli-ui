import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BANNER_MARKER } from './formatter';
import { __resetPriceLockForTests } from './lock';
import { ManualPriceRepository } from './manualRepository';
import { CommodityMappingRepository } from './mappingRepository';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import { UserSettingRepository } from '@/lib/settings/repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const seedUser = async (
  ctx: TestDbContext,
  id: string,
  postings: string,
  baseCurrency: string
) => {
  await ctx.insertUser(id, id, `${id}@example.com`);
  await new UserSettingRepository(ctx.db).upsertBaseCurrency(id, baseCurrency);
  const dir = getJournalDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'main.ledger'), postings, 'utf-8');
};

const seedMapping = async (
  ctx: TestDbContext,
  userId: string,
  entries: Array<{ symbol: string; kind: string; providerId: string | null }>
) => {
  const repository = new CommodityMappingRepository(ctx.db);
  await repository.upsertMany(
    entries.map(({ symbol, kind, providerId }) => ({
      userId,
      symbol,
      kind,
      providerId,
      source: 'auto' as const,
    }))
  );
};

describe('PriceService.refreshAll', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    __resetPriceLockForTests();
    ctx = await setupTestDb('prices-svc-');

    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
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
      'USD'
    );
    await seedUser(
      ctx,
      'bob',
      '2026/01/01 Y\n  Assets:Cash  1 ADA\n  Income\n',
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);
    await seedMapping(ctx, 'bob', [
      { symbol: 'ADA', kind: 'crypto', providerId: 'cardano' },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 }, cardano: { usd: 0.38 } }),
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
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 } }),
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
    expect(file).toContain('USD');
  });

  it('marks the run as partial when the provider reports failed symbols', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}), // CoinGecko returns no bitcoin price
    } as Response);

    const result = await service.refreshAll();
    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.failed).toContain('BTC');
    }
  });

  it('marks the run as failed on provider throw, without regenerating files', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);
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
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);
    await fs.writeFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'P 2026/01/01 12:00:00 BTC 50000 USD\n',
      'utf-8'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 } }),
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
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 } }),
    } as Response);

    await service.refreshAll();

    const result = await ctx.client.query<{
      status: string;
      completed_at: Date | null;
      symbols_fetched: number;
      symbols_failed: number;
    }>('SELECT * FROM price_fetch_run ORDER BY id DESC');
    const rows = result.rows;
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
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);

    let release: () => void = () => {};
    const gate = new Promise<Response>((r) => {
      release = () =>
        r({
          ok: true,
          status: 200,
          json: async () => ({ bitcoin: { usd: 60000 } }),
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

  it('excludes manual-kind symbols from the fetch plan', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Assets:Cash  1 KIRT\n  Income\n',
      'USD'
    );
    // BTC is a known crypto; KIRT is a manually-priced local commodity.
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
      { symbol: 'KIRT', kind: 'manual', providerId: null },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 } }),
    } as Response);

    const result = await service.refreshAll();

    // Only one fetch call; BTC is in the plan, KIRT is excluded.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('bitcoin');
    expect(calledUrl).not.toContain('kirt');
    expect(calledUrl).not.toContain('KIRT');

    // KIRT never appears in the failed list; BTC succeeds.
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.fetched).toBe(1);
    }
  });
});

describe('PriceService manual prices', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  const make = () =>
    new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });

  beforeEach(async () => {
    __resetPriceLockForTests();
    ctx = await setupTestDb('prices-manual-svc-');
    service = make();
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.restoreAllMocks();
  });

  const readPriceDb = async (userId: string) =>
    fs.readFile(path.join(getJournalDir(userId), 'price-db.ledger'), 'utf-8');

  it('emits a never-transacted manual symbol into price-db', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    const result = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'KIRT', price: 0.0000033 }],
    });
    expect(result).toEqual({ ok: true });
    const file = await readPriceDb('alice');
    expect(file).toContain('KIRT');
    expect(file).toContain('0.0000033');
    expect(file).toContain('2026/06/27 23:59:59');
  });

  it('normalizes $ to USD and rejects pricing a symbol in itself', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    const ok = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: '$',
      rows: [{ symbol: 'kirt', price: 2 }],
    });
    expect(ok).toEqual({ ok: true });
    expect(await readPriceDb('alice')).toContain('KIRT 2 USD');

    const bad = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'USD', price: 2 }],
    });
    expect(bad.ok).toBe(false);
  });

  it('manual rate beats a same-day fetched rate via end-of-day ordering', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    await new CommodityPriceRepository(ctx.db).insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 60000,
        fetchedAt: new Date('2026-06-27T12:00:00Z'),
        fetchedDate: '2026-06-27',
      },
    ]);
    await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'BTC', price: 65000 }],
    });
    const file = await readPriceDb('alice');
    // both lines present; the 23:59:59 manual line sorts after the 12:00:00 one
    const idxFetched = file.indexOf('60000');
    const idxManual = file.indexOf('65000');
    expect(idxFetched).toBeGreaterThan(-1);
    expect(idxManual).toBeGreaterThan(idxFetched);
  });

  it('deleteManualPrice removes the row and regenerates without it', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'KIRT', price: 3 }],
    });
    const row = (await service.listManualPrices('alice'))[0];
    expect(await service.deleteManualPrice('alice', row.id)).toBe(true);
    expect(await service.listManualPrices('alice')).toHaveLength(0);
    expect(await readPriceDb('alice')).not.toContain('KIRT');
  });

  it('deleteManualPrice returns false for a non-existent / unowned row', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    expect(await service.deleteManualPrice('alice', 999999)).toBe(false);
  });
});
