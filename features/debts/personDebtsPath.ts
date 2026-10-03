/** The page listing everything owed with one person. */
export const personDebtsPath = (person: string): string =>
  `/debts/${encodeURIComponent(person)}`;
