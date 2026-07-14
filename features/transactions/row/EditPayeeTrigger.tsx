'use client';

import { openEditTransaction } from '../editTransactionStore';

// The payee text opens the shared edit dialog in place (dialog is the primary
// edit path). Styled to match the former Link so the row looks unchanged.
export default function EditPayeeTrigger({
  uid,
  payee,
}: {
  uid: string;
  payee: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openEditTransaction(uid)}
      className="text-left hover:underline"
    >
      {payee}
    </button>
  );
}
