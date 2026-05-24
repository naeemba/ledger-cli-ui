import AccountsView from './AccountsView';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import runLedger from '@/utils/runLedger';

const Accounts = async () => {
  let accounts: string[];
  try {
    const stdout = await runLedger(['accounts']);
    accounts = stdout
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error(e);
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-negative shadow-sm">
        Failed to load accounts from ledger.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <Help label="About accounts">
            Every account referenced in your journal, organised as a tree by the
            colon-separated naming convention (e.g.{' '}
            <code>Assets:Bank:Checking</code>). Use the buttons next to a name
            to view its full transaction history or a monthly summary.
          </Help>
          <ExportButton href="/api/accounts/export" />
        </div>
        <p className="mt-1 text-sm text-muted">
          {accounts.length} account{accounts.length === 1 ? '' : 's'}
        </p>
      </div>
      <AccountsView accounts={accounts} />
    </div>
  );
};

export default Accounts;
