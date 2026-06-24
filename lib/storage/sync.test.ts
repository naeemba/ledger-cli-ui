import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { resetObjectStore } from './client';
import { pull, push, clearRemote } from './sync';
import { getJournalDir } from '@/lib/journal/layout';

const USER = 'sync-user';
afterEach(async () => {
  resetObjectStore();
  await fs.rm(getJournalDir(USER), { recursive: true, force: true });
});

describe('sync (memory backend via env default)', () => {
  it('push then pull round-trips through the configured store', async () => {
    await pull(USER); // empty
    const abs = path.join(getJournalDir(USER), 'main.ledger');
    await fs.writeFile(abs, 'data');
    await push(USER);
    await fs.rm(abs); // blow away local cache
    await pull(USER); // should restore from the store
    expect(await fs.readFile(abs, 'utf-8')).toBe('data');
  });

  it('clearRemote empties the user prefix', async () => {
    await pull(USER);
    await fs.writeFile(path.join(getJournalDir(USER), 'main.ledger'), 'd');
    await push(USER);
    await clearRemote(USER);
    await fs.rm(path.join(getJournalDir(USER), 'main.ledger'));
    const after = await pull(USER);
    // Empty remote → only the stable empty-set fingerprint, no restored file.
    await expect(
      fs.access(path.join(getJournalDir(USER), 'main.ledger'))
    ).rejects.toThrow();
    expect(after.fingerprint).toHaveLength(64);
  });
});
