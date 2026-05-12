'use client';

import dayjs from 'dayjs';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Header = () => {
  const pathname = usePathname();
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  const menus = [
    { id: 'dashboard', title: 'Dashboard', href: '/', match: 'exact' as const },
    { id: 'accounts', title: 'Accounts', href: '/accounts' },
    {
      id: 'balance',
      title: 'Balance',
      href: '/balance',
      match: 'exact' as const,
    },
    {
      id: 'periodic',
      title: 'Periodic Balance',
      href: `/balance/${monthStart}/${monthEnd}`,
      match: 'prefix' as const,
      activePrefix: '/balance/',
    },
    { id: 'debts', title: 'Debts', href: '/debts' },
    { id: 'monthly', title: 'Monthly', href: '/monthly' },
  ];

  const isActive = (menu: (typeof menus)[number]) => {
    if (menu.match === 'exact') return pathname === menu.href;
    const prefix = ('activePrefix' in menu && menu.activePrefix) || menu.href;
    return pathname === menu.href || pathname.startsWith(prefix);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-8 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg"
          aria-label="Ledger home"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg">
            L
          </span>
          <span className="text-sm font-semibold tracking-tight">Ledger</span>
        </Link>
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
      </div>
    </header>
  );
};

export default Header;
