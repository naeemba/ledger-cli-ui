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
});
