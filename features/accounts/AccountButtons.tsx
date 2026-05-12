import Link from 'next/link';

type Props = {
  path: string;
};

const linkClasses =
  'inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-fg first:rounded-l-md last:rounded-r-md [&:not(:first-child)]:border-l-0';

const AccountButtons = ({ path }: Props) => {
  return (
    <span className="inline-flex">
      <Link
        className={linkClasses}
        href={`/accounts/${encodeURIComponent(path)}`}
      >
        Transactions
      </Link>
      <Link
        className={linkClasses}
        href={`/registers/monthly/${encodeURIComponent(path)}`}
      >
        Monthly
      </Link>
    </span>
  );
};

export default AccountButtons;
