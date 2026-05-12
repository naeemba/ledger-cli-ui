import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { twMerge } from 'tailwind-merge';
import Link from 'next/link';

type Props = {
  label?: React.ReactNode;
  value?: React.ReactNode;
  title?: React.ReactNode;
  body?: React.ReactNode;
  action?: {
    title: string;
    href: string;
  };
  className?: string;
};

const Card = ({ label, value, title, body, action, className }: Props) => {
  const cardLabel = label ?? body;
  const cardValue = value ?? title;

  return (
    <div
      className={twMerge(
        'flex flex-col rounded-2xl border border-border bg-card text-card-fg shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-6">
        {cardLabel && (
          <div className="text-xs font-medium uppercase tracking-wider text-muted">
            {cardLabel}
          </div>
        )}
        {cardValue && (
          <div className="text-2xl font-semibold tracking-tight">
            {cardValue}
          </div>
        )}
        {action && (
          <Link
            href={action.href}
            className="mt-auto inline-flex w-fit items-center gap-1.5 pt-2 text-sm font-medium text-accent transition-colors hover:underline"
          >
            {action.title}
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
};

export default Card;
