import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pullToLocal } from './download';
import { keyFor, userPrefix } from './manifest';
import { MemoryObjectStore } from './memoryObjectStore';
import { pushFromLocal } from './save';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import {
  __resetSessionKeysForTest,
  LockedError,
  setSessionDek,
} from '@/lib/crypto/sessionKeys';
import { getJournalDir } from '@/lib/journal/layout';

let prevDataDir: string | undefined;
let tmp: string;

beforeEach(async () => {
  prevDataDir = process.env.DATA_DIR;
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'seam-enc-'));
  process.env.DATA_DIR = tmp;
});

afterEach(async () => {
  __resetSessionKeysForTest();
  if (prevDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prevDataDir;
  await fs.rm(tmp, { recursive: true, force: true });
});

const writeLocal = async (userId: string, rel: string, content: string) => {
  const abs = path.join(getJournalDir(userId), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
};

describe('storage seam encryption', () => {
  it('enabled user: push stores ciphertext, pull restores plaintext', async () => {
    const store = new MemoryObjectStore();
    const userId = 'alice';
    setSessionDek(userId, randomBytes(32)); // "enabled"
    const plaintext = '2026/01/01 Opening\n  Assets:Cash  $10\n';
    await writeLocal(userId, 'main.ledger', plaintext);

    await pushFromLocal(store, userId);

    // Remote object is ciphertext, not the plaintext.
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(true);
    expect(remote.body.toString()).not.toContain('Assets:Cash');

    // Wipe local, pull back, expect decrypted plaintext.
    await fs.rm(getJournalDir(userId), { recursive: true, force: true });
    await pullToLocal(store, userId);
    const restored = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf8'
    );
    expect(restored).toBe(plaintext);
  });

  it('not-enabled user: push stores plaintext (no behaviour change)', async () => {
    const store = new MemoryObjectStore();
    const userId = 'bob'; // no session DEK
    await writeLocal(userId, 'main.ledger', 'hello');
    await pushFromLocal(store, userId);
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(false);
    expect(remote.body.toString()).toBe('hello');
  });

  it('locked user: pulling ciphertext throws LockedError', async () => {
    const store = new MemoryObjectStore();
    const userId = 'carol';
    // Seed remote with ciphertext authored by an unlocked session.
    setSessionDek(userId, randomBytes(32));
    await writeLocal(userId, 'main.ledger', 'secret');
    await pushFromLocal(store, userId);
    // Now "lock" and wipe local cache.
    __resetSessionKeysForTest();
    await fs.rm(getJournalDir(userId), { recursive: true, force: true });

    await expect(pullToLocal(store, userId)).rejects.toBeInstanceOf(
      LockedError
    );
  });
});
