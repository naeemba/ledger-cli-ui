import {
  classifyAccount,
  type AccountRole,
} from '@/features/transactions/entry/types/accountRole';
import type { BalanceRow } from '@/lib/balance/parse';

export type AccountNode = {
  name: string;
  path: string;
  amount: string;
  role: AccountRole;
  children: AccountNode[];
};

export type BucketKey = 'accounts' | 'categories' | 'advanced';
export type Bucket = { key: BucketKey; title: string; roots: AccountNode[] };

const BUCKET_OF: Record<AccountRole, BucketKey> = {
  asset: 'accounts',
  liability: 'accounts',
  income: 'categories',
  expense: 'categories',
  equity: 'advanced',
  unknown: 'advanced',
};

const BUCKET_TITLES: Record<BucketKey, string> = {
  accounts: 'Accounts',
  categories: 'Categories',
  advanced: 'Advanced',
};

export function buildAccountTree(rows: BalanceRow[]): AccountNode[] {
  const roots: AccountNode[] = [];
  const byPath = new Map<string, AccountNode>();

  const ensure = (path: string): AccountNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const segments = path.split(':');
    const name = segments[segments.length - 1];
    const node: AccountNode = {
      name,
      path,
      amount: '',
      role: classifyAccount(path),
      children: [],
    };
    byPath.set(path, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = ensure(segments.slice(0, -1).join(':'));
      parent.children.push(node);
    }
    return node;
  };

  for (const row of rows) {
    ensure(row.account).amount = row.amount;
  }

  const sortRec = (nodes: AccountNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function bucketRoots(roots: AccountNode[]): Bucket[] {
  const order: BucketKey[] = ['accounts', 'categories', 'advanced'];
  const groups: Record<BucketKey, AccountNode[]> = {
    accounts: [],
    categories: [],
    advanced: [],
  };
  for (const root of roots) {
    groups[BUCKET_OF[root.role]].push(root);
  }
  return order.map((key) => ({
    key,
    title: BUCKET_TITLES[key],
    roots: groups[key],
  }));
}

export function countLeaves(roots: AccountNode[]): number {
  let total = 0;
  const walk = (nodes: AccountNode[]) => {
    for (const n of nodes) {
      if (n.children.length === 0) total += 1;
      else walk(n.children);
    }
  };
  walk(roots);
  return total;
}
