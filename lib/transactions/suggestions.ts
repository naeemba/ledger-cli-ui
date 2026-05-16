import 'server-only';
import runLedger from '@/utils/runLedger';

const splitLines = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const getAccountSuggestions = async (): Promise<string[]> => {
  try {
    return splitLines(await runLedger(['accounts']));
  } catch {
    return [];
  }
};

export const getPayeeSuggestions = async (): Promise<string[]> => {
  try {
    return splitLines(await runLedger(['payees']));
  } catch {
    return [];
  }
};
