import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import RecurringView from '@/features/recurring/RecurringView';
import { buildDueList } from '@/features/recurring/dueList';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getBaseCurrency } from '@/lib/settings';
import { toISODate } from '@/utils/date';

const HORIZON_DAYS = 30;

const RecurringPage = async () => {
  const user = await requireUser();
  const [recurring, baseCurrency] = await Promise.all([
    journalService.listRecurring(user.id),
    getBaseCurrency(),
  ]);

  const now = new Date();
  const todayIso = toISODate(now);
  const horizonIso = toISODate(
    new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)
  );
  const dueList = buildDueList(recurring, todayIso, horizonIso);
  const unsupportedUids = new Set(
    dueList.unsupported.map((rule) => rule.ruleUid)
  );
  const nextDueByUid = new Map<string, string>();
  for (const occurrence of [...dueList.due, ...dueList.upcoming]) {
    if (!nextDueByUid.has(occurrence.ruleUid)) {
      nextDueByUid.set(occurrence.ruleUid, occurrence.date);
    }
  }

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Recurring transactions
          </h1>
          <Help label="About recurring transactions">
            Bills, salaries, and subscriptions that repeat on a schedule. They
            are stored as ledger periodic (<code>~</code>) directives and power
            the upcoming-bills forecast on the dashboard — they do not post real
            transactions by themselves.
          </Help>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Define what repeats and when; the dashboard forecasts what is due
          next.
        </p>
      </div>
      <RecurringView
        baseCurrency={baseCurrency}
        rows={recurring.map(({ uid, period, note, fingerprint, postings }) => ({
          uid,
          period,
          note,
          fingerprint,
          postings: postings.map(({ account, amount, currency }) => ({
            account,
            amount,
            currency,
          })),
          nextDue: uid ? nextDueByUid.get(uid) : undefined,
          unsupported: !uid || unsupportedUids.has(uid),
        }))}
      />
    </PageContainer>
  );
};

export default RecurringPage;
