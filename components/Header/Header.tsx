'use client';

import { twMerge } from 'tailwind-merge';
import { APP_NAME } from '@/lib/app';
import { useAuth } from '@/lib/auth/use-auth';
import { endOfMonth, startOfMonth, toISODate } from '@/utils/date';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Header = () => {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const monthStart = toISODate(startOfMonth());
  const monthEnd = toISODate(endOfMonth());

  const menus = [
    { id: 'dashboard', title: 'Dashboard', href: '/', match: 'exact' as const },
    { id: 'accounts', title: 'Accounts', href: '/accounts' },
    {
      id: 'balance',
      title: 'Balance',
      href: '/balance',
      match: 'exact' as const,
    },
    { id: 'net-worth', title: 'Net Worth', href: '/net-worth' },
    {
      id: 'periodic',
      title: 'Periodic Balance',
      href: `/balance/${monthStart}/${monthEnd}`,
      match: 'prefix' as const,
      activePrefix: '/balance/',
    },
    { id: 'debts', title: 'Debts', href: '/debts' },
    { id: 'monthly', title: 'Cash Flow', href: '/monthly' },
    { id: 'payees', title: 'Payees', href: '/payees' },
    { id: 'reconcile', title: 'Reconcile', href: '/reconcile' },
    {
      id: 'add',
      title: 'Add transaction',
      href: '/transactions/new',
      match: 'prefix' as const,
      activePrefix: '/transactions/',
    },
    { id: 'import', title: 'Import', href: '/import' },
  ];

  const isActive = (menu: (typeof menus)[number]) => {
    if (menu.match === 'exact') return pathname === menu.href;
    const prefix = ('activePrefix' in menu && menu.activePrefix) || menu.href;
    return pathname === menu.href || pathname.startsWith(prefix);
  };

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-8 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg"
          aria-label={`${APP_NAME} home`}
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
            L
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {APP_NAME}
          </span>
        </Link>

        {!isAuthPage && (
          <nav className="-mx-1 flex flex-wrap items-center gap-0.5 overflow-x-auto lg:ml-auto">
            {menus.map((menu) => (
              <Link
                key={menu.id}
                href={menu.href}
                className={twMerge(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg',
                  isActive(menu) && 'bg-subtle text-fg'
                )}
              >
                {menu.title}
              </Link>
            ))}
          </nav>
        )}

        {user && (
          <div
            className={twMerge(
              'flex items-center gap-3 text-sm',
              !isAuthPage && 'lg:ml-4'
            )}
          >
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-subtle"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
