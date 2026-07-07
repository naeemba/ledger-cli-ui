import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './mapWithConcurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order in the result', async () => {
    const result = await mapWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (n) => n * 10
    );
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('never runs more than `limit` tasks at once', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('passes the index to the task', async () => {
    const result = await mapWithConcurrency(
      ['a', 'b', 'c'],
      2,
      async (item, index) => `${item}${index}`
    );
    expect(result).toEqual(['a0', 'b1', 'c2']);
  });

  it('handles an empty input without spawning workers', async () => {
    const result = await mapWithConcurrency([], 4, async (n) => n);
    expect(result).toEqual([]);
  });

  it('runs sequentially when limit is 1', async () => {
    const order: number[] = [];
    await mapWithConcurrency([5, 4, 3], 1, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      order.push(n);
    });
    expect(order).toEqual([5, 4, 3]);
  });
});
