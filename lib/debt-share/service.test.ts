import { randomBytes } from 'crypto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { sharedDebtPageSchema } from './payload';
import { DebtShareRepository } from './repository';
import { derivePageKey, unseal } from './seal';
import { DebtShareService } from './service';
import { LockedError } from '@/lib/crypto/sessionKeys';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const ROWS = '\x1e2026-01-01\x1f-200.00 EUR\x1f-200.00 EUR\x1fLent cash\n';
const NET = 'EUR\n\x1e-200\x1fEUR\x1f200.00 EUR\n';

describe('DebtShareService', () => {
  let context: TestDbContext;
  let repository: DebtShareRepository;
  let dek: Buffer | undefined;
  let runLedger: Mock<(userId: string, args: string[]) => Promise<string>>;
  let service: DebtShareService;
  const now = new Date('2026-10-03T14:02:00Z');

  beforeEach(async () => {
    context = await setupTestDb('debt-share-service-');
    await context.insertUser('alice');
    repository = new DebtShareRepository(context.db);
    dek = randomBytes(32);
    runLedger = vi.fn(async (_userId: string, args: string[]) =>
      args.includes('--group-by') ? NET : ROWS
    );
    service = new DebtShareService({
      repository,
      runLedger,
      getDek: () => dek,
      now: () => now,
    });
  });

  afterEach(async () => {
    await teardownTestDb(context);
  });

  const openPage = async (shareId: string, key: string) => {
    const share = await repository.findById(shareId);
    return sharedDebtPageSchema.parse(
      JSON.parse(
        unseal(Buffer.from(key, 'base64url'), shareId, share!.sealedPage)
      )
    );
  };

  it('create seals a page the link key opens, and hides the person from the row', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    expect(link.key).toBe(
      derivePageKey(dek!, link.shareId).toString('base64url')
    );
    const page = await openPage(link.shareId, link.key);
    expect(page).toMatchObject({
      ownerName: 'Naeem',
      person: 'Bashir',
      net: [{ amount: '200.00 EUR', direction: 'viewer-owes' }],
      rows: [{ date: '2026-01-01', payee: 'Lent cash' }],
      generatedAt: now.toISOString(),
    });
    const stored = await repository.findById(link.shareId);
    expect(JSON.stringify(stored)).not.toContain('Bashir');
  });

  it('create returns the existing link for an already-shared person', async () => {
    const first = await service.create('alice', 'Bashir', 'Naeem');
    const second = await service.create('alice', 'Bashir', 'Someone');
    expect(second.shareId).toBe(first.shareId);
    expect(await repository.listByUser('alice')).toHaveLength(1);
  });

  it('linkFor and sharedPeople find the share; revoke removes it for good', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    expect((await service.linkFor('alice', 'Bashir'))?.shareId).toBe(
      link.shareId
    );
    expect(await service.linkFor('alice', 'Bob')).toBeNull();
    expect([...(await service.sharedPeople('alice'))]).toEqual(['Bashir']);
    expect(await service.revoke('alice', link.shareId)).toBe(true);
    expect(await service.linkFor('alice', 'Bashir')).toBeNull();
    expect(await repository.findById(link.shareId)).toBeNull();
  });

  it('refresh rebuilds each page with the latest ledger output', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    runLedger.mockImplementation(async (_userId: string, args: string[]) =>
      args.includes('--group-by') ? 'EUR\n\x1e-50\x1fEUR\x1f50.00 EUR\n' : ROWS
    );
    await service.refresh('alice');
    expect((await openPage(link.shareId, link.key)).net).toEqual([
      { amount: '50.00 EUR', direction: 'viewer-owes' },
    ]);
  });

  it('refresh keeps the previous page when ledger fails, and does not throw', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    const before = (await repository.findById(link.shareId))!.sealedPage;
    runLedger.mockRejectedValue(new Error('ledger broke'));
    await expect(service.refresh('alice')).resolves.toBeUndefined();
    expect((await repository.findById(link.shareId))!.sealedPage).toBe(before);
  });

  it('is inert while locked: refresh and sharedPeople do nothing, create throws', async () => {
    await service.create('alice', 'Bashir', 'Naeem');
    runLedger.mockClear();
    dek = undefined;
    await service.refresh('alice');
    expect(runLedger).not.toHaveBeenCalled();
    expect((await service.sharedPeople('alice')).size).toBe(0);
    await expect(
      service.create('alice', 'Bob', 'Naeem')
    ).rejects.toBeInstanceOf(LockedError);
  });
});
