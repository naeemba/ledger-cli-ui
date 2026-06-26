import { describe, expect, it, vi } from 'vitest';
import type { AuditRepository } from './repository';
import { AuditService, type ActivityType } from './service';

const okRepo = () =>
  ({
    insert: vi.fn().mockResolvedValue({ id: 'x' }),
  }) as unknown as AuditRepository;

describe('AuditService.record', () => {
  it('forwards a valid event to the repository', async () => {
    const repo = okRepo();
    const svc = new AuditService(repo);
    await svc.record('alice', { action: 'tx.add', result: 'success' });
    expect(repo.insert).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ action: 'tx.add' })
    );
  });

  it('never throws when the repository insert rejects (best-effort)', async () => {
    const repo = {
      insert: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as AuditRepository;
    const svc = new AuditService(repo);
    await expect(
      svc.record('alice', { action: 'tx.add', result: 'success' })
    ).resolves.toBeUndefined();
  });

  it('never throws (and does not insert) when the event is invalid', async () => {
    const repo = okRepo();
    const svc = new AuditService(repo);
    await expect(
      // @ts-expect-error invalid action on purpose
      svc.record('alice', { action: 'nope', result: 'success' })
    ).resolves.toBeUndefined();
    expect(repo.insert).not.toHaveBeenCalled();
  });
});

describe('AuditService.listForUser', () => {
  const listRepo = () =>
    ({
      listByUser: vi.fn().mockResolvedValue([]),
    }) as unknown as AuditRepository;

  it('translates type=security to the crypto.* actions', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    await svc.listForUser('alice', { type: 'security' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        actions: expect.arrayContaining(['crypto.unlock', 'crypto.reset']),
      })
    );
  });

  it('translates type=transactions to tx.* and omits actions for all', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    await svc.listForUser('alice', { type: 'transactions' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ actions: ['tx.add', 'tx.edit', 'tx.delete'] })
    );

    repo.listByUser = vi.fn().mockResolvedValue([]);
    await svc.listForUser('alice', { type: 'all' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ actions: undefined })
    );
  });

  it('normalizes result=all to no result filter, forwards cursor + limit', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    const before = { id: '01KW2SBP2HX0HR2QGZ7QEGD50D' };
    await svc.listForUser('alice', { result: 'all', limit: 51, before });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ result: undefined, limit: 51, before })
    );

    repo.listByUser = vi.fn().mockResolvedValue([]);
    await svc.listForUser('alice', { result: 'failure' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ result: 'failure' })
    );
  });
});
