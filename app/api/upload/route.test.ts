import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const replaceFromSingleFileMock = vi.fn();
const replaceFromZipMock = vi.fn();
const regenerateUserPriceDbMock = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, resetAt: Date.now() + 60_000 }),
  UPLOAD: { name: 'upload', max: 10, windowMs: 60_000 },
}));
vi.mock('@/lib/audit', () => ({
  auditService: { record: vi.fn(async () => undefined) },
  auditRequestMeta: vi.fn(async () => ({})),
}));
vi.mock('@/lib/journal/quota', () => ({
  journalQuotaMb: () => 50,
  getJournalDirSize: vi.fn(async () => 0),
}));
vi.mock('@/lib/journal', () => ({
  journalService: {
    replaceFromSingleFile: (...args: unknown[]) =>
      replaceFromSingleFileMock(...args),
    replaceFromZip: (...args: unknown[]) => replaceFromZipMock(...args),
  },
}));
vi.mock('@/lib/prices', () => ({
  priceService: {
    regenerateUserPriceDb: (...args: unknown[]) =>
      regenerateUserPriceDbMock(...args),
  },
}));

const upload = (name: string) => {
  const data = new FormData();
  data.set('file', new File(['2026/01/01 Payee\n'], name));
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: data,
  }) as unknown as Parameters<typeof POST>[0];
};

beforeEach(() => {
  replaceFromSingleFileMock.mockResolvedValue({ uidsAdded: 0 });
  replaceFromZipMock.mockResolvedValue({
    mainFile: 'main.ledger',
    fileCount: 1,
    uidsAdded: 0,
  });
  regenerateUserPriceDbMock.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/upload rebuilds the price database', () => {
  // An import wipes the journal folder and its generated price file. Without a
  // rebuild, a USD view of a foreign-currency balance stays unconverted.
  it('after a single-file import', async () => {
    const response = await POST(upload('main.ledger'));
    expect(response.status).toBe(200);
    expect(regenerateUserPriceDbMock).toHaveBeenCalledWith('alice');
    expect(
      regenerateUserPriceDbMock.mock.invocationCallOrder[0]
    ).toBeGreaterThan(replaceFromSingleFileMock.mock.invocationCallOrder[0]);
  });

  it('after a zip import', async () => {
    const response = await POST(upload('journal.zip'));
    expect(response.status).toBe(200);
    expect(regenerateUserPriceDbMock).toHaveBeenCalledWith('alice');
    expect(
      regenerateUserPriceDbMock.mock.invocationCallOrder[0]
    ).toBeGreaterThan(replaceFromZipMock.mock.invocationCallOrder[0]);
  });

  it('still reports the import as done when the rebuild fails', async () => {
    regenerateUserPriceDbMock.mockRejectedValue(new Error('storage down'));
    const response = await POST(upload('main.ledger'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it('does not rebuild when the import is over quota', async () => {
    replaceFromSingleFileMock.mockResolvedValue({
      uidsAdded: 0,
      quotaExceeded: true,
    });
    const response = await POST(upload('main.ledger'));
    expect(response.status).toBe(413);
    expect(regenerateUserPriceDbMock).not.toHaveBeenCalled();
  });
});
