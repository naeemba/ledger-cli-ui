import { describe, expect, it } from 'vitest';
import {
  openEditTransaction,
  closeEditTransaction,
  editTransactionStore,
} from './editTransactionStore';

describe('editTransactionStore', () => {
  it('notifies subscribers when the edit target changes', () => {
    let notified = 0;
    const unsubscribe = editTransactionStore.subscribe(() => {
      notified += 1;
    });
    expect(editTransactionStore.getSnapshot()).toBeNull();

    openEditTransaction('uid-1');
    expect(editTransactionStore.getSnapshot()).toBe('uid-1');
    expect(notified).toBe(1);

    closeEditTransaction();
    expect(editTransactionStore.getSnapshot()).toBeNull();
    expect(notified).toBe(2);

    unsubscribe();
  });
});
