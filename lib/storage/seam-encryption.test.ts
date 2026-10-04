import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pullToLocal } from './download';
import { keyFor, userPrefix } from './manifest';
import { MemoryObjectStore } from './memoryObjectStore';
import {
  pushFromLocal,
  storageFailureMessage,
  StorageConflictError,
} from './save';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import {
  __resetSessionKeysForTest,
  dropSessionDek,
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

  it('a Lock halfway through a push still uploads every file encrypted', async () => {
    const store = new MemoryObjectStore();
    const userId = 'dave';
    setSessionDek(userId, randomBytes(32));
    await writeLocal(userId, 'a.ledger', 'first secret');
    await writeLocal(userId, 'b.ledger', 'second secret');
    // The user clicks Lock right after the first file is uploaded.
    const put = store.put.bind(store);
    store.put = async (key, body) => {
      const result = await put(key, body);
      dropSessionDek(userId);
      return result;
    };

    await pushFromLocal(store, userId);

    for (const rel of ['a.ledger', 'b.ledger']) {
      const remote = await store.get(keyFor(userId, rel));
      expect(isCiphertext(remote.body)).toBe(true);
    }
  });

  it('refuses to push with no key over an encrypted journal', async () => {
    // Unlock, sync, then Lock: the decrypted file stays on disk with the
    // manifest. A save from a stale tab must not upload it in plaintext.
    const store = new MemoryObjectStore();
    const userId = 'erin';
    setSessionDek(userId, randomBytes(32));
    await writeLocal(userId, 'main.ledger', 'secret one');
    await pushFromLocal(store, userId);
    await pullToLocal(store, userId);
    dropSessionDek(userId);
    await writeLocal(userId, 'main.ledger', 'secret one and two');

    await expect(pushFromLocal(store, userId)).rejects.toBeInstanceOf(
      LockedError
    );
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(true);
  });

  it('a plaintext save checks only the start of each stored file', async () => {
    const store = new MemoryObjectStore();
    const userId = 'frank'; // no session DEK
    await writeLocal(userId, 'main.ledger', 'hello');
    await writeLocal(userId, 'empty.ledger', '');
    await pushFromLocal(store, userId);
    await pullToLocal(store, userId);
    await writeLocal(userId, 'main.ledger', 'hello again');
    const fullReads = vi.spyOn(store, 'get');
    const headReads = vi.spyOn(store, 'getHead');

    await pushFromLocal(store, userId);

    expect(fullReads).not.toHaveBeenCalled();
    // The empty file is skipped: it is too short to be ciphertext.
    expect(headReads).toHaveBeenCalledTimes(1);
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(remote.body.toString()).toBe('hello again');
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

describe('storageFailureMessage', () => {
  it('tells the user to unlock when the journal is locked', () => {
    expect(storageFailureMessage(new LockedError())).toBe(
      'Your journal is locked. Unlock it and try again.'
    );
  });

  it('passes a conflict message through and hides anything else', () => {
    const conflict = new StorageConflictError();
    expect(storageFailureMessage(conflict)).toBe(conflict.message);
    expect(storageFailureMessage(new Error('socket hang up'))).toBe(
      'Failed to save journal to storage.'
    );
  });
});
