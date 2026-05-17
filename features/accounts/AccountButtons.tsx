import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Props = {
  path: string;
};

const groupedLink = cn(
  buttonVariants({ variant: 'outline', size: 'xs' }),
  'rounded-none first:rounded-l-md last:rounded-r-md [&:not(:first-child)]:-ml-px'
);

const AccountButtons = ({ path }: Props) => {
  return (
    <span className="inline-flex">
      <Link
        className={groupedLink}
        href={`/accounts/${encodeURIComponent(path)}`}
      >
        Transactions
      </Link>
      <Link
        className={groupedLink}
        href={`/registers/monthly/${encodeURIComponent(path)}`}
      >
        Monthly
      </Link>
    </span>
  );
};

export default AccountButtons;
