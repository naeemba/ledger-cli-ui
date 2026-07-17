import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import BudgetsView from '@/features/budgets/BudgetsView';
import { getBudgetReport } from '@/features/budgets/report';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getBaseCurrency } from '@/lib/settings';

const BudgetsPage = async () => {
  const user = await requireUser();
  const baseCurrency = await getBaseCurrency();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [lines, report] = await Promise.all([
    journalService.listBudgets(user.id),
    getBudgetReport(baseCurrency, todayIso),
  ]);

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <Help label="About budgets">
            Allowances compared against actual spending by ledger; your
            recurring bills count toward their account&apos;s allowance
            automatically.
          </Help>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Set an allowance per account and see how this month and year to date
          stack up.
        </p>
      </div>
      <BudgetsView
        baseCurrency={baseCurrency}
        report={report}
        lines={lines.map(({ uid, fingerprint, period, note, postings }) => ({
          uid,
          fingerprint,
          period,
          note,
          postings: postings.map(({ account, amount, currency }) => ({
            account,
            amount,
            currency,
          })),
        }))}
      />
    </PageContainer>
  );
};

export default BudgetsPage;
