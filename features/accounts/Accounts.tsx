import { exec } from 'child_process';
import { promisify } from 'util';
import { buildTree } from './Accounts.utils';
import Tree from './Tree';
import getLedgerCommand from '@/utils/getLedgerCommand';

const execPromise = promisify(exec);

const Accounts = async () => {
  let accounts: string[];
  try {
    const { stdout } = await execPromise(`${getLedgerCommand()} accounts`);
    accounts = stdout
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error(e);
    return (
      <div className="text-red-700">Failed to load accounts from ledger.</div>
    );
  }
  const tree = buildTree(accounts);
  return <Tree tree={tree} />;
};

export default Accounts;
