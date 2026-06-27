import formatWhen from './formatWhen.util';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AuditLog } from '@/db/schema/auditLog';
import { describeAuditEvent } from '@/lib/audit/describe';
import Link from 'next/link';

const ActivityCard = ({ rows }: { rows: AuditLog[] }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Activity</CardTitle>
      <Link
        href="/settings/activity"
        className={buttonVariants({ variant: 'link', size: 'sm' })}
      >
        View all activity →
      </Link>
    </CardHeader>
    <CardContent>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((row) => {
            const { label, icon } = describeAuditEvent(row);
            return (
              <li key={row.id} className="flex items-center gap-3">
                <span
                  className={`shrink-0 ${icon === 'success' ? 'text-positive' : 'text-negative'}`}
                  aria-hidden
                >
                  {icon === 'success' ? '✓' : '✗'}
                </span>
                <span className="flex-1">{label}</span>
                <time
                  className="shrink-0 text-muted-foreground"
                  dateTime={new Date(row.createdAt).toISOString()}
                >
                  {formatWhen(row.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default ActivityCard;
