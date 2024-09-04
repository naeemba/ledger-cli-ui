import { exec } from 'child_process';
import { promisify } from 'util';
import Link from 'next/link';

const execPromise = promisify(exec);

function buildTree(accounts: Array<string>) {
  const root = {};

  accounts.forEach((account) => {
    const levels = account.split(':');
    let currentLevel: Record<string, unknown> = root;

    levels.forEach((level) => {
      if (!currentLevel[level]) {
        currentLevel[level] = {};
      }
      currentLevel = currentLevel[level] as Record<string, unknown>;
    });
  });

  return root;
}

const renderTree = (node: Record<string, unknown>, parentPath = '') => {
  return (
    <ul>
      {Object.keys(node).map((key) => {
        const currentPath = `${parentPath}${key}`;
        return (
          <li key={currentPath} className="pl-16">
            <Link href={`/accounts/${encodeURIComponent(currentPath)}`}>
              {key}
            </Link>
            &nbsp;|&nbsp;
            <Link
              className="text-blue-700 hover:text-blue-900"
              href={`/registers/monthly/${encodeURIComponent(currentPath)}`}
            >
              Monthly Report
            </Link>
            {Object.keys(node[key] as Record<string, unknown>).length > 0 &&
              renderTree(
                node[key] as Record<string, unknown>,
                `${currentPath}:`
              )}
          </li>
        );
      })}
    </ul>
  );
};

const Report = async () => {
  try {
    const { stdout } = await execPromise(`ledger accounts`);
    const accounts = stdout
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const tree = buildTree(accounts);
    return renderTree(tree);
  } catch (e) {
    console.error(e);
  }

  return <div>Report</div>;
};

export default Report;
