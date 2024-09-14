export function buildTree(accounts: Array<string>) {
  const root = {};

  accounts.forEach((account) => {
    const levels = account.split(':');
    let currentLevel: Record<string, unknown> = root;

    levels.forEach((level) => {
      if (!currentLevel[level]) {
        currentLevel[level] = {};
      }
      currentLevel = currentLevel[level] as Record<string, unknown>;
    });
  });

  return root;
}
