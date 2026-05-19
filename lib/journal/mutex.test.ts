import { describe, it, expect } from 'vitest';
import { withUserLock } from './mutex';

describe('withUserLock', () => {
  it('serializes overlapping calls for the same userId', async () => {
    const order: string[] = [];
    const slow = withUserLock('alice', async () => {
      order.push('slow-start');
      await new Promise((r) => setTimeout(r, 25));
      order.push('slow-end');
      return 1;
    });
    const fast = withUserLock('alice', async () => {
      order.push('fast-start');
      order.push('fast-end');
      return 2;
    });
    expect(await Promise.all([slow, fast])).toEqual([1, 2]);
    expect(order).toEqual(['slow-start', 'slow-end', 'fast-start', 'fast-end']);
  });

  it('runs different userIds in parallel', async () => {
    const order: string[] = [];
    const alice = withUserLock('alice', async () => {
      order.push('alice-start');
      await new Promise((r) => setTimeout(r, 25));
      order.push('alice-end');
    });
    const bob = withUserLock('bob', async () => {
      order.push('bob-start');
      order.push('bob-end');
    });
    await Promise.all([alice, bob]);
    expect(order[0]).toBe('alice-start');
    expect(order[1]).toBe('bob-start');
  });
});
