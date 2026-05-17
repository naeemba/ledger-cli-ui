import {
  ArrowLeftRight,
  CalendarRange,
  Coins,
  FileBarChart,
  FileUp,
  FolderTree,
  Gauge,
  GitCompareArrows,
  PiggyBank,
  PlusCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { endOfMonth, startOfMonth, toISODate } from '@/utils/date';

export type NavItem = {
  id: string;
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  match?: 'exact' | 'prefix';
  activePrefix?: string;
  keywords?: string[];
};

export type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

export const getNavSections = (): NavSection[] => {
  const monthStart = toISODate(startOfMonth());
  const monthEnd = toISODate(endOfMonth());

  return [
    {
      id: 'reports',
      title: 'Reports',
      items: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          href: '/',
          match: 'exact',
          description: 'Snapshot of this month and year-to-date totals.',
          icon: Gauge,
          keywords: ['home', 'overview', 'summary'],
        },
        {
          id: 'accounts',
          title: 'Accounts',
          href: '/accounts',
          description: 'Browse the full account tree.',
          icon: FolderTree,
          keywords: ['tree', 'hierarchy', 'browse'],
        },
        {
          id: 'balance',
          title: 'Balance',
          href: '/balance',
          match: 'exact',
          description: 'Balance by account across all time.',
          icon: FileBarChart,
          keywords: ['totals', 'sum'],
        },
        {
          id: 'net-worth',
          title: 'Net Worth',
          href: '/net-worth',
          description: 'Assets minus liabilities, over time.',
          icon: PiggyBank,
          keywords: ['wealth', 'equity', 'assets'],
        },
        {
          id: 'periodic',
          title: 'Periodic Balance',
          href: `/balance/${monthStart}/${monthEnd}`,
          match: 'prefix',
          activePrefix: '/balance/',
          description: 'Balance for any date range; defaults to this month.',
          icon: CalendarRange,
          keywords: ['month', 'range', 'between', 'period'],
        },
        {
          id: 'monthly',
          title: 'Cash Flow',
          href: '/monthly',
          description: 'Monthly income vs expenses.',
          icon: ArrowLeftRight,
          keywords: ['income', 'expenses', 'flow'],
        },
        {
          id: 'debts',
          title: 'Debts',
          href: '/debts',
          description: 'Outstanding liabilities by account.',
          icon: Coins,
          keywords: ['liabilities', 'owed', 'loans'],
        },
      ],
    },
    {
      id: 'activity',
      title: 'Activity',
      items: [
        {
          id: 'payees',
          title: 'Payees',
          href: '/payees',
          description: 'Spend by counterparty.',
          icon: Users,
          keywords: ['merchant', 'recipient', 'vendor'],
        },
        {
          id: 'reconcile',
          title: 'Reconcile',
          href: '/reconcile',
          description: 'Uncleared transactions awaiting reconciliation.',
          icon: GitCompareArrows,
          keywords: ['pending', 'cleared', 'uncleared'],
        },
      ],
    },
    {
      id: 'journal',
      title: 'Journal',
      items: [
        {
          id: 'add',
          title: 'Add transaction',
          href: '/transactions/new',
          match: 'prefix',
          activePrefix: '/transactions/',
          description: 'Append a new transaction to your journal.',
          icon: PlusCircle,
          keywords: ['new', 'create', 'entry'],
        },
        {
          id: 'import',
          title: 'Import',
          href: '/import',
          description: 'Replace your journal from a file or .zip archive.',
          icon: FileUp,
          keywords: ['upload', 'replace', 'zip'],
        },
      ],
    },
  ];
};
