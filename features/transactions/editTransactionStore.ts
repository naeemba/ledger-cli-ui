'use client';

import { useSyncExternalStore } from 'react';

// A tiny module-level store so any row (in any surface) can open the one
// globally-mounted edit dialog, without a Context provider wrapping every list.
let current: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const editTransactionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): string | null {
    return current;
  },
};

export function openEditTransaction(uid: string): void {
  current = uid;
  emit();
}

export function closeEditTransaction(): void {
  current = null;
  emit();
}

export function useEditTransactionUid(): string | null {
  return useSyncExternalStore(
    editTransactionStore.subscribe,
    editTransactionStore.getSnapshot,
    () => null
  );
}
