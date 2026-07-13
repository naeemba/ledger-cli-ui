export type TransactionActionState = {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
  // uid of the created transaction on success — lets the caller offer an Undo.
  uid?: string;
};

export type SubmitAction = (
  prev: TransactionActionState | null,
  formData: FormData
) => Promise<TransactionActionState>;
