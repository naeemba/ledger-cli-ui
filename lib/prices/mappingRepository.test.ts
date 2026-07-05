import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommodityMappingRepository } from './mappingRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('CommodityMappingRepository', () => {
  let ctx: TestDbContext;
  let repository: CommodityMappingRepository;

  const userId = 'alice';

  beforeEach(async () => {
    ctx = await setupTestDb('commodity-mapping-');
    await ctx.insertUser('alice', 'alice', 'alice@example.com');
    repository = new CommodityMappingRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('upserts a row and lists it back', async () => {
    await repository.upsert({
      userId,
      symbol: 'BTC',
      kind: 'crypto',
      providerId: 'bitcoin',
      source: 'auto',
    });

    const rows = await repository.listForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId,
      symbol: 'BTC',
      kind: 'crypto',
      providerId: 'bitcoin',
      source: 'auto',
    });

    const map = await repository.mapForUser(userId);
    expect(map.size).toBe(1);
    expect(map.get('BTC')).toMatchObject({ providerId: 'bitcoin' });
  });

  it('overwrites on conflict (userId, symbol), returning source="user"', async () => {
    await repository.upsert({
      userId,
      symbol: 'NIM',
      kind: 'crypto',
      providerId: 'nimiq',
      source: 'auto',
    });
    await repository.upsert({
      userId,
      symbol: 'NIM',
      kind: 'manual',
      providerId: null,
      source: 'user',
    });

    const map = await repository.mapForUser(userId);
    expect(map.size).toBe(1);
    expect(map.get('NIM')).toMatchObject({
      kind: 'manual',
      providerId: null,
      source: 'user',
    });
  });
});
