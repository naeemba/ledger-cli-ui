import { describe, expect, it } from 'vitest';
import {
  openEditTransaction,
  openDuplicateTransaction,
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
    expect(editTransactionStore.getSnapshot()).toEqual({
      uid: 'uid-1',
      mode: 'edit',
    });
    expect(notified).toBe(1);

    closeEditTransaction();
    expect(editTransactionStore.getSnapshot()).toBeNull();
    expect(notified).toBe(2);

    unsubscribe();
  });

  it('opens the same transaction as a duplicate', () => {
    openDuplicateTransaction('uid-1');
    expect(editTransactionStore.getSnapshot()).toEqual({
      uid: 'uid-1',
      mode: 'duplicate',
    });
    closeEditTransaction();
  });
});
