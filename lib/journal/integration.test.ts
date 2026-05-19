import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { setupTestDb, teardownTestDb } from '@/lib/test-utils/db';

describe('Phase 4.1 integration', () => {
  it('parses → backfills → edits → deletes a real fixture', async () => {
    const src = path.resolve(__dirname, '__fixtures__/integration');
    const ctx = await setupTestDb('integration-');

    try {
      const { getJournalDir } = await import('@/lib/journals');
      const userId = 'integration-user';
      const dir = getJournalDir(userId);
      await fs.mkdir(dir, { recursive: true });

      for (const name of ['main.ledger', 'q1.ledger']) {
        await fs.copyFile(path.join(src, name), path.join(dir, name));
      }

      // Verify tab characters are preserved in the fixture
      const q1Content = await fs.readFile(path.join(dir, 'q1.ledger'));
      expect(Buffer.from(q1Content).includes(0x09)).toBe(true);

      const { backfillUids } = await import('./backfill');
      const { parseJournal } = await import('./parser');
      const { writeJournal } = await import('./write');

      const { uidsAdded } = await backfillUids(userId);
      expect(uidsAdded).toBe(2);

      const journal1 = await parseJournal(path.join(dir, 'main.ledger'));
      expect(journal1.transactions).toHaveLength(2);
      const lunch = journal1.transactions.find((t) => t.payee === 'lunch')!;
      expect(lunch.uid).not.toBeNull();

      const editResult = await writeJournal(userId, {
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

      const deleteResult = await writeJournal(userId, {
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
