import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const buildZip = (
  entries: Array<{ name: string; content: string }>
): Buffer => {
  const zip = new AdmZip();
  for (const { name, content } of entries) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
};

describe('JournalService.replaceFromZip', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('zip-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    service = new JournalService(new JournalRepository(ctx.db));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  describe('detectMain', () => {
    it('picks main.ledger when present', async () => {
      const zip = buildZip([
        { name: 'main.ledger', content: '2024-01-01 a\n    A  USD 1\n    B\n' },
        {
          name: 'other.ledger',
          content: '2024-01-02 b\n    A  USD 2\n    B\n',
        },
      ]);
      const result = await service.replaceFromZip('test-user', zip);
      expect(result.mainFile).toBe('main.ledger');
    });

    it('picks ledger.ledger when main.ledger is absent', async () => {
      const zip = buildZip([
        { name: 'ledger.ledger', content: '' },
        { name: 'extra.ledger', content: '' },
      ]);
      const result = await service.replaceFromZip('test-user', zip);
      expect(result.mainFile).toBe('ledger.ledger');
    });

    it('falls back to the shallowest .ledger file when no preferred name matches', async () => {
      const zip = buildZip([
        { name: 'deep/nested/foo.ledger', content: '' },
        { name: 'shallow.ledger', content: '' },
      ]);
      const result = await service.replaceFromZip('test-user', zip);
      expect(result.mainFile).toBe('shallow.ledger');
    });

    it('skips price-db.ledger when picking a shallowest fallback', async () => {
      const zip = buildZip([
        { name: 'price-db.ledger', content: '' },
        { name: 'whatever.ledger', content: '' },
      ]);
      const result = await service.replaceFromZip('test-user', zip);
      expect(result.mainFile).toBe('whatever.ledger');
    });

    it('breaks shallow-depth ties alphabetically', async () => {
      const zip = buildZip([
        { name: 'b.ledger', content: '' },
        { name: 'a.ledger', content: '' },
      ]);
      const result = await service.replaceFromZip('test-user', zip);
      expect(result.mainFile).toBe('a.ledger');
    });
  });

  describe('path safety', () => {
    // Note: `adm-zip.addFile()` silently normalizes entry names — `../foo`
    // becomes `foo`, `a/../b` becomes `b`, `/etc/x` becomes `etc/x`. So we
    // can't construct a hostile zip through the same library that reads it.
    // The production guard in `replaceFromZip` (regex + `path.isAbsolute`
    // + `resolved.startsWith(dir + sep)` final check) is defense-in-depth
    // for zips built by other tools (`zip` CLI, Python's `zipfile`) that
    // don't normalize on write. Proper coverage would require checking in
    // a hand-crafted malicious zip fixture; tracked for Phase 7.

    it('a safe zip lands every file under the user journal directory', async () => {
      const zip = buildZip([
        { name: 'main.ledger', content: 'include ./sub/sub.ledger\n' },
        {
          name: 'sub/sub.ledger',
          content: '2024-01-01 a\n    A  USD 1\n    B\n',
        },
      ]);
      await service.replaceFromZip('test-user', zip);
      const dir = getJournalDir('test-user');
      expect(
        await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8')
      ).toContain('include ./sub/sub.ledger');
      expect(
        await fs.readFile(path.join(dir, 'sub', 'sub.ledger'), 'utf-8')
      ).toContain('2024-01-01 a');
    });
  });
});
