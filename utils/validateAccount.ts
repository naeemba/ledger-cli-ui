const isValidAccount = (account: string): boolean => {
  if (!account || account.length > 256) return false;
  if (account.startsWith('-')) return false;
  if (/[\0\n\r]/.test(account)) return false;
  return true;
};

export default isValidAccount;
