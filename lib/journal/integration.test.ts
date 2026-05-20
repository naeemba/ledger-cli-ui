import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { getJournalDir } from './layout';
import { parseJournal } from './parser';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import * as schema from '@/db/schema';
import { setupTestDb, teardownTestDb } from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

describe('Phase 4.1 integration', () => {
  it('parses → backfills → edits → deletes a real fixture', async () => {
    const src = path.resolve(__dirname, '__fixtures__/integration');
    const ctx = await setupTestDb('integration-');

    try {
      ctx.sqlite
        .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
        .run('integration-user', 'Integration', 'integration@example.com');
      const db = drizzle(ctx.sqlite, { schema });
      const service = new JournalService(new JournalRepository(db));

      const userId = 'integration-user';
      const dir = getJournalDir(userId);
      await fs.mkdir(dir, { recursive: true });

      for (const name of ['main.ledger', 'q1.ledger']) {
        await fs.copyFile(path.join(src, name), path.join(dir, name));
      }

      const q1Content = await fs.readFile(path.join(dir, 'q1.ledger'));
      expect(Buffer.from(q1Content).includes(0x09)).toBe(true);

      const { uidsAdded } = await service.backfillUids(userId);
      expect(uidsAdded).toBe(2);

      const journal1 = await parseJournal(path.join(dir, 'main.ledger'));
      expect(journal1.transactions).toHaveLength(2);
      const lunch = journal1.transactions.find((t) => t.payee === 'lunch')!;
      expect(lunch.uid).not.toBeNull();

      const editResult = await service.editTransaction(userId, {
        kind: 'edit',
        uid: lunch.uid!,
        expectedFingerprint: lunch.fingerprint,
        draft: {
          date: lunch.date,
          payee: 'lunch v2',
          status: 'none',
          uid: lunch.uid!,
          postings: lunch.postings,
        },
      });
      expect(editResult.ok).toBe(true);

      const journal2 = await parseJournal(path.join(dir, 'main.ledger'));
      const lunchV2 = journal2.transactions.find((t) => t.payee === 'lunch v2');
      expect(lunchV2).toBeDefined();
      expect(lunchV2!.uid).toBe(lunch.uid);

      const deleteResult = await service.deleteTransaction(userId, {
        kind: 'delete',
        uid: lunchV2!.uid!,
        expectedFingerprint: lunchV2!.fingerprint,
      });
      expect(deleteResult.ok).toBe(true);

      const journal3 = await parseJournal(path.join(dir, 'main.ledger'));
      expect(
        journal3.transactions.find((t) => t.payee === 'lunch v2')
      ).toBeUndefined();
    } finally {
      await teardownTestDb(ctx);
    }
  });
});
