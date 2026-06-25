import { describe, expect, it } from 'vitest';
import { MemoryStore, type RateLimitPolicy } from './store';

const policy: RateLimitPolicy = { name: 'test', max: 3, windowMs: 1000 };

describe('MemoryStore', () => {
  it('allows hits up to the limit then blocks', () => {
    const store = new MemoryStore(() => 0);
    expect(store.hit('k', policy).allowed).toBe(true); // 1
    expect(store.hit('k', policy).allowed).toBe(true); // 2
    expect(store.hit('k', policy).allowed).toBe(true); // 3
    const fourth = store.hit('k', policy); // 4
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.resetAt).toBe(1000);
  });

  it('resets after the window elapses', () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    store.hit('k', policy);
    store.hit('k', policy);
    store.hit('k', policy);
    expect(store.hit('k', policy).allowed).toBe(false);
    now = 1000; // window boundary reached
    expect(store.hit('k', policy).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const store = new MemoryStore(() => 0);
    store.hit('a', policy);
    store.hit('a', policy);
    store.hit('a', policy);
    expect(store.hit('a', policy).allowed).toBe(false);
    expect(store.hit('b', policy).allowed).toBe(true);
  });

  it('reports remaining correctly', () => {
    const store = new MemoryStore(() => 0);
    expect(store.hit('k', policy).remaining).toBe(2);
    expect(store.hit('k', policy).remaining).toBe(1);
    expect(store.hit('k', policy).remaining).toBe(0);
  });
});
