import { describe, it, expect } from 'vitest';
import { withPriceLock, __resetPriceLockForTests } from './lock';

describe('withPriceLock', () => {
  it('runs the function and returns its result', async () => {
    __resetPriceLockForTests();
    const result = await withPriceLock(async () => 'ok' as const);
    expect(result).toBe('ok');
  });

  it('coalesces concurrent calls into a single in-flight promise', async () => {
    __resetPriceLockForTests();
    let calls = 0;
    let release: (v: string) => void = () => {};
    const gate = new Promise<string>((r) => {
      release = r;
    });
    const fn = async () => {
      calls += 1;
      return gate;
    };

    const a = withPriceLock(fn);
    const b = withPriceLock(fn);
    release('done');
    expect(await a).toBe('done');
    expect(await b).toBe('done');
    expect(calls).toBe(1);
  });

  it('allows a new call after the previous one settles', async () => {
    __resetPriceLockForTests();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return 'x';
    };
    await withPriceLock(fn);
    await withPriceLock(fn);
    expect(calls).toBe(2);
  });
});
