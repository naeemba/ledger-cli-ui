import 'server-only';
import {
  PAYABLE_ROOT,
  RECEIVABLE_ROOT,
  type PersonDebt,
  parseNet,
  peopleFromBalance,
  personAccountPatterns,
} from './parse';
import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import { registerViews } from '@/features/transactions/row/registerViews';
import type { TransactionRowView } from '@/features/transactions/row/rowView';
import { parseBalanceRows } from '@/lib/balance/parse';
import runLedger from '@/utils/runLedger';

// quantity keeps the sign (direction); the third column is the absolute
// magnitude so the view can show "owes you $30" rather than "$-30".
export const NET_FORMAT =
  '%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))|%(scrub(abs(display_total)))\n';

// Both sides of one person's ledger: what they owe and what you owe them.
const personPatterns = (person: string): string[] => [
  ...personAccountPatterns(RECEIVABLE_ROOT, person),
  ...personAccountPatterns(PAYABLE_ROOT, person),
];

// Ledger's own payee for the pseudo-entry `-X` inserts when a held commodity
// changes price. Nobody entered it, so the view greys it out — but it must
// stay in the list: it carries the price move that takes the running total
// from the last transaction's value to today's, which is the figure the header
// and /debts show.
const REVALUATION_PAYEE = 'Commodities revalued';

/**
 * Every transaction touching a person's two accounts, newest first, converted
 * to `base`, with ledger's revaluation rows kept in place. Dropping them
 * (`--no-revalued`) would end the running total at the last transaction's
 * prices while `netForPerson` still reports today's — the same page showing
 * two different debts. `--` stops option parsing so a person name can't
 * smuggle a flag.
 */
export const personRegister = async (
  base: string,
  person: string
): Promise<TransactionRowView[]> => {
  if (!isSafeLedgerArg(person)) return [];
  const views = await registerViews([
    '-X',
    base,
    '--',
    ...personPatterns(person),
  ]);
  return views.map((view) =>
    view.payee === REVALUATION_PAYEE ? { ...view, generated: true } : view
  );
};

export const netForPerson = async (
  base: string,
  person: string
): Promise<PersonDebt | null> => {
  if (!isSafeLedgerArg(person)) return null;
  // A collapsed register's final running total nets the two accounts into one
  // figure (ledger's math, base-converted). `--` stops option parsing so a
  // person name can't smuggle a flag.
  const stdout = await runLedger([
    'register',
    '-X',
    base,
    '--collapse',
    '--format',
    NET_FORMAT,
    '--',
    ...personPatterns(person),
  ]);
  return parseNet(person, stdout);
};

/**
 * Net debt per person across Assets:Receivable:* and Liabilities:Payable:*.
 * Ledger does every sum and the base conversion: one `balance` call finds the
 * people with an open account, then one collapsed `register` per person nets
 * their two sides. JS only groups people by name (never by amount) and reads
 * the net's sign for the direction label — no accounting math here.
 */
export const getPersonDebts = async (base: string): Promise<PersonDebt[]> => {
  const listing = await runLedger([
    'balance',
    '--flat',
    '--no-total',
    '-X',
    base,
    '--format',
    '%A|%T\n',
    RECEIVABLE_ROOT,
    PAYABLE_ROOT,
  ]);
  const people = peopleFromBalance(parseBalanceRows(listing));
  const debts = await Promise.all(
    people.map((person) => netForPerson(base, person))
  );
  return debts
    .filter((debt): debt is PersonDebt => debt !== null)
    .sort((a, b) => a.person.localeCompare(b.person));
};
