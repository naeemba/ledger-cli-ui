import PageContainer from '@/components/PageContainer';
import AccountHeader from '@/features/accounts/AccountHeader';
import RegisterList from '@/features/transactions/row/RegisterList';
import { registerViews } from '@/features/transactions/row/registerViews';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import isValidAccount from '@/utils/validateAccount';
import { notFound } from 'next/navigation';

const Account = async ({
  params,
}: {
  params: Promise<{ account: string }>;
}) => {
  const user = await requireUser();
  const existingViewNames = await savedViewService.listNames(user.id);
  const defaultCurrency = await getBaseCurrency();
  const { account: accountParam } = await params;
  const account = decodeURIComponent(accountParam);
  if (!isValidAccount(account)) notFound();

  const views = await registerViews([account]);
  const balance = await runLedger(
    ['balance', account, '-X', defaultCurrency, '--format', '%T'],
    { sortByDate: false }
  );

  return (
    <PageContainer>
      <AccountHeader
        account={account}
        balance={balance}
        existingViewNames={existingViewNames}
      />

      <RegisterList views={views} />
    </PageContainer>
  );
};

export default Account;
