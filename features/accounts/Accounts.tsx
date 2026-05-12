import { buildTree } from './Accounts.utils';
import Tree from './Tree';
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
  const tree = buildTree(accounts);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-muted">
          Browse every account in your journal
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <Tree tree={tree} />
      </div>
    </div>
  );
};

export default Accounts;
