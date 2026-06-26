import { describe, expect, it, vi } from 'vitest';
import type { AuditRepository } from './repository';
import { AuditService } from './service';

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
