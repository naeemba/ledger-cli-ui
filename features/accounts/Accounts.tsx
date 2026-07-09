import AccountsView from './AccountsView';
import { buildAccountTree, countLeaves } from './accountTree';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { parseBalanceRows, type BalanceRow } from '@/lib/balance/parse';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';

const Accounts = async () => {
  let rows: BalanceRow[];
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--no-total',
      '-X',
      base,
      '--format',
      '%A|%T\n',
    ]);
    rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
  } catch (e) {
    console.error(e);
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-negative shadow-sm">
        Failed to load accounts from ledger.
      </div>
    );
  }

  const leafCount = countLeaves(buildAccountTree(rows));

  return (
    <PageContainer>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <Help label="About accounts">
            Your money is grouped into <strong>Accounts</strong> (what you have
            and owe — bank, cash, cards) and <strong>Categories</strong> (where
            money comes from and goes). An arrow shows whether a balance is in
            your favour (↑) or against you (↓); a tag like <em>owed to you</em>{' '}
            appears when a balance is the opposite of what is usual. Less-common
            accounts live under <strong>Advanced</strong>.
          </Help>
          <ExportButton href="/api/accounts/export" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {leafCount} account{leafCount === 1 ? '' : 's'}
        </p>
      </div>
      <AccountsView rows={rows} />
    </PageContainer>
  );
};

export default Accounts;
