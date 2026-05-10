import Link from 'next/link';

type Props = {
  path: string;
};

const linkClasses =
  'block py-3 px-6 text-sm font-bold uppercase text-gray-900 border border-gray-900 hover:bg-gray-100 first:rounded-l-lg last:rounded-r-lg [&:not(:first-child)]:border-l-0';

const AccountButtons = ({ path }: Props) => {
  return (
    <span className="inline-flex">
      <Link
        className={linkClasses}
        href={`/accounts/${encodeURIComponent(path)}`}
      >
        All Transactions Report
      </Link>
      <Link
        className={linkClasses}
        href={`/registers/monthly/${encodeURIComponent(path)}`}
      >
        Monthly Report
      </Link>
    </span>
  );
};

export default AccountButtons;
