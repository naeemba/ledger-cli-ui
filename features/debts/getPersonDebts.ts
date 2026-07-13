import 'server-only';
import {
  PAYABLE_ROOT,
  RECEIVABLE_ROOT,
  type PersonDebt,
  parseNet,
  peopleFromBalance,
} from './parse';
import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import { parseBalanceRows } from '@/lib/balance/parse';
import runLedger from '@/utils/runLedger';

// quantity keeps the sign (direction); the third column is the absolute
// magnitude so the view can show "owes you $30" rather than "$-30".
const NET_FORMAT =
  '%(quantity(scrub(total)))|%(commodity(scrub(total)))|%(scrub(abs(total)))\n';

const netForPerson = async (
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
    `${RECEIVABLE_ROOT}:${person}`,
    `${PAYABLE_ROOT}:${person}`,
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
