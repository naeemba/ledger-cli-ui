export const getHighestExpense = (stdout: string) => {
  let highestExpense = { amount: 0, str: '' };
  stdout.split('\n').forEach((expense) => {
    if (expense.length > 0) {
      const amount = Number(
        expense.split('|')[1].split(' ')[1].replaceAll(',', '')
      );
      if (amount > highestExpense.amount) {
        highestExpense = {
          amount,
          str: expense,
        };
      }
    }
  });
  return highestExpense.str;
};
