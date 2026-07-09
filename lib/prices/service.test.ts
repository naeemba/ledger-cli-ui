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
import { normalizeCommoditySymbol } from './symbols';
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

  it('writes the per-user generated-prices.ledger with the banner + P lines', async () => {
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
      path.join(getJournalDir('alice'), 'generated-prices.ledger'),
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
      path.join(getJournalDir('alice'), 'generated-prices.ledger'),
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

  it('keeps both symbols in the plan when two symbols share one CoinGecko id', async () => {
    // BTC (alice) and XBT (bob) both map to the same CoinGecko id "bitcoin".
    // With provider-id-based dedup the second symbol would be silently dropped
    // and receive no commodity_price row. Symbol-based dedup fixes this.
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'USD'
    );
    await seedUser(
      ctx,
      'bob',
      '2026/01/01 Y\n  Assets:Cash  1 XBT\n  Income\n',
      'USD'
    );
    await seedMapping(ctx, 'alice', [
      { symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' },
    ]);
    await seedMapping(ctx, 'bob', [
      { symbol: 'XBT', kind: 'crypto', providerId: 'bitcoin' },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ bitcoin: { usd: 60000 } }),
    } as Response);

    const result = await service.refreshAll();

    // Both BTC and XBT must receive a price row (fetched === 2), not just the
    // first symbol encountered. Only one HTTP request is made because the
    // provider deduplicates CoinGecko ids internally.
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.fetched).toBe(2);
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
    fs.readFile(
      path.join(getJournalDir(userId), 'generated-prices.ledger'),
      'utf-8'
    );

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

describe('PriceService known-price reads', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-known-');
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
  });

  it('lists held commodities including the base symbol', async () => {
    await seedUser(
      ctx,
      'u-comm',
      [
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const held = await service.listHeldCommodities('u-comm');
    expect(held).toContain('BTC');
    expect(held).toContain('$');
  });

  it('returns ascending price points for a held commodity', async () => {
    await seedUser(
      ctx,
      'u-hist',
      [
        'P 2026-01-01 BTC $40000',
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const points = await service.listPriceHistory('u-hist', 'BTC');
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)).toEqual({
      date: '2026-06-15',
      price: 50000,
      quote: '$',
    });
  });

  it('treats a flag-like symbol as an inert query, not a ledger flag', async () => {
    await seedUser(
      ctx,
      'u-inject',
      [
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const points = await service.listPriceHistory('u-inject', '--version');
    expect(points).toEqual([]);
  });
});

describe('PriceService.listKnownPrices', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-list-');
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
  });

  it('reports latest price, base row, and journal source', async () => {
    await seedUser(
      ctx,
      'u-known',
      [
        'P 2026-01-01 BTC $40000',
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto        1 BTC @ $40000',
        '    Assets:Metal         2 GOLD @ $10',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPrices('u-known');
    const bySymbol = Object.fromEntries(rows.map((r) => [r.symbol, r]));

    // BTC: latest journal price, denominated in $.
    expect(bySymbol.BTC.price).toBe(50000);
    expect(bySymbol.BTC.date).toBe('2026-06-15');
    expect(bySymbol.BTC.source).toBe('journal');
    expect(bySymbol.BTC.stale).toBe(true); // 2026-06-15 is well over 7 days old

    // GOLD held with a cost → has a price row.
    expect(bySymbol.GOLD.price).toBe(10);

    // Base currency row synthesized.
    expect(bySymbol['$'].source).toBe('base');
    expect(bySymbol['$'].price).toBe(1);
    expect(bySymbol['$'].stale).toBe(false);
  });

  it('labels a fetched price as fetched', async () => {
    await seedUser(
      ctx,
      'u-fetch',
      [
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    // Record a fetched price on the same day/value as the latest known price.
    await new CommodityPriceRepository(ctx.db).insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 50000,
        fetchedAt: new Date('2026-06-15T00:00:00Z'),
        fetchedDate: '2026-06-15',
      },
    ]);
    const rows = await service.listKnownPrices('u-fetch');
    const btc = rows.find((r) => r.symbol === 'BTC');
    expect(btc?.source).toBe('fetched');
  });

  it('labels a manual price as manual', async () => {
    // Posting and P directive on the same date so latestGenuinePrice returns
    // that date, which then matches the manual key (BTC|USD|2026-06-15).
    await seedUser(
      ctx,
      'u-manual',
      [
        'P 2026-06-15 BTC $50000',
        '2026-06-15 buy',
        '    Assets:Crypto   1 BTC @ $50000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    await new ManualPriceRepository(ctx.db).upsertMany([
      {
        userId: 'u-manual',
        symbol: 'BTC',
        quote: 'USD',
        price: 50000,
        pricedAt: new Date('2026-06-15T00:00:00Z'),
      },
    ]);
    const rows = await service.listKnownPrices('u-manual');
    const btc = rows.find((r) => r.symbol === 'BTC');
    expect(btc?.source).toBe('manual');
  });

  it('returns a gap row for a held commodity with no price', async () => {
    // WIDGET appears in commodities but has no P directive, so ledger prices
    // WIDGET returns nothing → the service emits a gap row.
    await seedUser(
      ctx,
      'u-gap',
      [
        '2026-01-02 open',
        '    Assets:Stuff   5 WIDGET',
        '    Assets:Stuff  -5 WIDGET',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPrices('u-gap');
    const widget = rows.find((r) => r.symbol === 'WIDGET');
    expect(widget).toBeDefined();
    expect(widget?.price).toBeNull();
    expect(widget?.source).toBe('none');
  });

  it('surfaces the fresh base-quote price over a stale cross-quote cost', async () => {
    // Mirrors real data: BTC carries fresh `$` fetch prices plus a lone,
    // stale `@@ DAI` cost annotation from an old posting. `ledger prices BTC`
    // lists the DAI run last (DAI sorts after `$`), but the current price is
    // the fresh dollar one — it must not be shadowed by the stale DAI figure.
    await seedUser(
      ctx,
      'u-multiquote',
      [
        'P 2026-07-06 BTC $64174',
        'P 2026-07-09 BTC $62513',
        '2025-01-20 old buy',
        '    Assets:Crypto   0.05 BTC @@ 5371.20 DAI',
        '    Assets:Cash',
        '2026-07-10 hold',
        '    Assets:Crypto   1 BTC',
        '    Equity        -1 BTC',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPrices('u-multiquote');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.price).toBe(62513);
    expect(normalizeCommoditySymbol(btc?.quote ?? '')).toBe('USD');
    expect(btc?.date).toBe('2026-07-09');
  });

  it('dates staleness from when the price was set, not a later posting', async () => {
    await seedUser(
      ctx,
      'u-stale',
      [
        // BTC's only genuine price is set 2026-01-01. A later 2026-07-01 posting
        // transacts BTC at the same (forward-carried) price — it must NOT be
        // read as the "latest" price date.
        'P 2026-01-01 BTC $40000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '2026-07-01 buy more',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPrices('u-stale');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.date).toBe('2026-01-01');
    expect(btc?.price).toBe(40000);
    expect(btc?.stale).toBe(true);
  });
});

describe('PriceService.listKnownPricesInBase', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-base-');
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
  });

  it('values held commodities into the base via ledger cross-rate chains', async () => {
    await seedUser(
      ctx,
      'u-base',
      [
        'P 2026-07-01 DAI 1 USD',
        'P 2026-07-01 BTC 100 DAI',
        'P 2026-07-01 KIRT 2 USD',
        'P 2026-07-01 Nim 10 KIRT',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 BTC',
        '  Equity    -1 BTC',
        '',
        '2026-07-02 * hold',
        '  Assets:B   1 Nim',
        '  Equity    -1 Nim',
        '',
        '2026-07-02 * hold',
        '  Assets:E   1 XOF',
        '  Equity    -1 XOF',
        '',
        '2026-07-02 * hold',
        '  Assets:F   1 USD',
        '  Equity    -1 USD',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-base');
    const bySymbol = Object.fromEntries(rows.map((r) => [r.symbol, r]));

    // BTC = 100 DAI * 1 USD/DAI = 100 USD (chained BTC->DAI->USD).
    expect(bySymbol.BTC.price).toBeCloseTo(100, 6);
    expect(bySymbol.BTC.quote).toBe('USD');
    // Provenance / recency carried over from the raw row (keep-raw).
    expect(bySymbol.BTC.source).toBe('journal');
    expect(bySymbol.BTC.date).toBe('2026-07-01');
    // ageDays / stale must match the original-quote view exactly. Comparing
    // against listKnownPrices keeps the guard independent of the run date.
    const rawRows = await service.listKnownPrices('u-base');
    const rawBtc = rawRows.find((row) => row.symbol === 'BTC');
    expect(bySymbol.BTC.ageDays).toBe(rawBtc?.ageDays);
    expect(bySymbol.BTC.stale).toBe(rawBtc?.stale);

    // Nim = 10 KIRT * 2 USD/KIRT = 20 USD (chained Nim->KIRT->USD).
    expect(bySymbol.Nim.price).toBeCloseTo(20, 6);
    expect(bySymbol.Nim.quote).toBe('USD');

    // XOF has no path to USD → no price.
    expect(bySymbol.XOF.price).toBeNull();
    expect(bySymbol.XOF.quote).toBeNull();

    // Base row untouched. Identify it by its stable `base` source, and assert
    // the symbol only after normalizing — ledger prints the held base holding
    // as `$` on 3.4.x but `USD` on older apt builds, so a literal `$` would be
    // build-specific.
    const baseRow = rows.find((row) => row.source === 'base');
    expect(baseRow).toBeDefined();
    expect(normalizeCommoditySymbol(baseRow!.symbol)).toBe('USD');
    expect(baseRow?.price).toBe(1);
    expect(baseRow?.quote).toBe('USD');
  });

  it('values a dollar-denominated holding via the injected $=USD bridge', async () => {
    // The common journal convention prices in `$`, which ledger will not bridge
    // to a `USD` base on its own. The probe's injected `$` = 1 USD directive
    // must let the value resolve instead of reporting "no price".
    await seedUser(
      ctx,
      'u-dollar',
      [
        'P 2026-07-01 BTC $40000',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 BTC',
        '  Equity    -1 BTC',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-dollar');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.price).toBeCloseTo(40000, 6);
    expect(btc?.quote).toBe('USD');
  });

  it('reports the fresh base valuation, dated from the raw base-quote row', async () => {
    // Mirrors prod: BTC carries a fresh `$` fetch price plus a stale `@@ DAI`
    // cost annotation. The base valuation reports the fresh price; its date and
    // recency ride along from the raw base-quote row (freshest `$` run), so the
    // row reads fresh — not stale from the 2025 cost. (Ledger exposes no date
    // for the price it selected, so the date is sourced from `ledger prices`.)
    await seedUser(
      ctx,
      'u-valuedate',
      [
        'P 2026-07-06 BTC $64174',
        'P 2026-07-09 BTC $62513',
        '2025-01-20 old buy',
        '    Assets:Crypto   0.05 BTC @@ 5371.20 DAI',
        '    Assets:Cash',
        '2026-07-10 hold',
        '    Assets:Crypto   1 BTC',
        '    Equity        -1 BTC',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPricesInBase('u-valuedate', 'USD');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.price).toBe(62513);
    expect(btc?.quote).toBe('USD');
    // Date is the freshest base-quote price date, not the stale 2025 DAI cost.
    expect(btc?.date).toBe('2026-07-09');
  });

  it('values a digit-bearing ticker that ledger surfaces quoted', async () => {
    // A digit-bearing commodity like `1INCH` is only legal double-quoted in a
    // journal, and `ledger commodities` prints it back with the quotes intact
    // (`"1INCH"`). The probe must strip the surrounding pair and re-quote the
    // bare name, otherwise the holding is silently reported as having no price
    // even though it converts cleanly to the base.
    await seedUser(
      ctx,
      'u-digit',
      [
        'P 2026-07-01 "1INCH" 3 USD',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 "1INCH"',
        '  Equity    -1 "1INCH"',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-digit');
    // `ledger commodities` keeps the surrounding quotes, so the row identity is
    // the quoted form.
    const inch = rows.find((row) => row.symbol === '"1INCH"');
    expect(inch?.price).toBeCloseTo(3, 6);
    expect(inch?.quote).toBe('USD');
  });

  it('values into a non-USD target currency (respects the selector)', async () => {
    // BTC is priced in USD and EUR itself is priced in USD; `-X EUR` inverts the
    // EUR/USD leg to reach the target. 1 BTC = 40000 USD / 1.10 USD-per-EUR.
    await seedUser(
      ctx,
      'u-eur',
      [
        'P 2026-07-01 BTC 40000 USD',
        'P 2026-07-01 EUR 1.10 USD',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 BTC',
        '  Equity    -1 BTC',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-eur', 'EUR');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.price).toBeCloseTo(40000 / 1.1, 1);
    expect(btc?.quote).toBe('EUR');
  });

  it('values a dollar-denominated holding into a non-USD target via the bridge', async () => {
    // The exact interaction the removed `base === 'USD'` gate unlocks: a `$`
    // -priced holding reaching a non-USD target. BTC is priced in `$` (not the
    // `USD` literal), so it only reaches the `USD` pricing base through the
    // injected `$` = 1 USD bridge; EUR is then priced in USD, so `-X EUR`
    // inverts that leg. 1 BTC = 40000 $ -> 40000 USD / 1.10 USD-per-EUR.
    await seedUser(
      ctx,
      'u-dollar-eur',
      [
        'P 2026-07-01 BTC $40000',
        'P 2026-07-01 EUR 1.10 USD',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 BTC',
        '  Equity    -1 BTC',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-dollar-eur', 'EUR');
    const btc = rows.find((row) => row.symbol === 'BTC');
    expect(btc?.price).toBeCloseTo(40000 / 1.1, 1);
    expect(btc?.quote).toBe('EUR');
  });

  it('normalizes a mixed-case target so it does not null every row', async () => {
    // getBaseCurrency can return a currency in any case (e.g. `Kirt`). Held
    // symbols and ledger output are normalized (uppercased), so the target must
    // be too — otherwise `=== base` never matches and every row is "no price".
    // ADA priced in USD, KIRT priced in USD → ADA = 0.169753 / 0.00568182 KIRT.
    await seedUser(
      ctx,
      'u-kirt',
      [
        'P 2026-07-06 ADA 0.169753 USD',
        'P 2026-07-07 KIRT 0.00568182 USD',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 ADA',
        '  Equity    -1 ADA',
        '',
        '2026-07-02 * hold',
        '  Assets:K   1 KIRT',
        '  Equity    -1 KIRT',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-kirt', 'Kirt');
    const ada = rows.find((row) => row.symbol === 'ADA');
    expect(ada?.price).toBeCloseTo(0.169753 / 0.00568182, 2);
    expect(ada?.quote).toBe('KIRT');
    // The target itself is the base row: valued in itself at 1.
    const kirt = rows.find((row) => row.symbol === 'KIRT');
    expect(kirt?.price).toBe(1);
  });
});
