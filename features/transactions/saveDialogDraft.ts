import {
  updateTransactionAction,
  type LoadedTransaction,
  type TransactionActionState,
} from './actions';
import type { EditTransactionTarget } from './editTransactionStore';
import { serializeDraftJson, type DraftState } from './entry/draftReducer';
import { saveNewTransaction } from './saveNewTransaction';

/**
 * Save what the edit dialog holds. A duplicate is created as a new entry and
 * never touches the original. An edit rewrites the original in place, guarded
 * by the fingerprint it was loaded with.
 */
export async function saveDialogDraft(
  target: EditTransactionTarget,
  loaded: LoadedTransaction,
  draft: DraftState,
  refresh: () => void
): Promise<TransactionActionState> {
  if (target.mode === 'duplicate')
    return saveNewTransaction(draft, 'Copy', refresh);
  const formData = new FormData();
  formData.set('draft', serializeDraftJson(draft, 'edit'));
  formData.set('uid', target.uid);
  formData.set('expectedFingerprint', loaded.fingerprint);
  const result = await updateTransactionAction(null, formData);
  if (result.ok) refresh();
  return result;
}
