import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { pullToLocal } from './download';
import { keyFor, readManifest } from './manifest';
import { MemoryObjectStore } from './memoryObjectStore';
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
});
