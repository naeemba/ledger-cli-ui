export const getHighestExpense = (stdout: string): string => {
  let highestExpense = { amount: 0, str: '' };
  stdout.split('\n').forEach((expense) => {
    if (!expense) return;
    const amountField = expense.split('|')[1];
    const amountToken = amountField?.split(' ')[1];
    if (!amountToken) return;
    const amount = Number(amountToken.replaceAll(',', ''));
    if (Number.isFinite(amount) && amount > highestExpense.amount) {
      highestExpense = { amount, str: expense };
    }
  });
  return highestExpense.str;
};
