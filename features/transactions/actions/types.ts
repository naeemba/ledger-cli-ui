export type TransactionActionState = {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
};

export type SubmitAction = (
  prev: TransactionActionState | null,
  formData: FormData
) => Promise<TransactionActionState>;
