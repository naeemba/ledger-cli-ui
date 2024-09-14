import { exec } from 'child_process';
import { promisify } from 'util';
import { buildTree } from './Accounts.utils';
import Tree from './Tree';
import getLedgerCommand from '@/utils/getLedgerCommand';

const execPromise = promisify(exec);

const Accounts = async () => {
  try {
    const { stdout } = await execPromise(`${getLedgerCommand()} accounts`);
    const accounts = stdout
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const tree = buildTree(accounts);
    return <Tree tree={tree} />;
  } catch (e) {
    console.error(e);
  }
  return <div>asldfjk</div>;
};

export default Accounts;
