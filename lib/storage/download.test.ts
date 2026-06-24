import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { pullToLocal } from './download';
import { keyFor, readManifest } from './manifest';
import { MemoryObjectStore } from './memoryObjectStore';
import type { ObjectStore } from './objectStore';
import { getJournalDir } from '@/lib/journal/layout';

const USER = 'pull-user';
const dir = () => getJournalDir(USER);
const read = (rel: string) => fs.readFile(path.join(dir(), rel), 'utf-8');
afterEach(() => fs.rm(dir(), { recursive: true, force: true }));

const seed = async (
  store: MemoryObjectStore,
  files: Record<string, string>
) => {
  for (const [rel, content] of Object.entries(files)) {
    await store.put(keyFor(USER, rel), Buffer.from(content));
  }
};

describe('pullToLocal', () => {
  it('downloads all remote files and writes a manifest', async () => {
    const store = new MemoryObjectStore();
    await seed(store, {
      'main.ledger': 'include ./sub.ledger\n',
      'sub.ledger': 'x',
    });
    const { fingerprint } = await pullToLocal(store, USER);
    expect(await read('main.ledger')).toBe('include ./sub.ledger\n');
    expect(await read('sub.ledger')).toBe('x');
    expect(Object.keys(await readManifest(USER)).sort()).toEqual([
      'main.ledger',
      'sub.ledger',
    ]);
    expect(fingerprint).toHaveLength(64);
  });

  it('removes local files no longer present remotely', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'a', 'gone.ledger': 'b' });
    await pullToLocal(store, USER);
    await store.delete(keyFor(USER, 'gone.ledger'));
    await pullToLocal(store, USER);
    await expect(read('gone.ledger')).rejects.toThrow();
    expect(await read('main.ledger')).toBe('a');
  });

  it('changes the fingerprint when remote content changes', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'a' });
    const first = (await pullToLocal(store, USER)).fingerprint;
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('b'));
    const second = (await pullToLocal(store, USER)).fingerprint;
    expect(second).not.toBe(first);
    expect(await read('main.ledger')).toBe('b');
  });

  it('returns a stable fingerprint for an empty remote (new user)', async () => {
    const store = new MemoryObjectStore();
    const { fingerprint } = await pullToLocal(store, USER);
    expect(fingerprint).toHaveLength(64);
  });

  it('rejects a remote key that escapes the journal dir and writes nothing outside', async () => {
    const store = new MemoryObjectStore();
    // Raw key with traversal — bypasses keyFor on purpose.
    await store.put(`journals/${USER}/../evil.ledger`, Buffer.from('x'));
    await expect(pullToLocal(store, USER)).rejects.toThrow(
      /Unsafe journal object key/
    );
  });

  it('serves the stale local cache when the store is unreachable but a manifest exists', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'a' });
    const live = await pullToLocal(store, USER); // populates local + manifest
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const downStore: ObjectStore = {
      list: async () => {
        throw new Error('garage down');
      },
      get: store.get.bind(store),
      put: store.put.bind(store),
      delete: store.delete.bind(store),
      deletePrefix: store.deletePrefix.bind(store),
    };
    const { fingerprint } = await pullToLocal(downStore, USER);
    expect(fingerprint).toBe(live.fingerprint);
    expect(await read('main.ledger')).toBe('a'); // local cache intact
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rethrows when the store is unreachable and no manifest exists', async () => {
    const downStore: ObjectStore = {
      list: async () => {
        throw new Error('garage down');
      },
      get: async () => {
        throw new Error('n/a');
      },
      put: async () => ({ etag: '' }),
      delete: async () => {},
      deletePrefix: async () => {},
    };
    await expect(pullToLocal(downStore, USER)).rejects.toThrow(/garage down/);
  });
});
