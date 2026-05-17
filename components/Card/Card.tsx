import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { buttonVariants } from '@/components/ui/button';
import { Card as ShadcnCard } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
    <ShadcnCard className={cn('flex flex-1 flex-col px-6 py-6', className)}>
      {cardLabel && (
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {cardLabel}
        </div>
      )}
      {cardValue && (
        <div className="text-2xl font-semibold tracking-tight">{cardValue}</div>
      )}
      {action && (
        <Link
          href={action.href}
          className={cn(
            buttonVariants({ variant: 'link', size: 'sm' }),
            'mt-auto w-fit px-0'
          )}
        >
          {action.title}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}
    </ShadcnCard>
  );
};

export default Card;
