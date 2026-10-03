'use client';

import { useSyncExternalStore } from 'react';

// Edit changes the transaction in place; duplicate opens the same dialog
// pre-filled from it and saves the result as a new transaction.
export type EditTransactionTarget = {
  uid: string;
  mode: 'edit' | 'duplicate';
};

// A tiny module-level store so any row (in any surface) can open the one
// globally-mounted edit dialog, without a Context provider wrapping every list.
let current: EditTransactionTarget | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const editTransactionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): EditTransactionTarget | null {
    return current;
  },
};

function open(uid: string, mode: EditTransactionTarget['mode']): void {
  current = { uid, mode };
  emit();
}

export const openEditTransaction = (uid: string) => open(uid, 'edit');
export const openDuplicateTransaction = (uid: string) => open(uid, 'duplicate');

export function closeEditTransaction(): void {
  current = null;
  emit();
}

export function useEditTransactionTarget(): EditTransactionTarget | null {
  return useSyncExternalStore(
    editTransactionStore.subscribe,
    editTransactionStore.getSnapshot,
    () => null
  );
}
