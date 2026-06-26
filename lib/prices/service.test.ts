import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BANNER_MARKER } from './formatter';
import { __resetPriceLockForTests } from './lock';
import { ManualPriceRepository } from './manualRepository';
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
    await service.deleteManualPrice('alice', row.id);
    expect(await service.listManualPrices('alice')).toHaveLength(0);
    expect(await readPriceDb('alice')).not.toContain('KIRT');
  });
});
