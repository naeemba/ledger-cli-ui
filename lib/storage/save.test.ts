import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { pullToLocal } from './download';
import { keyFor, readManifest } from './manifest';
import { MemoryObjectStore } from './memoryObjectStore';
import { StorageConflictError, pushFromLocal } from './save';
import { getJournalDir } from '@/lib/journal/layout';

const USER = 'push-user';
const dir = () => getJournalDir(USER);
const writeLocal = async (rel: string, content: string) => {
  const abs = path.join(dir(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
};
afterEach(() => fs.rm(dir(), { recursive: true, force: true }));

describe('pushFromLocal', () => {
  it('uploads new local files and records their etags in the manifest', async () => {
    const store = new MemoryObjectStore();
    await pullToLocal(store, USER); // empty remote → empty manifest
    await writeLocal('main.ledger', 'hello');
    await pushFromLocal(store, USER);
    const remote = await store.get(keyFor(USER, 'main.ledger'));
    expect(remote.body.toString()).toBe('hello');
    expect((await readManifest(USER))['main.ledger']).toBe(remote.etag);
  });

  it('deletes remote objects with no local counterpart', async () => {
    const store = new MemoryObjectStore();
    await store.put(keyFor(USER, 'old.ledger'), Buffer.from('x'));
    await pullToLocal(store, USER); // brings old.ledger local
    await fs.rm(path.join(dir(), 'old.ledger'));
    await writeLocal('main.ledger', 'new');
    await pushFromLocal(store, USER);
    expect((await store.list(keyFor(USER, ''))).map((e) => e.key)).toEqual([
      keyFor(USER, 'main.ledger'),
    ]);
  });

  it('throws StorageConflictError when remote changed since the pull', async () => {
    const store = new MemoryObjectStore();
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('v1'));
    await pullToLocal(store, USER);
    // Another writer changes the remote out from under us.
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('v2-elsewhere'));
    await writeLocal('main.ledger', 'v2-mine');
    await expect(pushFromLocal(store, USER)).rejects.toBeInstanceOf(
      StorageConflictError
    );
  });
});
