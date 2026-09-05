import {
  PAYABLE_ROOT,
  RECEIVABLE_ROOT,
  directionClass,
  personAccountPatterns,
} from './parse';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { netForPerson } from '@/features/debts/getPersonDebts';
import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import RegisterList from '@/features/transactions/row/RegisterList';
import {
  REGISTER_FORMAT,
  parseAccountRegister,
} from '@/features/transactions/row/registerRows';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { notFound } from 'next/navigation';

/**
 * Every transaction that touched one person's receivable/payable accounts,
 * newest first — the /debts row drilled down. Ledger does the netting, the
 * base conversion, and the running total; JS only renders the rows.
 */
const PersonDebts = async ({ person }: { person: string }) => {
  if (!isSafeLedgerArg(person)) notFound();
  const base = await getBaseCurrency();
  const patterns = [
    ...personAccountPatterns(RECEIVABLE_ROOT, person),
    ...personAccountPatterns(PAYABLE_ROOT, person),
  ];

  const [stdout, net] = await Promise.all([
    runLedger(
      [
        'register',
        '-X',
        base,
        '--sort',
        'date',
        '--format',
        REGISTER_FORMAT,
        '--',
        ...patterns,
      ],
      { sortByDate: false }
    ),
    netForPerson(base, person),
  ]);
  const views = parseAccountRegister(stdout).reverse(); // newest first

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Person
            </div>
            <Help label="About this debt view">
              Every transaction that touched{' '}
              <code>
                {RECEIVABLE_ROOT}:{person}
              </code>{' '}
              or{' '}
              <code>
                {PAYABLE_ROOT}:{person}
              </code>
              , most recent first. Amounts are converted to {base.toUpperCase()}
              ; the Total column is the running net after each transaction.
            </Help>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-all">
            {person}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {net === null
              ? 'Net'
              : net.direction === 'you-owe'
                ? 'You owe'
                : 'Owes you'}
          </div>
          <div
            className={`text-2xl font-semibold tracking-tight ${
              net === null ? '' : directionClass(net.direction)
            }`}
          >
            {net ? net.amount : 'Settled'}
          </div>
        </div>
      </div>

      <RegisterList views={views} />
    </PageContainer>
  );
};

export default PersonDebts;
