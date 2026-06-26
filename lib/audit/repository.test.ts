import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from './repository';
import type { AuditEvent } from './schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const event: AuditEvent = {
  action: 'tx.add',
  result: 'success',
  targetUid: '01HSAMPLEULID00000000000000',
  bytesBefore: 100,
  bytesAfter: 180,
  detail: { source: 'form' },
};

describe('AuditRepository', () => {
  let ctx: TestDbContext;
  let repo: AuditRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('audit-');
    await ctx.insertUser('alice');
    await ctx.insertUser('bob');
    repo = new AuditRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('insert returns a row with a ULID id and the given fields', async () => {
    const row = await repo.insert('alice', event);
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.userId).toBe('alice');
    expect(row.action).toBe('tx.add');
    expect(row.result).toBe('success');
    expect(row.bytesBefore).toBe(100);
    expect(row.bytesAfter).toBe(180);
    expect(row.detail).toEqual({ source: 'form' });
  });

  it('listByUser returns only that user rows, newest first', async () => {
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'tx.delete', result: 'success' });
    await repo.insert('bob', { action: 'tx.add', result: 'success' });
    const rows = await repo.listByUser('alice');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === 'alice')).toBe(true);
  });

  it('listByUser paginates with an id keyset cursor (no overlap, full coverage)', async () => {
    // ULID ids form a stable, unique total order, so desc(id) keyset
    // pagination must cover every row exactly once with no gap or repeat.
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'tx.edit', result: 'success' });
    await repo.insert('alice', { action: 'tx.delete', result: 'success' });

    const all = await repo.listByUser('alice');
    // Rows come back ordered by id descending.
    const idsDesc = [...all.map((r) => r.id)].sort().reverse();
    expect(all.map((r) => r.id)).toEqual(idsDesc);

    const page1 = await repo.listByUser('alice', { limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page1).toEqual(all.slice(0, 2));

    const page2 = await repo.listByUser('alice', {
      limit: 2,
      before: { id: page1[1].id },
    });
    expect(page2).toHaveLength(1);
    expect(page2[0].id).toBe(all[2].id);

    // The two pages together cover all rows with no overlap.
    const seen = [...page1, ...page2].map((r) => r.id);
    expect(new Set(seen).size).toBe(3);
    expect(seen).toEqual(all.map((r) => r.id));
  });

  it('listByUser filters by actions and result', async () => {
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'crypto.unlock', result: 'success' });
    await repo.insert('alice', { action: 'crypto.unlock', result: 'failure' });

    const crypto = await repo.listByUser('alice', {
      actions: ['crypto.unlock', 'crypto.lock'],
    });
    expect(crypto).toHaveLength(2);
    expect(crypto.every((r) => r.action === 'crypto.unlock')).toBe(true);

    const failures = await repo.listByUser('alice', { result: 'failure' });
    expect(failures).toHaveLength(1);
    expect(failures[0].result).toBe('failure');
  });
});
