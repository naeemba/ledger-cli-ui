import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  rows?: number;
  showChart?: boolean;
};

const PageSkeleton = ({ rows = 8, showChart = false }: Props) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-32" />
      </div>
    </div>

    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </Card>

    {showChart && (
      <Card>
        <Skeleton className="mx-4 h-72" />
      </Card>
    )}
  </div>
);

export default PageSkeleton;
