export type RecurringActionState = {
  ok: boolean;
  uid?: string;
  formError?: string;
  fieldErrors?: Record<string, string>;
};
