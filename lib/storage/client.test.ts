import { describe, it, expect, afterEach } from 'vitest';
import { getObjectStore, resetObjectStore } from './client';
import { MemoryObjectStore } from './memoryObjectStore';

afterEach(() => resetObjectStore());

describe('getObjectStore', () => {
  it('returns a MemoryObjectStore when STORAGE_BACKEND is memory (default)', () => {
    // Test env has STORAGE_BACKEND unset → defaults to 'memory'.
    expect(getObjectStore()).toBeInstanceOf(MemoryObjectStore);
  });

  it('memoizes the instance', () => {
    expect(getObjectStore()).toBe(getObjectStore());
  });

  it('resetObjectStore clears the memo', () => {
    const first = getObjectStore();
    resetObjectStore();
    expect(getObjectStore()).not.toBe(first);
  });
});
