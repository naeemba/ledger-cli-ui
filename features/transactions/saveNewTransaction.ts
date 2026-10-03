import { toast } from 'sonner';
import {
  createTransactionAction,
  undoTransactionAction,
  type TransactionActionState,
} from './actions';
import { serializeDraftJson, type DraftState } from './entry/draftReducer';

/**
 * Confirm a save with a toast that carries an Undo. The toast outlives the
 * dialog (Toaster is mounted in the app shell), so Undo runs after the form is
 * gone — it only needs the new uid and a way to refresh the current view.
 */
function notifySaved(
  label: string,
  payee: string,
  uid: string | undefined,
  refresh: () => void
) {
  toast.success(`${label} saved`, {
    description: payee,
    action: uid
      ? {
          label: 'Undo',
          onClick: async () => {
            const result = await undoTransactionAction(uid);
            if (result.ok) {
              toast.success('Entry removed');
              refresh();
            } else {
              toast.error(result.message);
            }
          },
        }
      : undefined,
  });
}

/**
 * Save a draft as a new transaction, then refresh and offer Undo. Shared by
 * quick entry and Duplicate so both create entries the same way.
 */
export async function saveNewTransaction(
  draft: DraftState,
  label: string,
  refresh: () => void
): Promise<TransactionActionState> {
  const formData = new FormData();
  formData.set('draft', serializeDraftJson(draft, 'create'));
  const result = await createTransactionAction(null, formData);
  if (result.ok) {
    refresh();
    notifySaved(label, draft.payee, result.uid, refresh);
  }
  return result;
}
