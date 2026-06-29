export const negateAmount = (amount: string): string => {
  const t = amount.trim();
  if (t === '' || Number(t) === 0) return t;
  return t.startsWith('-') ? t.slice(1) : `-${t}`;
};

export const absAmount = (amount: string): string => {
  const t = amount.trim();
  return t.startsWith('-') ? t.slice(1) : t;
};
