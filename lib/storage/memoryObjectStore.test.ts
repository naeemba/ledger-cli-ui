import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryObjectStore } from './memoryObjectStore';

describe('MemoryObjectStore', () => {
  let store: MemoryObjectStore;
  beforeEach(() => {
    store = new MemoryObjectStore();
  });

  it('put then get round-trips the body and returns a stable etag', async () => {
    const { etag } = await store.put('a/x.ledger', Buffer.from('hello'));
    const got = await store.get('a/x.ledger');
    expect(got.body.toString()).toBe('hello');
    expect(got.etag).toBe(etag);
  });

  it('etag changes when content changes', async () => {
    const first = await store.put('a/x.ledger', Buffer.from('one'));
    const second = await store.put('a/x.ledger', Buffer.from('two'));
    expect(second.etag).not.toBe(first.etag);
  });

  it('list returns only keys under the prefix with meta', async () => {
    await store.put('a/x.ledger', Buffer.from('1'));
    await store.put('a/sub/y.ledger', Buffer.from('22'));
    await store.put('b/z.ledger', Buffer.from('333'));
    const entries = await store.list('a/');
    expect(entries.map((e) => e.key).sort()).toEqual([
      'a/sub/y.ledger',
      'a/x.ledger',
    ]);
    const x = entries.find((e) => e.key === 'a/x.ledger')!;
    expect(x.size).toBe(1);
    expect(x.etag).toHaveLength(64); // sha256 hex
  });

  it('get rejects for a missing key', async () => {
    await expect(store.get('nope')).rejects.toThrow();
  });

  it('delete removes one key; deletePrefix removes the subtree', async () => {
    await store.put('a/x.ledger', Buffer.from('1'));
    await store.put('a/y.ledger', Buffer.from('2'));
    await store.delete('a/x.ledger');
    expect((await store.list('a/')).map((e) => e.key)).toEqual(['a/y.ledger']);
    await store.deletePrefix('a/');
    expect(await store.list('a/')).toEqual([]);
  });
});
