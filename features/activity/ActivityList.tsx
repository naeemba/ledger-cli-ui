import ActivityRow from './ActivityRow';
import { buildActivityQuery } from './params';
import { buttonVariants } from '@/components/ui/button';
import type { AuditLog } from '@/db/schema/auditLog';
import type { ActivityType, ResultFilter } from '@/lib/audit';
import Link from 'next/link';

const TYPE_TABS: { value: ActivityType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'imports', label: 'Imports' },
  { value: 'security', label: 'Security' },
];

const RESULT_TABS: { value: ResultFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failures' },
];

const Tabs = <T extends string>({
  tabs,
  active,
  href,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  href: (value: T) => string;
}) => (
  <div className="flex flex-wrap gap-1">
    {tabs.map((t) => (
      <Link
        key={t.value}
        href={href(t.value)}
        className={buttonVariants({
          variant: t.value === active ? 'default' : 'ghost',
          size: 'sm',
        })}
      >
        {t.label}
      </Link>
    ))}
  </div>
);

const ActivityList = ({
  rows,
  type,
  result,
  nextCursor,
}: {
  rows: AuditLog[];
  type: ActivityType;
  result: ResultFilter;
  nextCursor: string | null;
}) => (
  <div className="flex flex-col gap-6">
    <h1 className="text-2xl font-semibold">Activity</h1>

    <div className="flex flex-col gap-3">
      <Tabs
        tabs={TYPE_TABS}
        active={type}
        href={(value) =>
          `/settings/activity${buildActivityQuery({ type: value, result })}`
        }
      />
      <Tabs
        tabs={RESULT_TABS}
        active={result}
        href={(value) =>
          `/settings/activity${buildActivityQuery({ type, result: value })}`
        }
      />
    </div>

    {rows.length === 0 ? (
      <p className="text-muted">No activity matches these filters yet.</p>
    ) : (
      <div className="flex flex-col">
        {rows.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </div>
    )}

    {nextCursor && (
      <Link
        href={`/settings/activity${buildActivityQuery({ type, result, before: nextCursor })}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Load older
      </Link>
    )}
  </div>
);

export default ActivityList;
