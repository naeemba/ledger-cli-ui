import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from '@/lib/audit';
import { AuditService } from '@/lib/audit/service';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('audit recording for journal mutations', () => {
  let ctx: TestDbContext;
  let svc: AuditService;

  beforeEach(async () => {
    ctx = await setupTestDb('audit-tx-');
    await ctx.insertUser('alice');
    svc = new AuditService(new AuditRepository(ctx.db));
  });
  afterEach(async () => teardownTestDb(ctx));

  it('records add/edit/delete with byte deltas', async () => {
    await svc.record('alice', {
      action: 'tx.add',
      result: 'success',
      bytesBefore: 0,
      bytesAfter: 120,
      targetUid: 'U1',
    });
    await svc.record('alice', {
      action: 'tx.edit',
      result: 'success',
      bytesBefore: 120,
      bytesAfter: 130,
      targetUid: 'U1',
    });
    await svc.record('alice', {
      action: 'tx.delete',
      result: 'success',
      bytesBefore: 130,
      bytesAfter: 0,
      targetUid: 'U1',
    });
    const repo = new AuditRepository(ctx.db);
    const rows = await repo.listByUser('alice');
    expect(rows.map((r) => r.action).sort()).toEqual([
      'tx.add',
      'tx.delete',
      'tx.edit',
    ]);
  });
});
