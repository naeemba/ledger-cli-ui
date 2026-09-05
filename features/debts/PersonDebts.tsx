import { netForPerson, personRegister } from './getPersonDebts';
import { PAYABLE_ROOT, RECEIVABLE_ROOT, directionClass } from './parse';
import Help from '@/components/Help';
import LedgerErrorCard from '@/components/LedgerErrorCard';
import PageContainer from '@/components/PageContainer';
import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import RegisterList from '@/features/transactions/row/RegisterList';
import { createLogger } from '@/lib/log';
import { getBaseCurrency } from '@/lib/settings';
import { notFound, unstable_rethrow } from 'next/navigation';

const log = createLogger('debts');

/**
 * Every transaction that touched one person's receivable/payable accounts,
 * newest first — the /debts row drilled down. Ledger does the netting, the
 * base conversion, and the running total; JS only renders the rows.
 */
const PersonDebts = async ({ person }: { person: string }) => {
  if (!isSafeLedgerArg(person)) notFound();
  const base = await getBaseCurrency();

  let views, net;
  try {
    [views, net] = await Promise.all([
      personRegister(base, person),
      netForPerson(base, person),
    ]);
  } catch (e) {
    // redirect() and the prerender bailout signal by throwing; re-throw those
    // so a signed-out user reaches /sign-in instead of a "ledger broke" card.
    unstable_rethrow(e);
    log.error({ err: e, person }, 'failed to load person debts');
    return <LedgerErrorCard what="debts" />;
  }

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
              , each at the price in effect on its own date; the Total column is
              the running net after each row. A greyed-out{' '}
              <em>Commodities revalued</em> row is ledger&apos;s, not yours — it
              is a price move, and it is what carries the total up to the net
              shown here.
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
