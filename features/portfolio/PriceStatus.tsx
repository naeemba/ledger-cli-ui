import 'server-only';
import { env } from '@/lib/env';
import { priceFetchRunRepository } from '@/lib/prices';

const formatRelative = (d: Date): string => {
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const computeNextRun = (hour: number): Date => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

const PriceStatus = async () => {
  const latest = await priceFetchRunRepository.latest();
  const nextRun = computeNextRun(env.PRICE_REFRESH_HOUR);
  const nextRunLabel = nextRun.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  let primary: string;
  if (!latest) {
    primary = 'Last refresh: never';
  } else if (latest.status === 'failed') {
    primary = `Refresh failed ${formatRelative(latest.startedAt)}${
      latest.errorMessage ? ` — ${latest.errorMessage}` : ''
    }`;
  } else {
    const completed = latest.completedAt ?? latest.startedAt;
    const total = latest.symbolsFetched + latest.symbolsFailed;
    primary = `Last refresh: ${formatRelative(completed)} · ${latest.symbolsFetched}/${total || latest.symbolsFetched} symbols`;
  }

  return (
    <div className="flex flex-col text-sm text-muted-foreground">
      <span>{primary}</span>
      <span>Next scheduled refresh: {nextRunLabel}</span>
    </div>
  );
};

export default PriceStatus;
