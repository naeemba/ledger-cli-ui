import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManualPriceRepository } from './manualRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('ManualPriceRepository', () => {
  let ctx: TestDbContext;
  let repo: ManualPriceRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('manual-price-');
    await ctx.insertUser('alice', 'alice', 'alice@example.com');
    repo = new ManualPriceRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('inserts and lists rows newest-first', async () => {
    await repo.upsertMany([
      {
        userId: 'alice',
        symbol: 'KIRT',
        quote: 'USD',
        price: 0.0000033,
        pricedAt: new Date('2026-01-01T23:59:59Z'),
      },
      {
        userId: 'alice',
        symbol: 'KIRT',
        quote: 'USD',
        price: 0.000004,
        pricedAt: new Date('2026-06-27T23:59:59Z'),
      },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows.map((r) => r.pricedAt.toISOString())).toEqual([
      '2026-06-27T23:59:59.000Z',
      '2026-01-01T23:59:59.000Z',
    ]);
  });

  it('upserts on (userId, symbol, quote, pricedAt) conflict', async () => {
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
    ]);
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 2, pricedAt: at },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(2);
  });

  it('collapses duplicate conflict keys within one batch (last-wins)', async () => {
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 5, pricedAt: at },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(5);
  });

  it('deleteForUser removes only the owner row', async () => {
    await ctx.insertUser('bob', 'bob', 'bob@example.com');
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
      { userId: 'bob', symbol: 'KIRT', quote: 'USD', price: 2, pricedAt: at },
    ]);
    const aliceRow = (await repo.listForUser('alice'))[0];
    expect(await repo.deleteForUser('bob', aliceRow.id)).toBe(false); // wrong owner → no-op
    expect(await repo.listForUser('alice')).toHaveLength(1);
    expect(await repo.deleteForUser('alice', aliceRow.id)).toBe(true);
    expect(await repo.listForUser('alice')).toHaveLength(0);
    expect(await repo.listForUser('bob')).toHaveLength(1);
  });
});
