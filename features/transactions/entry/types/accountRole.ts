export type AccountRole =
  'asset' | 'liability' | 'income' | 'expense' | 'equity' | 'unknown';

const ROOT_TO_ROLE: Record<string, AccountRole> = {
  Assets: 'asset',
  Liabilities: 'liability',
  Income: 'income',
  Expenses: 'expense',
  Equity: 'equity',
};

export const classifyAccount = (account: string): AccountRole => {
  const root = account.split(':')[0]?.trim() ?? '';
  return ROOT_TO_ROLE[root] ?? 'unknown';
};

export const accountsForRole = (
  accounts: string[],
  role: AccountRole
): string[] => accounts.filter((a) => classifyAccount(a) === role);
