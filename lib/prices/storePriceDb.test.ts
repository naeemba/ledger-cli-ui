import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ManualPriceRepository } from './manualRepository';
import { CommodityMappingRepository } from './mappingRepository';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { storePriceDb } from './storePriceDb';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import {
  __resetSessionKeysForTest,
  dropSessionDek,
  hasSessionDek,
  setSessionDek,
} from '@/lib/crypto/sessionKeys';
import { GENERATED_PRICE_DB_NAME, getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import {
  getObjectStore,
  manifestRelName,
  pull,
  push,
  resetObjectStore,
} from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { runLedgerForUser } from '@/utils/runLedgerForUser';

// The real gate reads the crypto row through the app-wide database; the test
// database is separate, so the "has encryption" flag is set here instead.
let encrypted = false;
vi.mock('@/lib/crypto/gate', () => ({
  cryptoStatus: async (userId: string) =>
    !encrypted ? 'unset' : hasSessionDek(userId) ? 'ready' : 'locked',
}));

const JOURNAL =
  'commodity USD\n  format USD 1,000.00\n\n' +
  '2026/10/04 Google One\n  Assets:Receivable:Bashir  AUD 4.66\n  Assets:Bank\n';

const priceFileExists = (userId: string): Promise<boolean> =>
  fs
    .access(path.join(getJournalDir(userId), GENERATED_PRICE_DB_NAME))
    .then(() => true)
    .catch(() => false);

const AUD_PRICE = {
  date: '2026-10-03',
  quote: 'USD',
  rows: [{ symbol: 'AUD', price: 0.71 }],
};

describe('the generated price database survives a journal sync', () => {
  let ctx: TestDbContext;
  let service: PriceService;
  let journalRepo: JournalRepository;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('prices-store-');
    journalRepo = new JournalRepository(ctx.db);
    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo,
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });
    await ctx.insertUser('alice', 'alice', 'alice@example.com');
    const dir = getJournalDir('alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), JOURNAL, 'utf-8');
    await push('alice');
  });

  afterEach(async () => {
    encrypted = false;
    __resetSessionKeysForTest();
    vi.restoreAllMocks();
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  it('still converts with a manual price after the next page load pulls the journal', async () => {
    // Regression: the rebuilt price file was only written to disk. The next
    // pull deleted it (it was not in the store), ledger ran with no prices, and
    // a USD view of an AUD debt stayed in AUD.
    const result = await service.addManualPrices('alice', AUD_PRICE);
    expect(result).toEqual({ ok: true });

    await pull('alice');

    const stdout = await runLedgerForUser(
      'alice',
      ['balance', '-X', 'USD', '--format', '%(display_total)\n', 'Receivable'],
      journalRepo
    );
    expect(stdout.trim()).toBe('USD 3.31');
  });

  it('never uploads a locked encrypted journal in plaintext', async () => {
    // Unlock, sync, then Lock: the decrypted files stay on disk with the
    // manifest, so the pull downloads nothing and does not fail. Uploading
    // then would send those plaintext files over the ciphertext in storage.
    encrypted = true;
    setSessionDek('alice', randomBytes(32));
    await push('alice');
    await pull('alice');
    dropSessionDek('alice');

    const result = await service.addManualPrices('alice', AUD_PRICE);
    expect(result).toEqual({ ok: true });

    const { body } = await getObjectStore().get('journals/alice/main.ledger');
    expect(isCiphertext(body)).toBe(true);
    expect(await priceFileExists('alice')).toBe(true);
  });

  it('skips the upload when the user locks during the rebuild', async () => {
    encrypted = true;
    setSessionDek('alice', randomBytes(32));
    await push('alice');
    let listAfterLock: ReturnType<typeof vi.spyOn> | undefined;

    await storePriceDb('alice', async () => {
      const dir = getJournalDir('alice');
      await fs.writeFile(path.join(dir, GENERATED_PRICE_DB_NAME), 'P', 'utf-8');
      // The user clicks Lock after the price file is written.
      dropSessionDek('alice');
      listAfterLock = vi.spyOn(getObjectStore(), 'list');
    });

    expect(listAfterLock).not.toHaveBeenCalled();
    const { body } = await getObjectStore().get('journals/alice/main.ledger');
    expect(isCiphertext(body)).toBe(true);
  });

  it('still saves the price when the journal pull fails', async () => {
    // A fresh disk has no manifest, so a storage outage makes the pull throw.
    await fs.rm(path.join(getJournalDir('alice'), manifestRelName));
    vi.spyOn(getObjectStore(), 'list').mockRejectedValue(new Error('down'));

    const result = await service.addManualPrices('alice', AUD_PRICE);
    expect(result).toEqual({ ok: true });
    expect(await priceFileExists('alice')).toBe(true);
  });

  it('still saves the price when the upload fails', async () => {
    vi.spyOn(getObjectStore(), 'put').mockRejectedValue(new Error('conflict'));

    const result = await service.addManualPrices('alice', AUD_PRICE);
    expect(result).toEqual({ ok: true });
    expect(await priceFileExists('alice')).toBe(true);
  });
});
