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
