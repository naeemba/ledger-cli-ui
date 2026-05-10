import dayjs from 'dayjs';
import Link from 'next/link';

const Header = () => {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  const menus = [
    { id: 5, title: 'Dashboard', href: '/' },
    { id: 1, title: 'Accounts', href: '/accounts' },
    { id: 2, title: 'Balance', href: '/balance' },
    {
      id: 3,
      title: 'Periodic Balance',
      href: `/balance/${monthStart}/${monthEnd}`,
    },
    { id: 4, title: 'Debts', href: '/debts' },
    { id: 6, title: 'Monthly Comparison', href: '/monthly' },
  ];

  return (
    <nav className="mx-auto mt-10 rounded-xl border border-slate-100 bg-white px-4 py-2 shadow-md lg:px-8 lg:py-4">
      <div className="container mx-auto flex items-center justify-between text-slate-900">
        <ul className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
          {menus.map((menu) => (
            <li key={menu.id} className="p-1 text-sm font-normal">
              <Link href={menu.href} className="flex items-center">
                {menu.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
};

export default Header;
