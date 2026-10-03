import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebtShareRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('DebtShareRepository', () => {
  let context: TestDbContext;
  let repository: DebtShareRepository;

  beforeEach(async () => {
    context = await setupTestDb('debt-share-');
    await context.insertUser('alice');
    await context.insertUser('bob');
    repository = new DebtShareRepository(context.db);
  });

  afterEach(async () => {
    await teardownTestDb(context);
  });

  const row = (id: string, userId = 'alice') => ({
    id,
    userId,
    sealedMeta: 'meta',
    sealedPage: 'page',
  });

  it('creates, finds and lists by owner', async () => {
    await repository.create(row('s1'));
    await repository.create(row('s2', 'bob'));
    expect((await repository.findById('s1'))?.userId).toBe('alice');
    expect(await repository.findById('missing')).toBeNull();
    expect((await repository.listByUser('alice')).map((s) => s.id)).toEqual([
      's1',
    ]);
  });

  it('updates the page only for its owner', async () => {
    await repository.create(row('s1'));
    const later = new Date('2026-10-03T14:02:00Z');
    await repository.updatePage('bob', 's1', 'stolen', later);
    expect((await repository.findById('s1'))?.sealedPage).toBe('page');
    await repository.updatePage('alice', 's1', 'fresh', later);
    const share = await repository.findById('s1');
    expect(share?.sealedPage).toBe('fresh');
    expect(share?.updatedAt.toISOString()).toBe(later.toISOString());
  });

  it('deletes only the owner’s share and reports whether it existed', async () => {
    await repository.create(row('s1'));
    expect(await repository.delete('bob', 's1')).toBe(false);
    expect(await repository.delete('alice', 's1')).toBe(true);
    expect(await repository.findById('s1')).toBeNull();
  });

  it('deleteByUser removes every share of that user only', async () => {
    await repository.create(row('s1'));
    await repository.create(row('s2'));
    await repository.create(row('s3', 'bob'));
    await repository.deleteByUser('alice');
    expect(await repository.listByUser('alice')).toEqual([]);
    expect(await repository.listByUser('bob')).toHaveLength(1);
  });
});
