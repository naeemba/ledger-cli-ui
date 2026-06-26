import type { AuditLog } from '@/db/schema/auditLog';
import { describeAuditEvent } from '@/lib/audit/describe';
import getDefaultDateLocale from '@/utils/getDefaultDateLocale';

const formatWhen = (d: Date): string =>
  new Date(d).toLocaleString(getDefaultDateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const DetailLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2">
    <span className="w-24 shrink-0 text-muted">{label}</span>
    <span className="break-all tabular-nums">{value}</span>
  </div>
);

const ActivityRow = ({ row }: { row: AuditLog }) => {
  const { label, icon } = describeAuditEvent(row);
  const hasBytes = row.bytesBefore !== null || row.bytesAfter !== null;
  const detailJson =
    row.detail && Object.keys(row.detail as object).length > 0
      ? JSON.stringify(row.detail)
      : null;

  return (
    <details className="border-b border-border py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span
          className={`shrink-0 font-medium ${icon === 'success' ? 'text-positive' : 'text-negative'}`}
          aria-hidden
        >
          {icon === 'success' ? '✓' : '✗'}
        </span>
        <span className="flex-1">{label}</span>
        <time
          className="shrink-0 text-muted"
          dateTime={new Date(row.createdAt).toISOString()}
        >
          {formatWhen(row.createdAt)}
        </time>
      </summary>
      <div className="mt-2 flex flex-col gap-1 pl-6 text-muted">
        {row.targetUid && <DetailLine label="uid" value={row.targetUid} />}
        {hasBytes && (
          <DetailLine
            label="bytes"
            value={`${row.bytesBefore ?? '—'} → ${row.bytesAfter ?? '—'}`}
          />
        )}
        {row.ip && <DetailLine label="ip" value={row.ip} />}
        {row.userAgent && <DetailLine label="device" value={row.userAgent} />}
        {detailJson && <DetailLine label="detail" value={detailJson} />}
      </div>
    </details>
  );
};

export default ActivityRow;
