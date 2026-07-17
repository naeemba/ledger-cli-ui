export type BudgetActionState = {
  ok: boolean;
  uid?: string;
  formError?: string;
  fieldErrors?: Record<string, string>;
};
