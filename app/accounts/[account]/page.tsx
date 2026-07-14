import AccountRegister from './AccountRegister';
import PageContainer from '@/components/PageContainer';
import AccountHeader from '@/features/accounts/AccountHeader';
import {
  REGISTER_FORMAT,
  parseAccountRegister,
} from '@/features/transactions/row/registerRows';
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

  const stdout = await runLedger(
    ['register', account, '--format', REGISTER_FORMAT],
    { sortByDate: false }
  );
  const balance = await runLedger(
    ['balance', account, '-X', defaultCurrency, '--format', '%T'],
    { sortByDate: false }
  );
  const views = parseAccountRegister(stdout).reverse(); // newest first, as before

  return (
    <PageContainer>
      <AccountHeader
        account={account}
        balance={balance}
        existingViewNames={existingViewNames}
      />

      <AccountRegister views={views} />
    </PageContainer>
  );
};

export default Account;
